// oa sessions <owner/project>: the stream, newest first.
// oa session <owner/project> <key> [--follow]: one session's transcript, and its turns as they land while live.
import { ReadError, type Turn } from '@open-autonomy/sdk/client';
import type { Doors } from '../config.ts';
import { ago, bold, c, dim, dur, fail, firstLine, outcome, plain, table, usd, when, wrap } from '../ui.ts';

const closed = (e: unknown, what: string): never => {
  if (e instanceof ReadError && e.code === 'not_open') fail(`${what} not open to this view`, 'the owner keeps this panel from the public; pass --key with the project\'s key, or sign in on the page');
  throw e;
};

export async function sessions(d: Doors, opts: { limit: number }): Promise<void> {
  const stream = await d.oa.sessions(d.acct, opts.limit).catch((e) => closed(e, 'sessions'));
  if (d.json) { console.log(JSON.stringify(stream, null, 2)); return; }
  if (!stream.sessions.length) { console.log(dim('no sessions yet')); return; }
  console.log(table(
    [{ head: 'when' }, { head: 'job' }, { head: 'outcome' }, { head: 'turns', right: true }, { head: 'cost', right: true }, { head: 'said', max: 72 }, { head: 'key' }],
    stream.sessions.map((s) => [
      ago(s.started_at), s.kind === 'run' ? s.source ?? s.kind : `${s.source ?? s.kind} ${dim('· chat')}`, outcome(s), String(s.turn_count), usd(s.usd_cents),
      s.report && s.report !== '[SILENT]' ? firstLine(s.report, 72) : dim('—'), dim(s.key),
    ]),
  ));
}

// A turn in the terminal's words: the agent's text as prose, a tool call as its command, a result by its first lines.
const arg = (args: string | undefined): string => { try { const a = JSON.parse(args ?? '{}') as Record<string, unknown>; const v = a.command ?? a.cmd ?? a.path ?? a.query ?? a.url; return typeof v === 'string' ? v : ''; } catch { return ''; } };
const unwrap = (result: string | undefined): string => { const r = (result ?? '').trim(); if (r.startsWith('{')) { try { const o = JSON.parse(r) as Record<string, unknown>; const s = o.output ?? o.stdout ?? o.result ?? o.text; if (typeof s === 'string') return s; } catch { /* as written */ } } return r; };
function turnLines(t: Turn): string {
  const label = (s: string, paint: (x: string) => string) => paint(s.padEnd(9));
  if (t.role === 'assistant' && t.tool) return `${label('agent', c.magenta)} ${c.yellow('▸')} ${c.yellow(t.tool)} ${arg(t.args) || dim(t.args ?? '')}`;
  if (t.role === 'assistant') return `${label('agent', c.magenta)} ${wrap(plain(t.text ?? ''), undefined, ' '.repeat(10)).trimStart()}`;
  if (t.role === 'tool') { const out = unwrap(t.result).split('\n').slice(0, 4); return `${label(t.tool ?? 'tool', dim)} ${dim(out.join('\n' + ' '.repeat(10)))}${unwrap(t.result).split('\n').length > 4 ? dim(' …') : ''}`; }
  return `${label(t.role, c.cyan)} ${wrap(t.text ?? '', undefined, ' '.repeat(10)).trimStart()}`;
}

export async function session(d: Doors, key: string, opts: { follow: boolean; tail: number }): Promise<void> {
  const s = await d.oa.session(d.acct, key).catch((e) => closed(e, 'the transcript'));
  if (!s) fail(`no session ${key} on ${d.acct}`);
  if (d.json) { console.log(JSON.stringify(s, null, 2)); return; }
  const live = s.status === 'live';
  console.log(`${bold(s.source ?? s.kind)} ${dim(`· ${when(s.started_at)} · ${live ? c.green('live') : `${s.outcome ?? 'ended'} in ${dur(s.started_at, s.ended_at)}`} · ${s.turn_count} turns · ${usd(s.usd_cents)} · ${s.calls} model calls${s.item_id ? ` · on ${s.item_id}` : ''}`)}`);
  console.log();
  const shown = opts.tail > 0 ? s.turns.slice(-opts.tail) : s.turns;
  if (opts.tail > 0 && s.turns.length > shown.length) console.log(dim(`  … ${s.turns.length - shown.length} earlier turns (--tail 0 for all)`));
  for (const t of shown) console.log(turnLines(t));
  if (s.report && s.report !== '[SILENT]' && !live) { console.log(); console.log(`${c.magenta('report'.padEnd(9))} ${wrap(plain(s.report), undefined, ' '.repeat(10)).trimStart()}`); }
  if (!opts.follow || !live) return;
  const seq = s.turns.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1);
  console.log(dim('  following · ^C to stop'));
  for await (const ev of d.oa.follow(d.acct, key, seq)) {
    if (ev.event === 'turn') console.log(turnLines(ev.turn));
    else if (ev.status !== 'live') console.log(dim(`  ended · ${ev.turn_count} turns · ${usd(ev.usd_cents)}`));
  }
}
