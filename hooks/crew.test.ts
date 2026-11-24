import { expect, test } from 'claude-code/testing'

import { activityOf } from './activity'
import {
  MARKER,
  changesFor,
  fingerprint,
  isStale,
  parsePlan,
  readFile,
  renderFile,
  type PlannedAgent,
} from './crew'
import { langFrom, words } from './i18n'
import { familyOf, mascot } from './mascots'

const SEARCH: PlannedAgent = {
  name: 'code-search',
  description: 'Use for finding where something lives in the codebase.',
  model: 'haiku',
  tools: ['Read', 'Grep', 'Glob'],
  prompt: 'You search the code and answer with file:line references.',
}

test('a plan is read from a fenced JSON answer and checked', () => {
  const answer = [
    'Here is the crew:',
    '```json',
    JSON.stringify({
      summary: 'Two helpers',
      agents: [
        SEARCH,
        { ...SEARCH, name: 'Bad Name!' }, // not kebab-case: dropped
        { ...SEARCH, name: 'code-search' }, // repeated: dropped
        { ...SEARCH, name: 'logs', model: 'gpt-9', tools: ['Read', 'Format C:'] },
      ],
    }),
    '```',
  ].join('\n')
  const plan = parsePlan(answer)
  expect(plan?.summary).toBe('Two helpers')
  expect(plan?.agents.map(a => a.name)).toEqual(['code-search', 'logs'])
  expect(plan?.agents[1]?.model).toBe('inherit') // unknown model: the parent's
  expect(plan?.agents[1]?.tools).toEqual(['Read']) // unknown tools: dropped
  expect(parsePlan('no JSON here')).toBe(null)
})

test('a generated file carries the marker and reads back', () => {
  const text = renderFile(SEARCH)
  expect(text).toContain(MARKER)
  expect(text).toContain('model: haiku')
  expect(text).toContain('tools: Read, Grep, Glob')
  const info = readFile('code-search.md', text)
  expect(info.name).toBe('code-search')
  expect(info.isGenerated).toBe(true)
  expect(info.description).toBe(SEARCH.description)
  expect(readFile('mine.md', '---\nname: mine\n---\nHi').isGenerated).toBe(false)
})

test('only untouched files of ours are updated or removed', () => {
  const same = renderFile(SEARCH)
  const old = renderFile({ ...SEARCH, name: 'old-helper' })
  const edited = renderFile({ ...SEARCH, name: 'edited' }) + '\nMy own note.'
  const written = {
    'code-search': fingerprint(same),
    'old-helper': fingerprint(old),
    edited: fingerprint(renderFile({ ...SEARCH, name: 'edited' })),
  }
  const changes = changesFor(
    {
      summary: '',
      agents: [
        { ...SEARCH, description: 'Use for searching, better worded.' }, // update
        { ...SEARCH, name: 'test-runner' }, // create
        { ...SEARCH, name: 'edited' }, // the person edited it: kept
        { ...SEARCH, name: 'mine' }, // the person has their own: never touched
      ],
    },
    [
      { file: 'code-search.md', name: 'code-search', text: same },
      { file: 'old-helper.md', name: 'old-helper', text: old },
      { file: 'edited.md', name: 'edited', text: edited },
    ],
    written,
    ['mine'],
  )
  expect(changes.create.map(a => a.name)).toEqual(['test-runner'])
  expect(changes.update.map(u => u.file)).toEqual(['code-search.md'])
  expect(changes.remove).toEqual(['old-helper.md'])
  expect(changes.kept).toEqual(['edited'])
})

test('a project is looked at again once it has changed enough', () => {
  const day = 86_400_000
  expect(isStale(undefined, 0, null)).toBe(true)
  expect(isStale({ head: 'a', at: 0 }, day, 25)).toBe(true) // many commits
  expect(isStale({ head: 'a', at: 0 }, day, 3)).toBe(false)
  expect(isStale({ head: 'a', at: 0 }, 15 * day, 3)).toBe(true) // a while, and some work
  expect(isStale({ head: 'a', at: 0 }, 15 * day, 0)).toBe(false) // nothing new
  expect(isStale({ at: 0 }, 15 * day, null)).toBe(true) // no git: by time
})

test('English and Spanish, and the language of the system', () => {
  expect(langFrom('es-ES')).toBe('es')
  expect(langFrom('es_AR.UTF-8')).toBe('es')
  expect(langFrom('en-GB')).toBe('en')
  expect(langFrom('')).toBe('en')
  expect(words('es').running(2)).toBe('2 en marcha')
  expect(words('en').reviewDone(1, 0, 2, 0)).toBe('1 created, 2 removed')
  expect(words('es').reviewDone(0, 0, 0, 0)).toBe('Ya estaban al día')
})

test('tools in a few words', () => {
  const w = words('es')
  expect(activityOf('Read', { file_path: 'C:/x/server.py' }, w)).toBe('Leyendo server.py')
  expect(activityOf('Bash', { command: 'ls', description: 'Lista' }, w)).toBe('Lista')
  expect(activityOf('mcp__docs__search', {}, w)).toBe('Usando search')
})

test('one character per model family, each with its own movement', () => {
  expect(familyOf('claude-haiku-5-5')).toBe('haiku')
  expect(familyOf('sonnet')).toBe('sonnet')
  expect(familyOf('claude-opus-5-5')).toBe('opus')
  expect(familyOf('claude-fable-5-2')).toBe('fable')
  expect(familyOf('gpt')).toBe('other')
  const svgs = (['haiku', 'sonnet', 'opus', 'fable'] as const).map(f =>
    mascot(f, 'run', '#22D3EE', 'a1'),
  )
  expect(new Set(svgs).size).toBe(4)
  for (const svg of svgs) {
    expect(svg).toContain('<animateTransform')
    expect(svg).not.toContain('<circle cx="86"') // no thinking dots
    expect(svg).not.toContain('<ellipse cx="52" cy="104"') // no shadow
  }
  expect(mascot('opus', 'fail', '#fff', 'a1')).not.toContain('<animateTransform')
  // Same agent, same mood: the same drawing, so a redraw does not restart it.
  expect(mascot('haiku', 'run', '#fff', 'a1')).toBe(mascot('haiku', 'run', '#fff', 'a1'))
})
