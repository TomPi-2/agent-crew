// Every word the mod shows, in English and Spanish.

export type Lang = 'en' | 'es'

const EN = {
  title: 'Agent Crew',
  none: 'No subagents running',
  running: (n: number) => (n === 1 ? '1 running' : `${n} running`),
  finished: 'Finished',
  doneIn: (t: string, steps: number) => `Done in ${t} · ${steps} ${steps === 1 ? 'step' : 'steps'}`,
  stoppedAfter: (t: string) => `Stopped after ${t}`,
  starting: 'Starting…',
  resuming: 'Resuming…',
  view: 'View',
  bandIdle: 'Agent Crew',
  bandRunning: (n: number) => `Agent Crew · ${n} running`,
  open: 'Open',
  close: 'Close',
  project: 'Project subagents',
  projectCount: (n: number) => (n === 1 ? '1 project subagent' : `${n} project subagents`),
  reviewNow: 'Review now',
  reviewing: 'Reviewing the project…',
  reviewOff: 'Not set up for this project',
  setUp: 'Set up',
  askTitle: 'Agent Crew',
  ask: 'Shall Agent Crew analyse this project and create subagents for it in .claude/agents/? It will keep them up to date as the project changes (you can review or edit them anytime).',
  askYes: 'Yes, analyse it',
  askLater: 'Not now',
  askNever: 'Never for this project',
  reviewDone: (c: number, u: number, r: number, kept: number) =>
    [
      c && `${c} created`,
      u && `${u} updated`,
      r && `${r} removed`,
      kept && `${kept} kept with your edits`,
    ]
      .filter(Boolean)
      .join(', ') || 'Already up to date',
  reviewFailed: 'The review could not finish',
  nextSession: 'New ones are ready now and load as files in your next session.',
  commandDescription: 'Open or close the Agent Crew panel',
  reviewCommandDescription: 'Analyse this project and update its subagents',
  doing: {
    read: (f: string) => `Reading ${f}`,
    grep: (p: string) => `Searching “${p}”`,
    glob: (p: string) => `Finding files ${p}`,
    write: (f: string) => `Writing ${f}`,
    edit: (f: string) => `Editing ${f}`,
    run: (c: string) => `Running ${c}`,
    web: (h: string) => `Reading ${h}`,
    search: (q: string) => `Searching the web for “${q}”`,
    delegate: (d: string) => `Delegating: ${d}`,
    tool: (t: string) => `Using ${t}`,
  },
  mood: { run: 'working', done: 'finished', fail: 'stopped' },
}

const ES: typeof EN = {
  title: 'Agent Crew',
  none: 'Ningún subagente en marcha',
  running: n => (n === 1 ? '1 en marcha' : `${n} en marcha`),
  finished: 'Terminados',
  doneIn: (t, steps) => `Hecho en ${t} · ${steps} ${steps === 1 ? 'paso' : 'pasos'}`,
  stoppedAfter: t => `Se ha parado tras ${t}`,
  starting: 'Empezando…',
  resuming: 'Retomando…',
  view: 'Ver',
  bandIdle: 'Agent Crew',
  bandRunning: n => `Agent Crew · ${n} en marcha`,
  open: 'Abrir',
  close: 'Cerrar',
  project: 'Subagentes del proyecto',
  projectCount: n => (n === 1 ? '1 subagente del proyecto' : `${n} subagentes del proyecto`),
  reviewNow: 'Revisar ahora',
  reviewing: 'Revisando el proyecto…',
  reviewOff: 'Sin configurar en este proyecto',
  setUp: 'Configurar',
  askTitle: 'Agent Crew',
  ask: '¿Analiza Agent Crew este proyecto y le crea subagentes en .claude/agents/? Los irá actualizando a medida que cambie el proyecto (puedes revisarlos o editarlos cuando quieras).',
  askYes: 'Sí, analízalo',
  askLater: 'Ahora no',
  askNever: 'Nunca en este proyecto',
  reviewDone: (c, u, r, kept) =>
    [
      c && `${c} creados`,
      u && `${u} actualizados`,
      r && `${r} quitados`,
      kept && `${kept} conservados con tus cambios`,
    ]
      .filter(Boolean)
      .join(', ') || 'Ya estaban al día',
  reviewFailed: 'La revisión no ha podido terminar',
  nextSession: 'Los nuevos ya se pueden usar y se cargan como archivos en la próxima sesión.',
  commandDescription: 'Abre o cierra el panel de Agent Crew',
  reviewCommandDescription: 'Analiza este proyecto y actualiza sus subagentes',
  doing: {
    read: f => `Leyendo ${f}`,
    grep: p => `Buscando «${p}»`,
    glob: p => `Buscando archivos ${p}`,
    write: f => `Escribiendo ${f}`,
    edit: f => `Editando ${f}`,
    run: c => `Ejecutando ${c}`,
    web: h => `Leyendo ${h}`,
    search: q => `Buscando en la web «${q}»`,
    delegate: d => `Delegando: ${d}`,
    tool: t => `Usando ${t}`,
  },
  mood: { run: 'trabajando', done: 'ha terminado', fail: 'parado' },
}

export type Words = typeof EN

export function words(lang: Lang): Words {
  return lang === 'es' ? ES : EN
}

/** «es-ES», «es_AR.UTF-8», «Spanish» → es; anything else → en. */
export function langFrom(locale: string): Lang {
  return /^(es|spa)/i.test(locale.trim()) ? 'es' : 'en'
}
