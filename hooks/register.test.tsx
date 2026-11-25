import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { isExpired } from './register'

// The test runner has timers; the mod's own types do not declare them.
declare const setTimeout: (run: () => void, ms: number) => unknown

const PANE = {
  plugin: 'agent-crew',
  component: 'Pane',
  requestId: 'agent-crew',
  props: {
    title: 'Agent Crew',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// /crew as the person types it, in a terminal wide enough for a pane.
const CREW = {
  command: 'crew',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

const BAND = {
  plugin: 'agent-crew',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

// The engine, as far as the mod needs it: a clock, a project in git, a machine.
function engine(
  on: Parameters<TestBody>[1],
  lang = 'es-ES',
  stored: Record<string, unknown> = {},
) {
  let now = 1_000
  on('store.get', (_, e) => ({ value: stored[(e as { key: string }).key] }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    stored[key] = value
    return { value: undefined }
  })
  on('clock.now', () => ({ value: (now += 1_000) }))
  on('clock.after', () => ({ value: undefined }))
  on('session.machine', () => ({
    value: {
      sysname: 'Windows_NT',
      release: '10',
      machine: 'x86_64',
      packageManagers: [],
      runtimes: [],
    },
  }))
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    const out =
      argv[0] === 'powershell' && argv.join(' ').includes('Get-UICulture')
        ? lang
        : argv.includes('--show-toplevel')
          ? 'C:/proj'
          : argv.includes('HEAD')
            ? 'abc123'
            : '0'
    return {
      value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('command.register', (_, e) => ({ value: { command: (e as { name: string }).name } }))
  on('agent.register', (_, e) => ({ value: { agent: `agent-crew:${(e as { name: string }).name}` } }))
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }))
}

test('a subagent at work: its character, what it does, and when it is done', async ($, on) => {
  engine(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: 'ok' }))

  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()
  await $.agent.spawn({
    prompt: 'find it',
    description: 'Find parse_config',
    subagentType: 'Explore',
  } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'parse_config', agentId: 'a1' })

  for (const surface of ['vscode', 'desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^Explore$/ }))?.text).toBe('Explore')
    expect((await ui.find({ type: 'Text', text: /Haiku/ }))?.text).toBe(' · Haiku')
    expect((await ui.find({ type: 'Text', text: /parse_config»/ }))?.text).toBe('Buscando «parse_config»')
    await ui.unmount()
  }

  await $.turn.complete({
    answer: 'found',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    agentId: 'a1',
    reason: 'completed',
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Hecho en/ }))?.text).toMatch(/1 paso$/)
  expect((await ui.find({ type: 'Text', text: /Ningún/ }))?.text).toBe('Ningún subagente en marcha')
  await ui.unmount()
})

test('a finished subagent has a cross that takes it off; View says why it cannot show one', async ($, on) => {
  engine(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `a${++n}` }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('ui.view', () => ({ value: { deny: 'no tasks list here' } }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()
  for (const description of ['uno', 'dos', 'tres']) {
    await $.agent.spawn({ prompt: 'x', description, subagentType: 'Explore' } as never)
  }

  let ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'view-a1' })
  expect(toasts.at(-1)).toBe('No se puede mostrar este subagente: no tasks list here')
  await ui.unmount()

  for (const agentId of ['a1', 'a2']) {
    await $.turn.complete({
      answer: 'ok', durationMs: 1, isAborted: false, turnId: `t-${agentId}`, agentId, reason: 'completed',
    } as never)
  }
  for (const surface of ['vscode', 'desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect(await pane.find({ type: 'Button', key: 'dismiss-a3' })).toBeUndefined() // still running
    expect(await pane.find({ type: 'Button', key: 'dismiss-a1' })).toBeDefined()
    await pane.unmount()
  }
  ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: 'dismiss-a1' })
  expect(await ui.find({ type: 'Button', key: 'dismiss-a1' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'dismiss-a2' })).toBeDefined()
  await ui.press({ key: 'clear-finished' })
  expect(await ui.find({ type: 'Button', key: 'dismiss-a2' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'view-a3' })).toBeDefined()
  await ui.unmount()
})

test('a finished subagent leaves the panel ten minutes after it ended', () => {
  const a = {
    id: 'a', type: 'Explore', description: '', model: 'haiku', color: '#fff',
    activity: '', steps: 1, startedAt: 0, endedAt: 1_000,
  }
  expect(isExpired({ ...a, status: 'done' }, 1_000 + 9 * 60_000)).toBe(false)
  expect(isExpired({ ...a, status: 'fail' }, 1_000 + 10 * 60_000)).toBe(true)
  expect(isExpired({ ...a, status: 'run' }, 1_000 + 60 * 60_000)).toBe(false)
})

test('in VS Code, the quiet button above the prompt opens and closes the panel', async ($, on) => {
  engine(on, 'en-US')
  let open = false
  on('ui.panes', () => ({
    value: open
      ? [{ id: 'agent-crew', title: 'Agent Crew', isShown: true, isFocused: false, isPlaced: true }]
      : [],
  }))
  on('ui.open', () => {
    open = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    open = false
    return { value: undefined }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()

  for (const surface of ['vscode', 'terminal'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    const button = await band.find({ type: 'Button', key: 'crew' })
    expect(button?.text).toBe('Agent Crew')
    await band.press({ key: 'crew' })
    expect(open).toBe(true)
    await band.press({ key: 'crew' })
    expect(open).toBe(false)
    await band.unmount()
  }
})

test('with permission, a review asks the architect about this project', async ($, on) => {
  engine(on, 'es-ES', { 'consent:C:/proj': 'yes' }) // the person already said yes
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.exists', () => ({ value: false }))
  const spawns: { subagent_type?: string; prompt?: string }[] = []
  on('agent.spawn', (_, e) => {
    spawns.push(e as { subagent_type?: string; prompt?: string })
    return { deny: 'not in a test' }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()
  await $.command.run({ command: 'crew-review', args: '' } as never)
  await settle()

  expect(spawns[0]?.subagent_type).toBe('agent-crew:architect')
  expect(spawns[0]?.prompt).toContain('Design the subagent crew')
  // It could not finish here: the panel says so and offers to try again.
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await ui.find({ type: 'Text', text: /revisión/ }))?.text).toBe(
    'La revisión no ha podido terminar',
  )
  expect((await ui.find({ type: 'Button', key: 'review' }))?.text).toBe('Configurar')
  await ui.unmount()
})

test('in the desktop app, the button sits beside the message box, not above it', async ($, on) => {
  engine(on, 'en-US')
  let open = false
  on('ui.panes', () => ({
    value: open
      ? [{ id: 'agent-crew', title: 'Agent Crew', isShown: true, isFocused: false, isPlaced: true }]
      : [],
  }))
  on('ui.open', () => {
    open = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    open = false
    return { value: undefined }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
  await settle()

  const beside = await $.ui.mount({
    plugin: 'agent-crew',
    component: 'BesidePrompt',
    surface: 'desktop',
    props: { maxColumns: 30, floatRows: 10, floatColumns: 60, isWorking: false, view: {} },
  } as const)
  const cell = await beside.find({ type: 'Client', key: 'crew-toggle' } as never)
  expect((cell?.props as { props?: { label?: string } }).props?.label).toBe('Agent Crew')
  await beside.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: 'crew-toggle' })
  await settle()
  expect(open).toBe(true)
  await beside.pointer({ type: 'up', x: 1, y: 0, button: 'left', in: 'crew-toggle' })
  await settle()
  expect(open).toBe(false)

  // With the button beside the message box drawn, none above it.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Button', key: 'crew' })).toBe(undefined)
  await band.unmount()
  await beside.unmount()
})

test('in the desktop app, with no room beside the message box, the button is above it', async ($, on) => {
  engine(on, 'en-US')
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })
  await settle()

  const beside = await $.ui.mount({
    plugin: 'agent-crew',
    component: 'BesidePrompt',
    surface: 'desktop',
    props: { maxColumns: 4, floatRows: 10, floatColumns: 60, isWorking: false, view: {} },
  } as const)
  expect(await beside.find({ type: 'Client', key: 'crew-toggle' } as never)).toBe(undefined)
  await settle()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const button = await band.find({ type: 'Button', key: 'crew' })
  expect(button?.text).toBe('Agent Crew')
  await band.unmount()
  await beside.unmount()
})

test('/crew shows a panel that is open but not drawn, instead of closing it', async ($, on) => {
  engine(on, 'es-ES')
  let placed = false
  let closed = false
  on('ui.panes', () => ({
    value: [{ id: 'agent-crew', title: 'Agent Crew', isShown: placed, isFocused: false, isPlaced: placed }],
  }))
  on('ui.open', () => {
    placed = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    closed = true
    return { value: undefined }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()

  const first = await $.command.run(CREW)
  expect(closed).toBe(false)
  expect(placed).toBe(true)
  expect(first.text).toBe('Panel de Agent Crew abierto.')

  const second = await $.command.run(CREW)
  expect(closed).toBe(true)
  expect(second.text).toBe('Panel de Agent Crew cerrado.')
})

/** Lets the work the mod left running (a language check, a review) move on. */
async function settle() {
  for (let i = 0; i < 100; i++) await new Promise<void>(r => setTimeout(() => r(), 0))
}

test('the descriptions follow the language the person writes in, not only the system', async ($, on) => {
  const stored: Record<string, unknown> = { 'consent:C:/proj': 'yes' }
  engine(on, 'en-US', stored) // an English system
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('prompt.submit', (_, e) => ({ text: (e as { text: string }).text }))
  const spawns: { prompt?: string }[] = []
  on('agent.spawn', (_, e) => {
    spawns.push(e as { prompt?: string })
    return { deny: 'not in a test' }
  })
  await $.session.start({ cwd: 'C:/proj', surface: 'vscode', isInteractive: true })
  await settle()
  for (const text of ['¿Puedes mirar por qué falla?', 'arregla el test de la tripulación', 'y ahora haz un commit']) {
    await $.prompt.submit({ text } as never)
  }
  await $.command.run({ command: 'crew-review', args: '' } as never)
  await settle()

  expect(stored.talk).toEqual({ en: 0, es: 3 }) // only the language is kept, never the text
  expect(spawns.at(-1)?.prompt).toContain('Write every description in Spanish')
})
