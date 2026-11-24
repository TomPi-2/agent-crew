// The crew: one small character per model family, drawn as the family's initial
// (H for Haiku, S for Sonnet, O for Opus, F for Fable) with a face cut out of it,
// so whatever is behind shows through, like the Decider icons. No background, no
// shadow: just the letter, its face and one quiet movement of its own.

export type Mood = 'run' | 'done' | 'fail'
export type Family = 'haiku' | 'sonnet' | 'opus' | 'fable' | 'other'

export function familyOf(model: string): Family {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus')) return 'opus'
  if (m.includes('fable')) return 'fable'
  return 'other'
}

type Eye = { x: number; y: number }
type Figure = {
  /** The letter's body, as mask markup painted white. */
  body: string
  left: Eye
  right: Eye
  /** Mouth for each mood, as a path. */
  smile: string
  grin: string
  flat: string
  /** Where the letter stands, for the movements that pivot on it. */
  base: { x: number; y: number }
}

const R = 9 // corner radius of the strokes

const FIGURES: Record<Family, Figure> = {
  // H: two posts and a deep crossbar; an eye at the top of each post.
  haiku: {
    body:
      `<rect x="12" y="10" width="28" height="80" rx="${R}"/>` +
      `<rect x="60" y="10" width="28" height="80" rx="${R}"/>` +
      `<rect x="32" y="40" width="36" height="34"/>`,
    left: { x: 26, y: 34 },
    right: { x: 74, y: 34 },
    smile: 'M30 58 Q50 71 70 58',
    grin: 'M28 55 Q50 76 72 55',
    flat: 'M32 62 Q41 57 50 62 Q59 67 68 62',
    base: { x: 50, y: 90 },
  },
  // S: one thick stroke; the face sits on its top curve, the letter's head.
  sonnet: {
    body:
      `<path d="M77 28 C73 8 24 6 23 30 C22 52 78 46 77 70 C76 94 25 95 21 74" ` +
      `fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round"/>`,
    left: { x: 41, y: 10 },
    right: { x: 59, y: 10 },
    smile: 'M42 20 Q50 26 58 20',
    grin: 'M41 18 Q50 27 59 18',
    flat: 'M42 22 Q46 19 50 22 Q54 25 58 22',
    base: { x: 50, y: 92 },
  },
  // O: a round body; the open «o» of the mouth is the letter's counter.
  opus: {
    body: `<circle cx="50" cy="50" r="40"/>`,
    left: { x: 37, y: 42 },
    right: { x: 63, y: 42 },
    smile: 'RING',
    grin: 'M35 58 Q50 75 65 58',
    flat: 'M37 64 Q44 59 50 64 Q56 69 63 64',
    base: { x: 50, y: 90 },
  },
  // F: a post with a deep top bar and a short middle bar; the face is on the top bar.
  fable: {
    body:
      `<rect x="14" y="10" width="28" height="80" rx="${R}"/>` +
      `<rect x="14" y="8" width="76" height="44" rx="${R + 4}"/>` +
      `<rect x="14" y="60" width="54" height="20" rx="${R}"/>`,
    left: { x: 52, y: 24 },
    right: { x: 72, y: 24 },
    smile: 'M48 38 Q62 47 76 38',
    grin: 'M47 36 Q62 50 77 36',
    flat: 'M49 40 Q55 36 62 40 Q69 44 75 40',
    base: { x: 50, y: 90 },
  },
  // Any other model: a rounded square with the same kind of face.
  other: {
    body: `<rect x="12" y="12" width="76" height="76" rx="24"/>`,
    left: { x: 37, y: 42 },
    right: { x: 63, y: 42 },
    smile: 'M35 60 Q50 72 65 60',
    grin: 'M33 57 Q50 76 67 57',
    flat: 'M36 64 Q43 59 50 64 Q57 69 64 64',
    base: { x: 50, y: 88 },
  },
}

const EASE = 'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'

/** Each family's own movement while it works, quiet and continuous. */
function motion(family: Family, base: { x: number; y: number }, begin: string): string {
  // The movement runs in a frame centred on the letter (see `mascot`).
  const pivot = `${base.x - 50} ${base.y - 50}`
  switch (family) {
    case 'haiku': // a light, quick hop
      return `<animateTransform attributeName="transform" type="translate" dur="0.9s" repeatCount="indefinite" ${begin} ${EASE} values="0 0;0 -5;0 0"/>`
    case 'sonnet': // a gentle sway from the base
      return `<animateTransform attributeName="transform" type="rotate" dur="2.6s" repeatCount="indefinite" ${begin} ${EASE} values="-5 ${pivot};5 ${pivot};-5 ${pivot}"/>`
    case 'opus': // slow, deep breathing
      return `<animateTransform attributeName="transform" type="scale" dur="3.2s" repeatCount="indefinite" ${begin} ${EASE} values="1;1.06;1" additive="sum"/>`
    case 'fable': // floats and tilts, like a page turning
      return (
        `<animateTransform attributeName="transform" type="translate" dur="3s" repeatCount="indefinite" ${begin} ${EASE} values="0 0;0 -3;0 0"/>` +
        `<animateTransform attributeName="transform" type="rotate" dur="3s" repeatCount="indefinite" ${begin} ${EASE} values="-3 ${pivot};3 ${pivot};-3 ${pivot}" additive="sum"/>`
      )
    default: // a soft breath
      return `<animateTransform attributeName="transform" type="scale" dur="2.8s" repeatCount="indefinite" ${begin} ${EASE} values="1;1.04;1" additive="sum"/>`
  }
}

/** Where each family's eyes go while it works. */
function glance(family: Family, begin: string): string {
  const values =
    family === 'opus'
      ? '0 0;0 -2;0 -2;0 0;0 0' // looks up, thinking
      : family === 'sonnet' || family === 'other'
        ? '0 0;-3 0;-3 0;3 0;0 0' // looks side to side
        : '0 0;2 -1;2 -1;0 0;0 0'
  return `<animateTransform attributeName="transform" type="translate" dur="4s" repeatCount="indefinite" ${begin} values="${values}" keyTimes="0;0.2;0.45;0.7;1"/>`
}

function blink(begin: string, period: number): string {
  return `<animate attributeName="ry" dur="${period}s" repeatCount="indefinite" ${begin} values="6;6;0.8;6;6" keyTimes="0;0.9;0.94;0.98;1"/>`
}

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/**
 * The SVG for one subagent: `seed` keeps each one's movement out of step with the
 * others' and is stable, so redrawing the panel does not restart the animation.
 */
export function mascot(family: Family, mood: Mood, color: string, seed: string, size = 40): string {
  const f = FIGURES[family]
  const id = `c${hash(seed) % 1_000_000}`
  const begin = `begin="-${((hash(seed) % 1000) / 1000).toFixed(2)}s"`
  const ink = 'fill="#000"'
  let face: string
  if (mood === 'fail') {
    const x = ({ x, y }: Eye) =>
      `<path d="M${x - 5} ${y - 5} L${x + 5} ${y + 5} M${x + 5} ${y - 5} L${x - 5} ${y + 5}" stroke="#000" stroke-width="4.5" stroke-linecap="round"/>`
    face = `${x(f.left)}${x(f.right)}<path d="${f.flat}" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`
  } else if (mood === 'done') {
    const arc = ({ x, y }: Eye) =>
      `<path d="M${x - 6} ${y + 2} Q${x} ${y - 7} ${x + 6} ${y + 2}" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/>`
    face = `${arc(f.left)}${arc(f.right)}<path d="${f.grin}" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>`
  } else {
    const period = family === 'opus' ? 4.6 : family === 'haiku' ? 2.8 : 3.6
    const eye = ({ x, y }: Eye) =>
      `<ellipse cx="${x}" cy="${y}" rx="6" ry="6" ${ink}>${blink(begin, period)}</ellipse>`
    const mouth =
      f.smile === 'RING'
        ? `<circle cx="50" cy="64" r="7.5" ${ink}/><circle cx="50" cy="64" r="3" fill="#fff"/>`
        : `<path d="${f.smile}" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/>`
    face = `<g>${glance(family, begin)}${eye(f.left)}${eye(f.right)}</g>${mouth}`
  }
  const moving =
    mood === 'run'
      ? motion(family, f.base, begin)
      : mood === 'done'
        ? `<animateTransform attributeName="transform" type="scale" dur="4s" repeatCount="indefinite" ${begin} ${EASE} values="1;1.025;1" additive="sum"/>`
        : ''
  // Scaling pivots on the letter's centre: shift there, scale, shift back.
  const opacity = mood === 'fail' ? ' opacity="0.45"' : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 116 116" width="${size}" height="${size}">` +
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="116" height="116">` +
    `<rect x="-8" y="-8" width="116" height="116" fill="#000"/>` +
    `<g fill="#fff">${f.body}</g>${face}</mask></defs>` +
    `<g transform="translate(50 50)"><g>${moving}<g transform="translate(-50 -50)"${opacity}>` +
    `<rect x="-8" y="-8" width="116" height="116" fill="${color}" mask="url(#${id})"/>` +
    `</g></g></g></svg>`
  )
}

/** The crew in the colours of the mod's icon: H, S, O and F, as the icon shows them. */
export const LOGO: { family: Family; color: string }[] = [
  { family: 'haiku', color: '#22D3EE' },
  { family: 'sonnet', color: '#A855F7' },
  { family: 'opus', color: '#F59E0B' },
  { family: 'fable', color: '#EC4899' },
]

/** The mod's logo for the panel: its four characters side by side, smiling, at rest. */
export function logo(size = 20): string[] {
  return LOGO.map(({ family, color }) => mascot(family, 'done', color, `logo-${family}`, size))
}
