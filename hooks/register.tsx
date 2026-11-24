import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Review } from '../types'
import { activityOf, cut } from './activity'
import {
  AGENTS_DIR,
  ARCHITECT_SYSTEM,
  architectTask,
  changesFor,
  fingerprint,
  isStale,
  parsePlan,
  readFile,
  renderFile,
  type Existing,
  type PlannedAgent,
} from './crew'
import { langFrom, words, type Lang } from './i18n'
import { familyOf, mascot } from './mascots'

const PLUGIN = 'agent-crew'
const PANE = 'agent-crew'
const ARCHITECT = 'architect'
const ARCHITECT_TYPE = `${PLUGIN}:${ARCHITECT}`
const KEEP = 30 // subagents remembered
const SHOW_DONE = 4 // finished ones shown under the running ones
const REVIEW_TIMEOUT_MS = 10 * 60_000

// Bright colours that read on light and dark themes; each running subagent gets its own.
export const PALETTE = [
  '#A855F7',
  '#22D3EE',
  '#F59E0B',
  '#EC4899',
  '#22C55E',
  '#3B82F6',
  '#F97316',
  '#14B8A6',
]

// Change a tag when the shape of its value changes: what an older version stored is
// then declined instead of misread.
const agents = atom({ plugin: 'agent-crew', key: 'agents' } as const, [], { shape: 'agents-2' })
const review = atom(
  { plugin: 'agent-crew', key: 'review' } as const,
  { status: 'idle', message: '', at: 0 } as Review,
  { shape: 'review-1' },
)
const lang = atom({ plugin: 'agent-crew', key: 'lang' } as const, 'en' as Lang)

export function colorFor(taken: string[]): string {
  return PALETTE.find(c => !taken.includes(c)) ?? PALETTE[taken.length % PALETTE.length] ?? '#A855F7'
}

export function shortType(type: string): string {
  return type.replace(/^[^:]+:/, '')
}

function elapsed(a: Agent): string {
  const s = Math.max(1, Math.round(((a.endedAt ?? a.startedAt) - a.startedAt) / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

type Options = { language?: string; analysisModel?: string; autoReview?: boolean }

// What this load of the module knows (a reload starts it over; the stored values stay).
let opts: Options = {}
// Answers of our own architect, by agent id (its turn.complete resolves them).
const waiting = new Map<string, (answer: string | null) => void>()
let root = ''
let crew: string[] = [] // the project's generated subagents, for the system prompt note
let reviewing = false

async function w($: EngineInterface) {
  return words(await read($, lang))
}

export const register: Register = (on, options) => {
  opts = (options ?? {}) as Options

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'crew', description: words('en').commandDescription })
    await $.command.register({
      name: 'crew-review',
      description: words('en').reviewCommandDescription,
    })
    await update($, lang, () => 'en')
    void detectLang($).then(l => update($, lang, () => l))
    try {
      await $.agent.register({
        name: ARCHITECT,
        description: 'Agent Crew: designs the subagents of the current project (internal).',
        prompt: ARCHITECT_SYSTEM,
        tools: ['Read', 'Grep', 'Glob'],
        model: opts.analysisModel || 'sonnet',
      })
    } catch (err) {
      $.ui.log(`agent-crew: could not register the architect: ${String(err)}`, { to: 'debug' })
    }
    root = await projectRoot($, e.cwd)
    crew = await generatedNames($)
    // After the session has settled, offer to set up the project or check it is up to date.
    $.clock.after(2500, () => void setUpOrReview($, false))

    return started
  })

  // The architect is the mod's own: the main assistant never sees it as an option.
  on('agent.offer', { agent: ARCHITECT_TYPE }, () => ({ isOffered: false })).catch(
    ($, e, next) => next(e),
  )

  on('command.run', { command: 'crew' }, async $ => {
    const shown = await togglePane($)
    return { text: shown ? 'Agent Crew panel opened.' : 'Agent Crew panel closed.' }
  })

  on('command.run', { command: 'crew-review' }, async $ => {
    void setUpOrReview($, true)
    return { text: 'Agent Crew is reviewing the project subagents.' }
  })

  // --- following the subagents ---------------------------------------------------------

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || started.agentId === undefined) return started
    const agentId = started.agentId
    const now = await $.clock.now()
    const t = await w($)
    await update($, agents, list => {
      const taken = list.filter(a => a.status === 'run').map(a => a.color)
      const agent: Agent = {
        id: agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        color: colorFor(taken),
        status: 'run',
        activity: t.starting,
        steps: 0,
        startedAt: now,
      }
      return [...list.filter(a => a.id !== agentId), agent].slice(-KEEP)
    })
    return started
  }).catch(($, e, next) => next(e)) // the panel only watches: a failure never stops a spawn

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const text = activityOf(e.tool, e as unknown as Record<string, unknown>, await w($))
      await update($, agents, list =>
        list.map(a =>
          a.id === agentId && a.status === 'run' ? { ...a, activity: text, steps: a.steps + 1 } : a,
        ),
      )
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // the panel only watches: a failure never stops a tool

  on('turn.start', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const t = await w($)
      await update($, agents, list =>
        list.map(a =>
          a.id === agentId && a.status !== 'run'
            ? { ...a, status: 'run' as const, activity: t.resuming, endedAt: undefined }
            : a,
        ),
      )
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const now = await $.clock.now()
      const stopped = e.isAborted
      await update($, agents, list =>
        list.map(a =>
          a.id === agentId
            ? { ...a, status: stopped ? ('fail' as const) : ('done' as const), endedAt: now }
            : a,
        ),
      )
      waiting.get(agentId)?.(stopped ? null : e.answer)
      waiting.delete(agentId)
    }
    return next(e)
  })

  // --- the project's subagents -----------------------------------------------------------

  // --- the system prompt: point the main assistant at its crew -------------------------

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (crew.length === 0) return composed
    return {
      sections: [
        ...composed.sections,
        {
          id: 'agent-crew',
          scope: 'session' as const,
          text:
            `# Agent Crew\nThis project has subagents designed for it in ${AGENTS_DIR}/ ` +
            `(${crew.join(', ')}). Delegate the bounded tasks that match their descriptions to ` +
            'them, which saves usage; keep design, core changes, security and reviews yourself, ' +
            'and check what they return before relying on it.',
        },
      ],
    }
  })

  // --- drawing: the band above the prompt and the panel ----------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const t = await w($)
    const running = (await read($, agents)).filter(a => a.status === 'run').length
    const label = running ? t.bandRunning(running) : t.bandIdle
    return (
      <Box flexDirection="row">
        <Button key="crew" label={label} onPress={() => void togglePane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const t = await w($)
    const list = await read($, agents)
    const state = await read($, review)
    const running = list.filter(a => a.status === 'run')
    const finished = list
      .filter(a => a.status !== 'run')
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, SHOW_DONE)

    const row = (a: Agent) => {
      const family = familyOf(a.model)
      const figure =
        Svg === undefined ? (
          <Text color={a.color}>{a.status === 'run' ? '●' : a.status === 'done' ? '✓' : '✗'}</Text>
        ) : (
          <Svg
            source={mascot(family, a.status, a.color, a.id)}
            alt={`${shortType(a.type)}, ${t.mood[a.status]}`}
            width={40}
            height={40}
          />
        )
      const detail =
        a.status === 'run'
          ? a.activity
          : a.status === 'done'
            ? t.doneIn(elapsed(a), a.steps)
            : t.stoppedAfter(elapsed(a))
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          {figure}
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            <Box flexDirection="row">
              <Text color={a.color} weight="semibold">
                {shortType(a.type)}
              </Text>
              <Text dimColor> · {modelName(a.model)}</Text>
            </Box>
            <Text dimColor={a.status !== 'run'}>{detail}</Text>
            {a.status === 'run' && a.description && <Text dimColor>{cut(a.description, 60)}</Text>}
          </Box>
          {a.status === 'run' && (
            <Button
              key={`view-${a.id}`}
              label={t.view}
              onPress={() => void $.ui.view({ agentId: a.id })}
            />
          )}
        </Box>
      )
    }

    const projectLine =
      state.status === 'running'
        ? t.reviewing
        : crew.length
          ? `${t.projectCount(crew.length)}${state.message ? ` · ${state.message}` : ''}`
          : state.message || t.reviewOff

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{running.length ? t.running(running.length) : t.none}</Text>
        {running.map(row)}
        {finished.length > 0 && <Text dimColor>{t.finished}</Text>}
        {finished.map(row)}
        <Box flexDirection="column" gap={0}>
          <Text weight="semibold">{t.project}</Text>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text dimColor>{projectLine}</Text>
            {state.status !== 'running' && (
              <Button
                key="review"
                label={crew.length ? t.reviewNow : t.setUp}
                onPress={() => void setUpOrReview($, true)}
              />
            )}
          </Box>
        </Box>
      </Box>
    )
  })

  // --- helpers that reach the machine ----------------------------------------------------

  /** Never a permanent delete: Windows' recycle bin, or the system's trash elsewhere. */
}

export function modelName(model: string): string {
  const family = familyOf(model)
  return family === 'other' ? model : family.charAt(0).toUpperCase() + family.slice(1)
}

// --- helpers (top level: the engine follows `$` only through these) ------------------

async function setUpOrReview($: EngineInterface, asked: boolean) {
  if (!root) return
  const t = await w($)
  const key = `consent:${root}`
  let consent = (await $.store.get(key)) as string | undefined
  if (consent !== 'yes') {
    if (consent === 'no' && !asked) return
    if (!asked && !(await isProject($))) return
    let answer: string
    try {
      answer = await $.ui.ask(t.ask, {
        header: t.askTitle,
        options: [t.askYes, t.askLater, t.askNever],
      })
    } catch {
      return // nobody to ask (a -p run) or dismissed
    }
    if (answer === t.askNever) await $.store.set(key, 'no')
    if (answer !== t.askYes) return
    consent = 'yes'
    await $.store.set(key, 'yes')
    await runReview($)
    return
  }
  if (asked) {
    await runReview($)
    return
  }
  if (opts.autoReview === false) return
  const last = (await $.store.get(`last:${root}`)) as { head?: string; at: number } | undefined
  const head = await gitHead($)
  const since = last?.head && head ? await commitsBetween($, last.head) : null
  if (crew.length === 0 || isStale(last, await $.clock.now(), since)) await runReview($)
}

async function runReview($: EngineInterface) {
  if (reviewing) return
  reviewing = true
  const t = await w($)
  const now = await $.clock.now()
  await update($, review, () => ({ status: 'running', message: t.reviewing, at: now }))
  try {
    const { ours, theirs } = await existingAgents($)
    const task = architectTask(
      ours.map(o => ({ name: o.name, description: readFile(o.file, o.text).description })),
      theirs,
    )
    const spawned = await $.agent.spawn({
      subagentType: ARCHITECT_TYPE,
      description: t.reviewing.replace(/…$/, ''),
      prompt: task,
    })
    if (spawned.deny !== undefined || spawned.agentId === undefined) {
      throw new Error(spawned.deny ?? `not started: ${JSON.stringify(spawned)}`)
    }
    const answer = await answerOf($, spawned.agentId)
    const plan = answer === null ? null : parsePlan(answer)
    if (plan === null) throw new Error('no plan')
    const writtenKey = `written:${root}`
    const written = ((await $.store.get(writtenKey)) ?? {}) as Record<string, string>
    const changes = changesFor(
      plan,
      ours,
      written,
      theirs.map(x => x.name),
    )
    const fresh: PlannedAgent[] = [...changes.create, ...changes.update.map(u => u.agent)]
    for (const agent of fresh) {
      const text = renderFile(agent)
      await $.fs.write(`${root}/${AGENTS_DIR}/${agent.name}.md`, text)
      written[agent.name] = fingerprint(text)
      // Usable right away; from the next session on, Claude Code loads the file itself.
      await $.agent
        .register({
          name: agent.name,
          description: agent.description,
          prompt: agent.prompt,
          ...(agent.model !== 'inherit' ? { model: agent.model } : {}),
          ...(agent.tools.length ? { tools: agent.tools } : {}),
        })
        .catch(() => undefined)
    }
    let removed = 0
    for (const file of changes.remove) {
      if (await toRecycleBin($, `${root}/${AGENTS_DIR}/${file}`)) {
        removed += 1
        delete written[file.replace(/\.md$/, '')]
      }
    }
    await $.store.set(writtenKey, written)
    await $.store.set(`last:${root}`, { head: await gitHead($), at: await $.clock.now() })
    crew = await generatedNames($)
    const message = t.reviewDone(
      changes.create.length,
      changes.update.length,
      removed,
      changes.kept.length,
    )
    await update($, review, () => ({ status: 'done', message, at: now }))
    $.ui.toast(`Agent Crew: ${message}`)
  } catch (err) {
    $.ui.log(`agent-crew: review failed: ${String(err)}`, { to: 'debug' })
    await update($, review, () => ({ status: 'error', message: t.reviewFailed, at: now }))
  } finally {
    reviewing = false
  }
}

function answerOf(
  $: EngineInterface,
  agentId: string,
): Promise<string | null> {
  return new Promise(resolve => {
    waiting.set(agentId, resolve)
    $.clock.after(REVIEW_TIMEOUT_MS, () => {
      if (waiting.delete(agentId)) resolve(null)
    })
  })
}

async function existingAgents($: EngineInterface) {
  const dir = `${root}/${AGENTS_DIR}`
  const ours: Existing[] = []
  const theirs: { name: string; description: string }[] = []
  if (!(await $.fs.exists(dir))) return { ours, theirs }
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    const text = await $.fs.read(`${dir}/${entry.name}`)
    const info = readFile(entry.name, text)
    if (info.isGenerated) ours.push({ file: entry.name, name: info.name, text })
    else theirs.push({ name: info.name, description: info.description })
  }
  return { ours, theirs }
}

async function generatedNames($: EngineInterface) {
  try {
    return (await existingAgents($)).ours.map(o => o.name)
  } catch {
    return []
  }
}

async function isProject($: EngineInterface) {
  return (await gitHead($)) !== null
}

async function gitHead($: EngineInterface): Promise<string | null> {
  const r = await $.process.run(['git', 'rev-parse', 'HEAD'], { cwd: root }).catch(() => null)
  return r && r.exitCode === 0 ? r.stdout.trim() : null
}

async function commitsBetween($: EngineInterface, from: string) {
  const r = await $.process
    .run(['git', 'rev-list', '--count', `${from}..HEAD`], { cwd: root })
    .catch(() => null)
  return r && r.exitCode === 0 ? Number(r.stdout.trim()) : null
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const open = (await $.ui.panes()).some((p: { id: string }) => p.id === PANE)
  if (open) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: (await w($)).title })
  return true
}

async function detectLang($: EngineInterface): Promise<Lang> {
  const chosen = (opts.language ?? 'auto').toLowerCase()
  if (chosen === 'en' || chosen === 'es') return chosen
  const cached = (await $.store.get('lang')) as Lang | undefined
  const { sysname } = await $.session.machine()
  const argv = /win/i.test(sysname)
    ? ['powershell', '-NoProfile', '-Command', '(Get-UICulture).Name']
    : ['sh', '-c', 'printf %s "${LC_ALL:-${LC_MESSAGES:-$LANG}}"']
  const r = await $.process.run(argv, { timeoutMs: 8000 }).catch(() => null)
  if (r && r.exitCode === 0 && r.stdout.trim()) {
    const found = langFrom(r.stdout)
    if (found !== cached) await $.store.set('lang', found)
    return found
  }
  return cached ?? 'en'
}

async function projectRoot($: EngineInterface, cwd: string) {
  const r = await $.process
    .run(['git', 'rev-parse', '--show-toplevel'], { cwd })
    .catch(() => null)
  return r && r.exitCode === 0 ? r.stdout.trim() : cwd
}

async function toRecycleBin($: EngineInterface, path: string) {
  const { sysname } = await $.session.machine()
  // Inside single quotes PowerShell takes everything literally except a quote, doubled.
  const quoted = `'${path.replace(/\//g, '\\').replace(/'/g, "''")}'`
  const argv = /win/i.test(sysname)
    ? [
        'powershell',
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName Microsoft.VisualBasic; ' +
          `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(${quoted}, ` +
          "'OnlyErrorDialogs', 'SendToRecycleBin')",
      ]
    : /darwin/i.test(sysname)
      ? ['osascript', '-e', `tell application "Finder" to delete POSIX file "${path}"`]
      : ['gio', 'trash', path]
  const r = await $.process.run(argv, { timeoutMs: 15_000 }).catch(() => null)
  return r !== null && r.exitCode === 0
}
