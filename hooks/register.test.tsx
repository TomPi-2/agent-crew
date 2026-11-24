import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

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

test('the button above the prompt opens and closes the panel', async ($, on) => {
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

  for (const surface of ['vscode', 'desktop'] as const) {
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

/** Lets the work the mod left running (a language check, a review) move on. */
async function settle() {
  for (let i = 0; i < 100; i++) await new Promise<void>(r => setTimeout(() => r(), 0))
}
