// The pages' illustrations: plotter drawings made from a seed by a few simple rules, so every project has its own
// picture without anyone drawing one, and the same account always draws the same. A drawing is a list of shapes in a
// 400-unit square; the page draws them as SVG in ink on transparent ground, and a link preview draws the same shapes
// as a PNG (./raster.ts). Nothing here reads a record beyond the seed it is handed.

const hash = (seed: string): number => { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
function rng(seed: string): () => number {
  let s = hash(seed) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let m = Math.imul(s ^ (s >>> 15), 1 | s); m ^= m + Math.imul(m ^ (m >>> 7), 61 | m); return ((m ^ (m >>> 14)) >>> 0) / 4294967296; };
}

// One mark of the pen: a stroked line through points (closed for a loop), a filled outline, a dot, or a dashed circle
// (`on` units drawn every `on + off`), or a fold (a straight run into a quadratic curve); in ink or the hot accent, at a
// strength between 0 and 1.
export type Pt = [number, number];
export type Shape =
  | { k: 'line'; pts: Pt[]; closed?: boolean; w: number; hot?: boolean; a?: number }
  | { k: 'fill'; pts: Pt[]; hot?: boolean; a?: number }
  | { k: 'dot'; x: number; y: number; r: number; a?: number }
  | { k: 'ring'; x: number; y: number; r: number; w: number; on: number; off: number }
  | { k: 'fold'; from: Pt; mid: Pt; ctrl: Pt; to: Pt; w: number };
export const SIZE = 400;
const turn = (cx: number, cy: number, a: number) => ([x, y]: Pt): Pt => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
const box = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export type ArtKind = 'vortex' | 'hatch' | 'lines' | 'squares' | 'lattice' | 'rings' | 'grid';
export const ART_KINDS: ArtKind[] = ['hatch', 'squares', 'lines', 'lattice', 'vortex', 'rings', 'grid'];
// The ground a card's drawing sits on: most on paper, some on the accents, picked by the seed.
export const groundOf = (seed: string): 'paper' | 'lime' | 'lilac' | 'stone' => (['stone', 'lime', 'paper', 'stone', 'lilac', 'paper'] as const)[hash(`${seed}:ground`) % 6];
export const kindOf = (seed: string): ArtKind => ART_KINDS[hash(seed) % ART_KINDS.length];

/** Rotating squares, twisting towards a still centre: the front's hero. */
function vortexShapes(seed: string): Shape[] {
  const r = rng(seed), c = SIZE / 2, turns = 56, out: Shape[] = [];
  for (let i = 0; i < turns; i++) {
    const k = i / turns, s = 30 + k * SIZE * 0.44, a = k * 1.9 + r() * 0.006;
    out.push({ k: 'line', closed: true, w: 0.4, a: Number((0.3 + k * 0.6).toFixed(1)), pts: [0, 1, 2, 3].map((q): Pt => { const t = a + (q * Math.PI) / 2; return [c + Math.cos(t) * s, c + Math.sin(t) * s]; }) });
  }
  return out;
}

/** Short strokes following a slow curl, a few picked out in the hot accent. */
function hatchShapes(seed: string): Shape[] {
  const r = rng(seed), cols = 22, rows = 22, len = SIZE / cols * 0.9, tilt = -1 + r() * 0.5, curl = 2 + r() * 3, out: Shape[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = (x + 0.5) * (SIZE / cols), py = (y + 0.5) * (SIZE / rows);
    const a = tilt + Math.sin(x / curl + y / (curl * 1.3)) * 0.6 + (r() - 0.5) * 0.15;
    const hot = r() < 0.03;
    out.push({ k: 'line', w: hot ? 1.4 : 0.9, hot, pts: [[px - Math.cos(a) * len / 2, py - Math.sin(a) * len / 2], [px + Math.cos(a) * len / 2, py + Math.sin(a) * len / 2]] });
  }
  return out;
}

/** Vertical rules, one travelling fold through them. */
function linesShapes(seed: string): Shape[] {
  const r = rng(seed), n = 64, at = 0.3 + r() * 0.4, depth = 30 + r() * 40, out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (SIZE / n), fold = Math.exp(-(((i / n) - at) ** 2) / 0.012) * depth;
    out.push({ k: 'fold', w: 0.7, from: [x, 0], mid: [x, SIZE * 0.45], ctrl: [x + fold, SIZE * 0.62], to: [x + fold * 0.3, SIZE] });
  }
  return out;
}

/** A stack of squares, each turned a little further, around one dot. */
function squaresShapes(seed: string): Shape[] {
  const r = rng(seed), c = SIZE / 2, n = 6 + Math.floor(r() * 5), out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const s = SIZE * (0.24 + r() * 0.12), a = (r() - 0.5) * 0.5, dx = (r() - 0.5) * 18, dy = (r() - 0.5) * 18;
    // The box and its turn at the precision the drawing has always had (a tenth of a unit, a tenth of a degree).
    const at = (n: number) => Number(n.toFixed(1)), deg = at((a * 180) / Math.PI);
    out.push({ k: 'line', closed: true, w: 0.9, pts: box(at(c - s + dx), at(c - s + dy), at(s * 2), at(s * 2)).map(turn(c, c, (deg * Math.PI) / 180)) });
  }
  out.push({ k: 'fill', pts: box(c - 3, c - 3, 6, 6) });
  return out;
}

/** A dot lattice with a few cells filled, one in the hot accent; `fills: false` leaves only the dots. */
function latticeShapes(seed: string, fills = true): Shape[] {
  const r = rng(seed), step = 20, out: Shape[] = [];
  let hot = false;
  for (let y = step / 2; y < SIZE; y += step) for (let x = step / 2; x < SIZE; x += step) {
    const v = r();
    if (fills && v < 0.035) { const heat: boolean = !hot && v < 0.006; hot = hot || heat; out.push({ k: 'fill', hot: heat, pts: box(x - 5, y - 5, 10, 10) }); }
    else out.push({ k: 'dot', x, y, r: 1, a: 0.55 });
  }
  return out;
}

/** Dotted rings, each a little off the last. */
function ringsShapes(seed: string): Shape[] {
  const r = rng(seed), c = SIZE / 2, out: Shape[] = [];
  for (let i = 0; i < 9; i++) {
    const rad = 40 + i * 16 + r() * 6, ox = (r() - 0.5) * 10, oy = (r() - 0.5) * 10;
    out.push({ k: 'ring', x: c + ox, y: c + oy, r: rad, w: 0.9, on: 1 + r() * 3, off: 3 + r() * 5 });
  }
  return out;
}

/** A grid of hand-drawn boxes, a few of them filled. */
function gridShapes(seed: string): Shape[] {
  const r = rng(seed), n = 10, cell = SIZE / n, out: Shape[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const j = () => (r() - 0.5) * 2.4, x0 = x * cell + 4, y0 = y * cell + 4, s = cell - 8;
    const fill = r() < 0.04; // drawn before the jitter, so every project keeps the picture it had
    const pts: Pt[] = [[x0 + j(), y0 + j()], [x0 + s + j(), y0 + j()], [x0 + s + j(), y0 + s + j()], [x0 + j(), y0 + s + j()]];
    out.push({ k: 'line', closed: true, w: 0.8, pts });
    if (fill) out.push({ k: 'fill', pts });
  }
  return out;
}

const DRAW: Record<ArtKind, (seed: string) => Shape[]> = { vortex: vortexShapes, hatch: hatchShapes, lines: linesShapes, squares: squaresShapes, lattice: latticeShapes, rings: ringsShapes, grid: gridShapes };
/** The shapes a seed draws: its own kind, or the kind asked for. */
export const shapesOf = (seed: string, kind: ArtKind = kindOf(seed), fills = true): Shape[] => (kind === 'lattice' ? latticeShapes(seed, fills) : DRAW[kind](seed));

// ---- as SVG, for the pages -------------------------------------------------------------------------------------------
const f = (n: number): string => n.toFixed(1);
const HOT = 'var(--oa-hot,#ff5a1f)';
export function svgOf(shapes: Shape[], cls = 'art'): string {
  const body = shapes.map((s) => {
    if (s.k === 'fold') return `<path d="M${f(s.from[0])} ${f(s.from[1])} L${f(s.mid[0])} ${f(s.mid[1])} Q${f(s.ctrl[0])} ${f(s.ctrl[1])} ${f(s.to[0])} ${f(s.to[1])}" stroke-width="${s.w}"/>`;
    if (s.k === 'ring') return `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(s.r)}" stroke-width="${s.w}" stroke-dasharray="${f(s.on)} ${f(s.off)}"/>`;
    const alpha = s.a !== undefined ? ` opacity="${s.a}"` : '';
    if (s.k === 'dot') return `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(s.r)}" fill="currentColor" stroke="none"${alpha}/>`;
    const pts = s.pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    if (s.k === 'fill') return `<polygon points="${pts}" fill="${s.hot ? HOT : 'currentColor'}" stroke="none"${alpha}/>`;
    return `<${s.closed ? 'polygon' : 'polyline'} points="${pts}" stroke-width="${s.w}"${s.hot ? ` stroke="${HOT}"` : ''}${alpha}/>`;
  }).join('');
  return `<svg class="${cls}" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="currentColor">${body}</svg>`;
}

/** The drawing a seed picks, or the kind asked for, as SVG. */
export const art = (seed: string, kind: ArtKind = kindOf(seed)): string => svgOf(shapesOf(seed, kind));
export const vortex = (seed: string): string => svgOf(shapesOf(seed, 'vortex'));
export const lattice = (seed: string, _w = SIZE, _h = SIZE, fills = true): string => svgOf(shapesOf(seed, 'lattice', fills));
export const rings = (seed: string): string => svgOf(shapesOf(seed, 'rings'));

/** The mark: two squares meeting at a corner. */
