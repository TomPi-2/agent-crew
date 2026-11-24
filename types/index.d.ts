/** One subagent of this session, as the panel shows it. */
export type Agent = {
  id: string
  /** Agent type (`Explore`, a project agent's name…). */
  type: string
  /** The short task description it was given. */
  description: string
  /** The model id or alias it runs on. */
  model: string
  /** Its character's colour (hex). */
  color: string
  status: 'run' | 'done' | 'fail'
  /** What it is doing now, in a few words (already in the panel's language). */
  activity: string
  /** How many tools it has used. */
  steps: number
  startedAt: number
  endedAt?: number
}

/** The latest review of the project's subagents. */
export type Review = {
  status: 'idle' | 'running' | 'done' | 'error'
  /** One line for the panel, in its language. */
  message: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      agents: Shaped<Agent[]>
      review: Shaped<Review>
      lang: 'en' | 'es'
    }
  }
}
