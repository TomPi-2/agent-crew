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

// --- the language the person writes to Claude in ----------------------------------------

const ES_WORDS = new Set(
  ('el la los las de del que y en un una por para con es son se lo como pero más este esta ' +
    'esto eso qué cómo hay haz hazlo puedes quiero también donde cuando porque sí ya muy ' +
    'todo todos al le les mi tu su sin sobre ahora tiene hace bien').split(' '),
)
const EN_WORDS = new Set(
  ('the an and of to is are in on for with this that it can you what how why please make ' +
    'do does should would could there have has be from my your all also when but if just ' +
    'now it’s it\'s don’t don\'t').split(' '),
)

/** The language a message is written in, or null when it does not say clearly. */
export function langOfText(text: string): Lang | null {
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ') // code says nothing about the person's language
    .replace(/`[^`]*`/g, ' ')
    .replace(/\S*[/\\]\S*/g, ' ') // paths and links
    .toLowerCase()
  let es = (prose.match(/[¿¡ñ]/g) ?? []).length
  let en = 0
  for (const word of prose.match(/[\p{L}'’]+/gu) ?? []) {
    if (ES_WORDS.has(word) || /[áéíóú]/.test(word)) es += 1
    else if (EN_WORDS.has(word)) en += 1
  }
  if (es >= 2 && es >= 2 * en) return 'es'
  if (en >= 2 && en >= 2 * es) return 'en'
  return null
}

/** How many recent messages were in each language. */
export type Talk = { en: number; es: number }

/** One more message in `lang`. Old counts fade, so a change of habit shows soon. */
export function talkWith(talk: Talk | undefined, lang: Lang): Talk {
  const next = { en: talk?.en ?? 0, es: talk?.es ?? 0 }
  next[lang] += 1
  return next.en + next.es > 40 ? { en: next.en / 2, es: next.es / 2 } : next
}

/** The language the person usually writes in, once a few messages have shown it. */
export function usualLang(talk: Talk | undefined): Lang | null {
  if (talk === undefined || talk.en + talk.es < 3) return null
  return talk.es > talk.en ? 'es' : talk.en > talk.es ? 'en' : null
}
