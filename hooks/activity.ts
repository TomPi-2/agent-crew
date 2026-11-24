// What a tool call is doing, in a few words for the panel.

import type { Words } from './i18n'

function base(path: unknown): string {
  return typeof path === 'string' ? (path.split(/[\\/]/).pop() ?? path) : ''
}

export function cut(text: unknown, n = 48): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function activityOf(tool: string, input: Record<string, unknown>, w: Words): string {
  const d = w.doing
  switch (tool) {
    case 'Read':
      return d.read(base(input.file_path))
    case 'Grep':
      return d.grep(cut(input.pattern, 36))
    case 'Glob':
      return d.glob(cut(input.pattern, 36))
    case 'Write':
      return d.write(base(input.file_path))
    case 'Edit':
    case 'MultiEdit':
      return d.edit(base(input.file_path))
    case 'Bash':
    case 'PowerShell':
      return cut(input.description) || d.run(cut(input.command, 40))
    case 'WebFetch': {
      const url = typeof input.url === 'string' ? input.url : ''
      return d.web(cut(/^https?:\/\/([^/]+)/.exec(url)?.[1] ?? url, 40))
    }
    case 'WebSearch':
      return d.search(cut(input.query, 34))
    case 'Agent':
    case 'Task':
      return d.delegate(cut(input.description, 40))
    default:
      return d.tool(tool.replace(/^mcp__[^_]+__/, ''))
  }
}
