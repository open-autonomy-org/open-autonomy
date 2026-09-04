#!/usr/bin/env bun
// Wait for the agent's own run (bun world/run.ts wait): the gateway's schedule fired, the reporter
// published the session, and what the run pushed landed through a pull request. Pure observation — the
// platform's sessions and the twin's pull requests — with a deadline. Exits non-zero if the run failed or
// nothing happened in time.
import { ACCOUNT, ENC, api, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const arg = (name: string, dflt: number) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
const deadline = Date.now() + arg('--timeout', 900) * 1000;
type Sess = { key: string; kind: string; status: string; outcome?: string | null; item_id?: string | null; report?: string | null };
type Pull = { number: number; merged: boolean; state: string; head: { ref: string } };
const pulls = async (): Promise<Pull[]> => ((await gh.get(`/repos/${ACCOUNT}/pulls?state=all&per_page=100`).catch(() => ({ body: null }))).body ?? []) as Pull[];
const sessions = async (): Promise<Sess[] | null> => { try { return ((await pub.get(`/v1/accounts/${ENC}/sessions`)).body?.sessions ?? []) as Sess[]; } catch { return null; } };
let initial: Sess[] | null = null;
while (initial === null) { initial = await sessions(); if (initial === null) await Bun.sleep(2000); }
const before = new Set(initial.map((s) => s.key));
const mergedBefore = new Set((await pulls()).filter((p) => p.merged).map((p) => p.number));
let seen: Sess | undefined;
let landed: Pull | undefined;
let noted = '';
for (;;) {
  if (Date.now() > deadline) { console.error(`wait: ${landed ? 'the run landed but the reporter never ended its session' : seen ? 'nothing landed' : 'nothing ran'} within the deadline`); process.exit(1); }
  const all = await sessions();
  if (all === null) { await Bun.sleep(2000); continue; }
  const current = all.filter((s) => !before.has(s.key) && s.kind === 'run')[0];
  if (current && !seen) {
    const line = `${current.key}: ${current.status}${current.outcome ? ` · ${current.outcome}` : ''}${current.item_id ? ` · ${current.item_id}` : ''}`;
    if (line !== noted) { console.log(`wait: run ${line}`); noted = line; }
    if (current.status === 'ended') {
      if (current.outcome !== 'done') { console.error(`wait: the run ended ${current.outcome ?? 'without a verdict'}${current.report ? `\n${current.report}` : ''}`); process.exit(1); }
      seen = current;
    }
  }
  // This fire's landing: a pull request from an agent branch merged since the wait began. The loop is over
  // once the reporter has ended the run's session too (a minute of silence after the agent's last word);
  // a landing with no session at all is reported as such and counts, so the loop can be watched without
  // a reporter.
  const merged = landed ?? (await pulls()).find((p) => p.merged && !mergedBefore.has(p.number) && p.head.ref.startsWith('agent/'));
  if (merged && !landed) { landed = merged; console.log(`wait: pull request #${merged.number} (${merged.head.ref}) merged on the twin${current ? '' : ' — no session was published for it'}`); }
  if (merged && (seen || !current)) process.exit(0);
  await Bun.sleep(5000);
}
