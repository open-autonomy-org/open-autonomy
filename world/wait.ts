#!/usr/bin/env bun
// Wait for the agent's own run (bun world/run.ts wait): the gateway's schedule fired, the run was narrated,
// and what it pushed landed through a pull request. Pure observation — the platform's receipts and the
// twin's pull requests — with a deadline. Exits non-zero if the run failed or nothing happened in time.
import { ACCOUNT, ENC, api, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const arg = (name: string, dflt: number) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : dflt; };
const deadline = Date.now() + arg('--timeout', 900) * 1000;
type Receipt = { key: string; status: string; item_id?: string | null; report?: string | null };
type Pull = { number: number; merged: boolean; state: string; head: { ref: string } };
const pulls = async (): Promise<Pull[]> => ((await gh.get(`/repos/${ACCOUNT}/pulls?state=all&per_page=100`).catch(() => ({ body: null }))).body ?? []) as Pull[];
// A read that fails (the platform restarting) is a retry, not a verdict.
const receipts = async (): Promise<Receipt[] | null> => { try { return ((await pub.get(`/v1/accounts/${ENC}/jobs`)).body?.jobs ?? []) as Receipt[]; } catch { return null; } };
let initial: Receipt[] | null = null;
while (initial === null) { initial = await receipts(); if (initial === null) await Bun.sleep(2000); }
const before = new Set(initial.map((r) => r.key));
const mergedBefore = new Set((await pulls()).filter((p) => p.merged).map((p) => p.number));
const finished = (r: Receipt) => r.status !== 'running' && r.status !== 'started';
let seen: Receipt | undefined;
let noted = '';
for (;;) {
  if (Date.now() > deadline) { console.error(`wait: nothing ${seen ? 'landed' : 'ran'} within the deadline`); process.exit(1); }
  const all = await receipts();
  if (all === null) { await Bun.sleep(2000); continue; }
  const fresh = all.filter((r) => !before.has(r.key));
  const current = fresh[0];
  if (current && !seen) {
    const line = `${current.key}: ${current.status}${current.item_id ? ` · ${current.item_id}` : ''}`;
    if (line !== noted) { console.log(`wait: run ${line}`); noted = line; }
    if (finished(current)) {
      if (current.status !== 'done') { console.error(`wait: the run finished ${current.status}${current.report ? `\n${current.report}` : ''}`); process.exit(1); }
      seen = current;
    }
  }
  if (seen) {
    // This fire's landing: a pull request from an agent branch merged since the wait began.
    const merged = (await pulls()).find((p) => p.merged && !mergedBefore.has(p.number) && p.head.ref.startsWith('agent/'));
    if (merged) { console.log(`wait: pull request #${merged.number} (${merged.head.ref}) merged on the twin`); process.exit(0); }
  }
  await Bun.sleep(5000);
}
