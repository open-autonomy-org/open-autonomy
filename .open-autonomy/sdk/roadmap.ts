// The roadmap model and its codec. ROADMAP.yml is the roadmap's home in git and the only place it is
// written; this module reads it into a typed shape and writes it back byte for byte. The codec keeps
// every source line, so parse → serialize is the identity and an edit rewrites only the line it touches.
// Adapters (a tracker that mirrors the roadmap, a page that renders it) are what the shape is for.
//
// The file's shape, as every kit writes it:
//
//   # comments and blank lines, kept verbatim
//   schema: open-autonomy.roadmap.v3
//   items:
//     - id: <id>
//       phase: <n>          (optional)
//       priority: <word>    (optional)
//       status: proposed | planned | active | done
//       title: <text>
//       acceptance:
//         - <line>

export const ROADMAP_SCHEMA = 'open-autonomy.roadmap.v3';
export type RoadmapStatus = 'proposed' | 'planned' | 'active' | 'done';
export const ROADMAP_STATUSES: readonly RoadmapStatus[] = ['proposed', 'planned', 'active', 'done'];

export interface RoadmapItem {
  id: string;
  title: string;
  status: RoadmapStatus;
  phase?: string;
  priority?: string;
  acceptance: string[];
}

export interface Roadmap {
  schema: string;
  items: RoadmapItem[];
}

// The parsed document: the model plus the source it came from, so it can be written back unchanged.
export interface RoadmapDocument extends Roadmap {
  lines: string[];
  // For each item, the index of its `- id:` line and of each scalar field line it carries.
  spans: Array<{ id: string; start: number; end: number; fields: Record<string, number> }>;
}

function unquote(s: string): string {
  const t = s.trim();
  const m = /^(['"])(.*)\1$/.exec(t);
  return m ? m[2].replace(/\\"/g, '"').replace(/''/g, "'") : t;
}

function quoteIfNeeded(s: string): string {
  return /^[\w][^:#]*$/.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s);
}

export function parseRoadmap(text: string): RoadmapDocument {
  const lines = text.split('\n');
  const doc: RoadmapDocument = { schema: '', items: [], lines, spans: [] };
  let cur: { item: RoadmapItem; span: RoadmapDocument['spans'][number]; inAcceptance: boolean } | null = null;
  const close = (end: number) => { if (cur) { cur.span.end = end; doc.items.push(cur.item); doc.spans.push(cur.span); cur = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const schema = /^schema:\s*(.+?)\s*$/.exec(line);
    if (schema && !cur) { doc.schema = unquote(schema[1]); continue; }
    const idm = /^(\s*)-\s+id:\s*(.+?)\s*$/.exec(line);
    if (idm) {
      close(i);
      cur = { item: { id: unquote(idm[2]), title: '', status: 'planned', acceptance: [] }, span: { id: unquote(idm[2]), start: i, end: lines.length, fields: { id: i } }, inAcceptance: false };
      continue;
    }
    if (!cur) continue;
    const field = /^\s+(phase|priority|status|title):\s*(.*?)\s*$/.exec(line);
    if (field) {
      cur.inAcceptance = false;
      const [, key, raw] = field;
      const val = unquote(raw);
      cur.span.fields[key] = i;
      if (key === 'phase') cur.item.phase = val;
      else if (key === 'priority') cur.item.priority = val;
      else if (key === 'status') cur.item.status = (ROADMAP_STATUSES as readonly string[]).includes(val) ? val as RoadmapStatus : 'planned';
      else cur.item.title = val;
      continue;
    }
    if (/^\s+acceptance:\s*$/.test(line)) { cur.inAcceptance = true; cur.span.fields.acceptance = i; continue; }
    const bullet = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (bullet && cur.inAcceptance) { cur.item.acceptance.push(unquote(bullet[1])); continue; }
    if (/^\S/.test(line)) close(i); // a top-level key ends the items block
  }
  close(lines.length);
  return doc;
}

// The source, unchanged: parse(text) → serialize is the identity.
export function serializeRoadmap(doc: RoadmapDocument): string {
  return doc.lines.join('\n');
}

// A new document with one item's status changed; only that line differs from the source.
export function withStatus(doc: RoadmapDocument, itemId: string, status: RoadmapStatus): RoadmapDocument {
  const span = doc.spans.find((s) => s.id === itemId);
  if (!span) throw new Error(`roadmap: no item ${itemId}`);
  const lines = [...doc.lines];
  const at = span.fields.status;
  if (at !== undefined) lines[at] = lines[at].replace(/^(\s+status:\s*).*$/, `$1${status}`);
  else {
    const indent = (lines[span.start].match(/^\s*/)?.[0].length ?? 0) + 2;
    lines.splice(span.start + 1, 0, `${' '.repeat(indent)}status: ${status}`);
  }
  return parseRoadmap(lines.join('\n'));
}

// A fresh roadmap file from a model (what a kit writes at create time).
export function renderRoadmap(roadmap: Roadmap, header = ''): string {
  const out: string[] = [];
  if (header) out.push(...header.trimEnd().split('\n').map((l) => (l.startsWith('#') || !l ? l : `# ${l}`)));
  out.push(`schema: ${roadmap.schema || ROADMAP_SCHEMA}`, 'items:');
  for (const it of roadmap.items) {
    out.push(`  - id: ${it.id}`);
    if (it.phase !== undefined) out.push(`    phase: ${it.phase}`);
    if (it.priority !== undefined) out.push(`    priority: ${it.priority}`);
    out.push(`    status: ${it.status}`, `    title: ${quoteIfNeeded(it.title)}`);
    if (it.acceptance.length) { out.push('    acceptance:'); for (const a of it.acceptance) out.push(`      - ${quoteIfNeeded(a)}`); }
  }
  return `${out.join('\n')}\n`;
}

// Where an item stands, for a renderer: the status as written, anything unrecognized queued.
export type RoadmapState = 'proposed' | 'queued' | 'active' | 'done';
export function itemState(item: Pick<RoadmapItem, 'status'>): RoadmapState {
  if (item.status === 'proposed' || item.status === 'active' || item.status === 'done') return item.status;
  return 'queued';
}

export function phaseNumber(item: Pick<RoadmapItem, 'phase'>): number {
  const n = parseInt(item.phase ?? '', 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// The item the agent works next: the first active, else the first planned, in phase order.
export function nextItem(roadmap: Roadmap): RoadmapItem | undefined {
  const ordered = [...roadmap.items].sort((a, b) => phaseNumber(a) - phaseNumber(b));
  return ordered.find((i) => i.status === 'active') ?? ordered.find((i) => i.status === 'planned');
}
