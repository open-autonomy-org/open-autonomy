// The pages' illustrations: plotter drawings made from a seed by a few simple rules, so every project has its own
// picture without anyone drawing one, and the same account always draws the same. Each is an SVG string in ink on
// transparent ground; the page decides the ground. Nothing here reads a record beyond the seed it is handed.

const hash = (seed: string): number => { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
function rng(seed: string): () => number {
  let s = hash(seed) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let m = Math.imul(s ^ (s >>> 15), 1 | s); m ^= m + Math.imul(m ^ (m >>> 7), 61 | m); return ((m ^ (m >>> 14)) >>> 0) / 4294967296; };
}
const f = (n: number): string => n.toFixed(1);
const svg = (w: number, h: number, body: string, cls = 'art'): string => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="currentColor">${body}</svg>`;
const HOT = 'var(--oa-hot,#ff5a1f)';

export type ArtKind = 'vortex' | 'hatch' | 'lines' | 'squares' | 'lattice' | 'rings' | 'grid';
export const ART_KINDS: ArtKind[] = ['hatch', 'squares', 'lines', 'lattice', 'vortex', 'rings', 'grid'];
// The ground a card's drawing sits on: most on paper, some on the accents, picked by the seed.
export const groundOf = (seed: string): 'paper' | 'lime' | 'lilac' | 'stone' => (['stone', 'lime', 'paper', 'stone', 'lilac', 'paper'] as const)[hash(`${seed}:ground`) % 6];
export const kindOf = (seed: string): ArtKind => ART_KINDS[hash(seed) % ART_KINDS.length];

/** Rotating squares drawn as one long stroke each, twisting towards a still centre: the front's hero. */
export function vortex(seed: string, w = 400, h = 400): string {
  const r = rng(seed), cx = w / 2, cy = h / 2, turns = 56, out: string[] = [];
  for (let i = 0; i < turns; i++) {
    const k = i / turns, s = 30 + k * Math.min(w, h) * 0.44, a = k * 1.9 + r() * 0.006;
    const pts = [0, 1, 2, 3].map((q) => { const t = a + (q * Math.PI) / 2; return `${f(cx + Math.cos(t) * s)},${f(cy + Math.sin(t) * s)}`; });
    out.push(`<polygon points="${pts.join(' ')}" stroke-width="0.4" opacity="${f(0.3 + k * 0.6)}"/>`);
  }
  return svg(w, h, out.join(''));
}

/** Short strokes following a slow curl, a few picked out in the hot accent. */
export function hatch(seed: string, w = 400, h = 400): string {
  const r = rng(seed), cols = 22, rows = 22, len = w / cols * 0.9, tilt = -1 + r() * 0.5, curl = 2 + r() * 3, out: string[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = (x + 0.5) * (w / cols), py = (y + 0.5) * (h / rows);
    const a = tilt + Math.sin(x / curl + y / (curl * 1.3)) * 0.6 + (r() - 0.5) * 0.15;
    const hot = r() < 0.03;
    out.push(`<line x1="${f(px - Math.cos(a) * len / 2)}" y1="${f(py - Math.sin(a) * len / 2)}" x2="${f(px + Math.cos(a) * len / 2)}" y2="${f(py + Math.sin(a) * len / 2)}" stroke-width="${hot ? 1.4 : 0.9}"${hot ? ` stroke="${HOT}"` : ''}/>`);
  }
  return svg(w, h, out.join(''));
}

/** Vertical rules, one travelling fold through them. */
export function lines(seed: string, w = 400, h = 400): string {
  const r = rng(seed), n = 64, at = 0.3 + r() * 0.4, depth = 30 + r() * 40, out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (w / n), fold = Math.exp(-(((i / n) - at) ** 2) / 0.012) * depth;
    out.push(`<path d="M${f(x)} 0 L${f(x)} ${f(h * 0.45)} Q${f(x + fold)} ${f(h * 0.62)} ${f(x + fold * 0.3)} ${f(h)}" stroke-width="0.7"/>`);
  }
  return svg(w, h, out.join(''));
}

/** A stack of squares, each turned a little further, around one dot. */
export function squares(seed: string, w = 400, h = 400): string {
  const r = rng(seed), cx = w / 2, cy = h / 2, n = 6 + Math.floor(r() * 5), out: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(w, h) * (0.24 + r() * 0.12), a = (r() - 0.5) * 0.5, dx = (r() - 0.5) * 18, dy = (r() - 0.5) * 18;
    out.push(`<rect x="${f(cx - s + dx)}" y="${f(cy - s + dy)}" width="${f(s * 2)}" height="${f(s * 2)}" transform="rotate(${f((a * 180) / Math.PI)} ${f(cx)} ${f(cy)})" stroke-width="0.9"/>`);
  }
  out.push(`<rect x="${f(cx - 3)}" y="${f(cy - 3)}" width="6" height="6" fill="currentColor" stroke="none"/>`);
  return svg(w, h, out.join(''));
}

/** A dot lattice with a few cells filled, one in the hot accent; `fills: false` leaves only the dots. */
export function lattice(seed: string, w = 400, h = 400, fills = true): string {
  const r = rng(seed), step = 20, out: string[] = [];
  let hot = false;
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
    const v = r();
    if (fills && v < 0.035) { const heat: boolean = !hot && v < 0.006; hot = hot || heat; out.push(`<rect x="${f(x - 5)}" y="${f(y - 5)}" width="10" height="10" fill="${heat ? HOT : 'currentColor'}" stroke="none"/>`); }
    else out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="1" fill="currentColor" stroke="none" opacity="0.55"/>`);
  }
  return svg(w, h, out.join(''));
}

/** Dotted rings, each a little off the last. */
export function rings(seed: string, w = 400, h = 400): string {
  const r = rng(seed), cx = w / 2, cy = h / 2, out: string[] = [];
  for (let i = 0; i < 9; i++) {
    const rad = 40 + i * 16 + r() * 6, ox = (r() - 0.5) * 10, oy = (r() - 0.5) * 10;
    out.push(`<circle cx="${f(cx + ox)}" cy="${f(cy + oy)}" r="${f(rad)}" stroke-width="0.9" stroke-dasharray="${f(1 + r() * 3)} ${f(3 + r() * 5)}"/>`);
  }
  return svg(w, h, out.join(''));
}

/** A grid of hand-drawn boxes, a few of them filled. */
export function grid(seed: string, w = 400, h = 400): string {
  const r = rng(seed), n = 10, cell = w / n, out: string[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const j = () => (r() - 0.5) * 2.4, x0 = x * cell + 4, y0 = y * cell + 4, s = cell - 8;
    const fill = r() < 0.04;
    out.push(`<path d="M${f(x0 + j())} ${f(y0 + j())} L${f(x0 + s + j())} ${f(y0 + j())} L${f(x0 + s + j())} ${f(y0 + s + j())} L${f(x0 + j())} ${f(y0 + s + j())} Z" stroke-width="0.8"${fill ? ' fill="currentColor"' : ''}/>`);
  }
  return svg(w, h, out.join(''));
}

const DRAW: Record<ArtKind, (seed: string, w?: number, h?: number) => string> = { vortex, hatch, lines, squares, lattice, rings, grid };
/** The drawing a seed picks, or the kind asked for. */
export const art = (seed: string, kind: ArtKind = kindOf(seed), w = 400, h = 400): string => DRAW[kind](seed, w, h);

/** The mark: two squares meeting at a corner. */
export const MARK_SVG = '<svg class="mark" viewBox="0 0 34 34" aria-hidden="true"><rect x="16" y="0" width="18" height="18" fill="currentColor"/><rect x="0" y="16" width="16" height="18" fill="currentColor"/></svg>';
