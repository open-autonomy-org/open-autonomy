// Statements (ADR 0012): the owner's published word about the project, from a tool they run on their side. This is
// the model the platform checks a publication against, keeps every change of and draws; a publisher may check its
// statement with it first. The platform knows nothing of what a statement is about. Every badge lapses on its own
// date, checked at every read.

export const STATEMENT_TONES = ['positive', 'info', 'neutral', 'warning', 'negative'] as const;
export type StatementTone = typeof STATEMENT_TONES[number];
export interface StatementBadge { label: string; message: string; tone: StatementTone; until: string }
export interface Statement { id: string; title: string; source: { name: string; url?: string }; as_of: string; badges: StatementBadge[]; body_md?: string }
// One change to a statement: a publication that differed from the live one, or its withdrawal.
export interface StatementRevision { id: string; revision: number; ts: string; by: string; statement?: Statement; withdrawn?: true; changes: string[] }

export const MAX_STATEMENTS = 5;
const MAX_BADGES = 8;
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The dashboard's own pages and the rail's heading: no statement may take their words.
const TAKEN = new Set(['overview', 'sessions', 'board', 'books', 'agent', 'team', 'statements', 'stated by the owner']);

export const today = (now = Date.now()): string => new Date(now).toISOString().slice(0, 10);
const isDay = (s: unknown): s is string => typeof s === 'string' && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/[\u0000-\u001f]/.test(s);

// A statement as published, checked whole: any field out of shape or over its limit refuses it, never trims it.
export function checkStatement(raw: unknown, day: string, stored = false): { ok: true; statement: Statement } | { ok: false; error: 'invalid_statement' | 'lapsed_on_arrival'; field?: string } {
  const bad = (field: string) => ({ ok: false as const, error: 'invalid_statement' as const, field });
  if (!raw || typeof raw !== 'object') return bad('statement');
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID.test(r.id)) return bad('id');
  if (!text(r.title, 24) || TAKEN.has(r.title.trim().toLowerCase())) return bad('title');
  const src = r.source as Record<string, unknown> | undefined;
  if (!src || typeof src !== 'object' || !text(src.name, 60)) return bad('source.name');
  if (src.url !== undefined && (typeof src.url !== 'string' || src.url.length > 300 || !/^https?:\/\/[^\s<>"]+$/.test(src.url))) return bad('source.url');
  if (!isDay(r.as_of) || (!stored && r.as_of > day)) return bad('as_of');
  if (!Array.isArray(r.badges) || r.badges.length > MAX_BADGES) return bad('badges');
  const badges: StatementBadge[] = [];
  for (const [i, b] of (r.badges as unknown[]).entries()) {
    const x = b as Record<string, unknown> | undefined;
    // A label names its badge in the revisions' changes, so it is unique within the statement.
    if (!x || typeof x !== 'object' || !text(x.label, 40) || !text(x.message, 60) || badges.some((o) => o.label === (x.label as string).trim())) return bad(`badges[${i}]`);
    if (!(STATEMENT_TONES as readonly unknown[]).includes(x.tone)) return bad(`badges[${i}].tone`);
    if (!isDay(x.until)) return bad(`badges[${i}].until`);
    if (!stored && x.until < day) return { ok: false, error: 'lapsed_on_arrival', field: `badges[${i}].until` };
    badges.push({ label: x.label.trim(), message: x.message.trim(), tone: x.tone as StatementTone, until: x.until });
  }
  if (r.body_md !== undefined && (typeof r.body_md !== 'string' || new TextEncoder().encode(r.body_md).length > 8192)) return bad('body_md');
  const statement: Statement = { id: r.id, title: r.title.trim(), source: { name: src.name.trim(), ...(src.url ? { url: src.url as string } : {}) }, as_of: r.as_of, badges,
    ...(typeof r.body_md === 'string' && r.body_md.trim() ? { body_md: r.body_md } : {}) };
  return { ok: true, statement };
}

// What changed from one statement to the next, in words: badges by label, then the other fields.
export function statementChanges(before: Statement | undefined, after: Statement | undefined): string[] {
  if (!after) return ['withdrawn'];
  if (!before) return ['published'];
  const out: string[] = [];
  const old = new Map(before.badges.map((b) => [b.label, b]));
  const now = new Map(after.badges.map((b) => [b.label, b]));
  for (const [label, b] of now) {
    const o = old.get(label);
    if (!o) out.push(`badge added: ${label}`);
    else if (o.message !== b.message || o.tone !== b.tone || o.until !== b.until) out.push(`badge changed: ${label}`);
  }
  for (const label of old.keys()) if (!now.has(label)) out.push(`badge removed: ${label}`);
  if (before.title !== after.title) out.push('title changed');
  if (before.source.name !== after.source.name || before.source.url !== after.source.url) out.push('source changed');
  if ((before.body_md ?? '') !== (after.body_md ?? '')) out.push('body changed');
  if (before.as_of !== after.as_of) out.push('as of changed');
  return out;
}

// The badges that stand today, and the ones that lapsed: a badge stands through its `until` (UTC).
export function standing(s: Statement, day: string): { standing: StatementBadge[]; lapsed: StatementBadge[] } {
  return { standing: s.badges.filter((b) => b.until >= day), lapsed: s.badges.filter((b) => b.until < day) };
}

// A stored statement read back, for a state restored from storage: kept only if it still has the published shape.
// Its dates were checked when it was published; a badge that has lapsed since is kept, and drawn as lapsed.
export function storedStatement(raw: unknown): Statement | undefined {
  const r = checkStatement(raw, '', true);
  return r.ok ? r.statement : undefined;
}
