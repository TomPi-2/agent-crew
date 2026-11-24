// The project's own subagents: what the architect is asked, how its answer is read, and
// which files in .claude/agents/ to create, update or remove. No I/O here: register.tsx
// does the reading and writing, so all of this can be tested on its own.

import type { Lang } from './i18n'

/** Marks a file as Agent Crew's: only files with it are ever updated or removed. */
export const MARKER = '<!-- agent-crew:generated -->'
export const AGENTS_DIR = '.claude/agents'

export const MODELS = ['haiku', 'sonnet', 'opus', 'inherit'] as const
export type Model = (typeof MODELS)[number]

/** Tools a generated subagent may be given. */
export const TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Edit',
  'Write',
  'Bash',
  'PowerShell',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
] as const

export type PlannedAgent = {
  name: string
  description: string
  model: Model
  tools: string[]
  prompt: string
}

export type Plan = { agents: PlannedAgent[]; summary: string }

const NAME = /^[a-z0-9][a-z0-9-]{1,39}$/
const MAX_AGENTS = 8

function asText(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
}

/** The architect's answer → a checked plan, or null if it is not one. */
export function parsePlan(answer: string): Plan | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)?.[1]
  const raw = fenced ?? answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const list = (data as { agents?: unknown }).agents
  if (!Array.isArray(list)) return null
  const agents: PlannedAgent[] = []
  const seen = new Set<string>()
  for (const item of list.slice(0, MAX_AGENTS)) {
    if (typeof item !== 'object' || item === null) continue
    const a = item as Record<string, unknown>
    const name = typeof a.name === 'string' ? a.name.trim().toLowerCase() : ''
    const description = asText(a.description, 800)
    const prompt = asText(a.prompt, 12_000)
    const model = MODELS.includes(a.model as Model) ? (a.model as Model) : 'inherit'
    if (!NAME.test(name) || seen.has(name) || !description || !prompt) continue
    const tools = Array.isArray(a.tools)
      ? a.tools.filter((t): t is string => (TOOLS as readonly string[]).includes(t as string))
      : []
    seen.add(name)
    agents.push({ name, description, model, tools: [...new Set(tools)], prompt })
  }
  const summary = typeof (data as { summary?: unknown }).summary === 'string'
    ? ((data as { summary: string }).summary).slice(0, 300)
    : ''
  return { agents, summary }
}

/** The file for one subagent: frontmatter, the marker, then its system prompt. */
export function renderFile(a: PlannedAgent): string {
  const lines = ['---', `name: ${a.name}`, `description: ${JSON.stringify(a.description)}`]
  if (a.model !== 'inherit') lines.push(`model: ${a.model}`)
  if (a.tools.length) lines.push(`tools: ${a.tools.join(', ')}`)
  lines.push('---', '', MARKER, '', a.prompt.trim(), '')
  return lines.join('\n')
}

export type AgentFile = { name: string; isGenerated: boolean; description: string }

/** What an agent file in .claude/agents/ is: its name, and whether it is ours. */
export function readFile(fileName: string, text: string): AgentFile {
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? fileName.replace(/\.md$/, '')
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
  return { name, isGenerated: text.includes(MARKER), description }
}

/** A short, stable fingerprint of a file's text (FNV-1a). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

export type Existing = {
  /** File name (`name.md`). */
  file: string
  name: string
  text: string
}

export type Changes = {
  create: PlannedAgent[]
  update: { file: string; agent: PlannedAgent }[]
  remove: string[]
  /** Ours, but edited by the person since we wrote them: left as they are. */
  kept: string[]
}

/**
 * What to do with the plan. Only files of ours are touched, and only while they still hold
 * exactly what we wrote (`written`: name → fingerprint): a person's edit is never overwritten
 * or removed.
 */
export function changesFor(
  plan: Plan,
  ours: Existing[],
  written: Record<string, string>,
  theirs: string[],
): Changes {
  const changes: Changes = { create: [], update: [], remove: [], kept: [] }
  const byName = new Map(ours.map(e => [e.name, e]))
  const isUntouched = (e: Existing) => written[e.name] === fingerprint(e.text)
  for (const agent of plan.agents) {
    if (theirs.includes(agent.name)) continue // the person has their own with this name
    const old = byName.get(agent.name)
    if (old === undefined) {
      changes.create.push(agent)
    } else if (!isUntouched(old)) {
      changes.kept.push(old.name)
    } else if (old.text !== renderFile(agent)) {
      changes.update.push({ file: old.file, agent })
    }
  }
  const planned = new Set(plan.agents.map(a => a.name))
  for (const old of ours) {
    if (planned.has(old.name)) continue
    if (isUntouched(old)) changes.remove.push(old.file)
    else changes.kept.push(old.name)
  }
  return changes
}

// --- the architect ---------------------------------------------------------------------

export const ARCHITECT_SYSTEM = `You are Agent Crew's architect. You study a software project and design a small crew of Claude Code subagents for it: specialists the main assistant can delegate bounded tasks to, so that the work is done well while saving usage (cheaper models for mechanical work).

How to study the project, read-only and quickly: the README and any CLAUDE.md, AGENTS.md or contributing guide first; the build and dependency files (package.json, pyproject.toml, Cargo.toml…); the top-level folders; a few representative files of each main part; the tests and scripts. Do not read everything.

What makes a good crew:
- 2 to 6 subagents, each for a kind of task that comes up often in THIS project and can be handed over with a clear brief: searching the codebase, reading logs or long outputs, running and summarising tests, generating data or fixtures, updating docs or translations, a specialist for one well-separated part of the code.
- Never duplicate Claude Code's built-in agents (general-purpose, Explore, Plan) nor the person's own agents listed in the task.
- The cheapest model that does the job well: haiku for searching, reading and summarising; sonnet for writing code or text within a clear scope; opus only for deep reasoning that cannot be avoided. Never design, architecture, security or code review agents that would replace the main assistant's judgement.
- The fewest tools that do the job: read-only agents get Read, Grep, Glob (and Bash only to run read-only commands such as tests). Only agents whose job is to write get Edit or Write.
- description: one or two sentences saying WHEN to delegate to it, concrete about this project, written in the language the task names (the person reads it): in English it starts with "Use for", in Spanish with "Úsalo para".
- prompt: the subagent's system prompt, in the project's main language: what it does, the project facts it needs (paths, commands, conventions), what it must never do, and the exact shape of the report it returns (short, with file:line references).
- Keep the names of existing generated agents that are still useful, so they are updated rather than replaced; drop the ones that no longer fit.

Answer with ONLY a JSON object in a \`\`\`json block, nothing else:
{"summary": "one line about the crew", "agents": [{"name": "kebab-case-name", "description": "Use for ...", "model": "haiku|sonnet|opus", "tools": ["Read", "Grep"], "prompt": "..."}]}`

export function architectTask(
  ours: { name: string; description: string }[],
  theirs: { name: string; description: string }[],
  language: Lang = 'en',
): string {
  const list = (xs: { name: string; description: string }[]) =>
    xs.length ? xs.map(x => `- ${x.name}: ${x.description}`).join('\n') : '- (none)'
  return [
    'Design the subagent crew for the project in the current working directory.',
    '',
    language === 'es'
      ? 'Write every description in Spanish, the language of the person, starting with "Úsalo para".'
      : 'Write every description in English, the language of the person, starting with "Use for".',
    '',
    'Agents generated earlier by Agent Crew (update, keep or drop them):',
    list(ours),
    '',
    "The person's own agents (never duplicate or rename these):",
    list(theirs),
  ].join('\n')
}

/** Whether the project has changed enough since the last review to look again. */
export function isStale(
  last: { head?: string; at: number } | undefined,
  now: number,
  commitsSince: number | null,
): boolean {
  if (last === undefined) return true
  const days = (now - last.at) / 86_400_000
  if (commitsSince !== null) return commitsSince >= 20 || (commitsSince > 0 && days >= 14)
  return days >= 14
}
