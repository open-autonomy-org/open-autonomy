// A project's drawing as the picture a shared link shows: the same shapes the page draws (./art.ts), rasterized onto
// a 1200×630 card on the drawing's ground with the mark in a corner, encoded as a PNG. No text: the link's title and
// description travel beside the picture. Pure arithmetic and the runtime's own deflate; nothing is fetched.
import { SIZE, groundOf, shapesOf, type Pt, type Shape } from './art.js';

export const CARD = { w: 1200, h: 630 } as const;
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const INK = hex('#161a24'), HOT = hex('#ff5a1f');
const GROUND: Record<ReturnType<typeof groundOf>, RGB> = { paper: hex('#fbfbf8'), lime: hex('#e3f5a3'), lilac: hex('#e8e4f0'), stone: hex('#f1f1ec') };

class Canvas {
  px: Uint8Array;
  constructor(readonly w: number, readonly h: number, ground: RGB) {
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { this.px[i * 3] = ground[0]; this.px[i * 3 + 1] = ground[1]; this.px[i * 3 + 2] = ground[2]; }
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3, k = Math.min(1, a);
    for (let j = 0; j < 3; j++) this.px[i + j] = Math.round(this.px[i + j] * (1 - k) + c[j] * k);
  }
  // A stroke is scanned only in a band along its length (its major axis, a few pixels either side), never its box.
  segment(a: Pt, b: Pt, width: number, c: RGB, alpha: number): void {
    const half = Math.max(width / 2, 0.5), pad = half + 1.5;
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
    const cover = (x: number, y: number): void => {
      const cx = x + 0.5, cy = y + 0.5, t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / len2));
      this.blend(x, y, c, Math.max(0, Math.min(1, half + 0.5 - Math.hypot(cx - (a[0] + t * dx), cy - (a[1] + t * dy)))) * alpha);
    };
    const flat = Math.abs(dx) >= Math.abs(dy);
    const [u0, u1] = flat ? [Math.min(a[0], b[0]), Math.max(a[0], b[0])] : [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const slope = flat ? dy / (dx || 1) : dx / (dy || 1), across = pad * Math.sqrt(1 + slope * slope);
    const [au, av] = flat ? [a[0], a[1]] : [a[1], a[0]];
    const limitU = flat ? this.w : this.h, limitV = flat ? this.h : this.w;
    for (let u = Math.max(0, Math.floor(u0 - pad)); u <= Math.min(limitU - 1, Math.ceil(u1 + pad)); u++) {
      const along = Math.max(u0, Math.min(u1, u + 0.5)), mid = av + (along - au) * slope;
      for (let v = Math.max(0, Math.floor(mid - across)); v <= Math.min(limitV - 1, Math.ceil(mid + across)); v++) (flat ? cover(u, v) : cover(v, u));
    }
  }
  polygon(pts: Pt[], c: RGB, alpha: number): void {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(this.w - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    const inside = (px: number, py: number): boolean => { let on = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) on = !on; } return on; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
      this.blend(x, y, c, (hits / 9) * alpha);
    }
  }
  dot(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      this.blend(x, y, c, Math.max(0, Math.min(1, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy))) * alpha);
    }
  }
}

/** Draw shapes from the 400-unit square onto the canvas, scaled by `s` and moved by `ox, oy`. */
function draw(canvas: Canvas, shapes: Shape[], s: number, ox: number, oy: number): void {
  const at = ([x, y]: Pt): Pt => [x * s + ox, y * s + oy];
  for (const shape of shapes) {
    if (shape.k === 'fold') {
      // The straight run, then the curve sampled finely enough that no step is visible at card scale.
      canvas.segment(at(shape.from), at(shape.mid), shape.w * s, INK, 1);
      let prev = shape.mid;
      for (let t = 1; t <= 32; t++) { const u = t / 32, q: Pt = [(1 - u) ** 2 * shape.mid[0] + 2 * (1 - u) * u * shape.ctrl[0] + u * u * shape.to[0], (1 - u) ** 2 * shape.mid[1] + 2 * (1 - u) * u * shape.ctrl[1] + u * u * shape.to[1]]; canvas.segment(at(prev), at(q), shape.w * s, INK, 1); prev = q; }
      continue;
    }
    if (shape.k === 'ring') {
      // The dashes, cut here: arcs of `on` units every `on + off` around the circumference.
      const count = Math.floor((2 * Math.PI * shape.r) / (shape.on + shape.off));
      for (let d = 0; d < count; d++) {
        const a0 = (d * (shape.on + shape.off)) / shape.r, a1 = (d * (shape.on + shape.off) + shape.on) / shape.r;
        canvas.segment(at([shape.x + Math.cos(a0) * shape.r, shape.y + Math.sin(a0) * shape.r]), at([shape.x + Math.cos(a1) * shape.r, shape.y + Math.sin(a1) * shape.r]), shape.w * s, INK, 1);
      }
      continue;
    }
    const alpha = shape.a ?? 1;
    if (shape.k === 'dot') { canvas.dot(shape.x * s + ox, shape.y * s + oy, shape.r * s, INK, alpha); continue; }
    const pts = shape.pts.map(at), color = shape.hot ? HOT : INK;
    if (shape.k === 'fill') { canvas.polygon(pts, color, alpha); continue; }
    for (let i = 1; i < pts.length; i++) canvas.segment(pts[i - 1], pts[i], shape.w * s, color, alpha);
    if (shape.closed && pts.length > 2) canvas.segment(pts[pts.length - 1], pts[0], shape.w * s, color, alpha);
  }
}

// ---- PNG ------------------------------------------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function png(canvas: Canvas): Promise<Uint8Array<ArrayBuffer>> {
  const raw = new Uint8Array((canvas.w * 3 + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) { raw[y * (canvas.w * 3 + 1)] = 0; raw.set(canvas.px.subarray(y * canvas.w * 3, (y + 1) * canvas.w * 3), y * (canvas.w * 3 + 1) + 1); }
  const head = new Uint8Array(13), view = new DataView(head.buffer);
  view.setUint32(0, canvas.w); view.setUint32(4, canvas.h); head[8] = 8; head[9] = 2; // 8-bit truecolour
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** The card for a seed: its drawing across the card on its ground, the mark in the lower left. */
export async function cardPng(seed: string, kind?: Parameters<typeof shapesOf>[1]): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = new Canvas(CARD.w, CARD.h, GROUND[groundOf(seed)]);
  const s = Math.max(CARD.w, CARD.h) / SIZE;
  draw(canvas, shapesOf(seed, kind), s, (CARD.w - SIZE * s) / 2, (CARD.h - SIZE * s) / 2);
  // The mark on a paper plate, so it reads on any ground.
  canvas.polygon([[40, CARD.h - 104], [104, CARD.h - 104], [104, CARD.h - 40], [40, CARD.h - 40]], GROUND.paper, 1);
  canvas.polygon([[73, CARD.h - 96], [96, CARD.h - 96], [96, CARD.h - 73], [73, CARD.h - 73]], INK, 1);
  canvas.polygon([[48, CARD.h - 73], [73, CARD.h - 73], [73, CARD.h - 48], [48, CARD.h - 48]], INK, 1);
  return png(canvas);
}
