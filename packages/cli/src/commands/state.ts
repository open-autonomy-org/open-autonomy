// oa pause | oa resume <owner/project> [--reason]: the owner's word, recorded on the platform, applied by the
// project's own automation and answered through the SDK. The command waits a little for that answer.
import * as p from '@clack/prompts';
import type { Doors } from '../config.ts';
import { ago, c, dim, fail } from '../ui.ts';

export async function setState(d: Doors, state: 'running' | 'paused', opts: { reason?: string; wait: number }): Promise<void> {
  if (!d.key) fail(`${state === 'paused' ? 'pausing' : 'resuming'} ${d.acct} needs a steer key and none was found`, `oa key mint ${d.acct} --scopes steer, or --key <file>`);
  const tty = process.stdout.isTTY && !d.json;
  const spin = tty ? p.spinner() : undefined;
  spin?.start(`Recording the owner's word on ${d.acct}: ${state}`);
  const r = await d.oa.requestState(state, opts.reason);
  if (!r.ok) {
    spin?.stop(c.red('refused'));
    if (r.error === 'scope_required') fail(`the key from ${d.key.from} cannot steer ${d.acct}`, `an owner-side key carries the steer scope: oa key mint ${d.acct} --scopes steer`);
    if (r.error === 'auth_failed') fail(`the key from ${d.key.from} was refused`, 'expired or rotated; mint again');
    fail(`the platform refused: ${r.error ?? r.status}`);
  }
  if (d.json) { console.log(JSON.stringify(r, null, 2)); return; }
  const recorded = `${d.acct}: ${state === 'paused' ? c.red('paused') : c.green('running')} ${dim(`· recorded${r.unchanged ? ', unchanged' : ''} · by ${r.desired?.by ?? d.key.kind ?? 'this key'}`)}`;
  if (spin) spin.stop(recorded); else console.log(recorded);
  // The automation answers on its next tick (the kit's reporter: within ten seconds or so).
  const already = r.observed?.state === state;
  if (already) { console.log(`  ${dim('observed')} ${state}${r.observed?.note ? dim(` · ${r.observed.note}`) : ''}`); return; }
  const wait = tty ? p.spinner() : undefined;
  wait?.start(`Waiting for ${d.acct}'s automation to answer`);
  const until = Date.now() + opts.wait * 1000;
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, 2000));
    const now = await d.oa.state(d.acct);
    if (now?.observed?.state === state && Date.parse(now.observed.at) >= Date.parse(r.desired?.at ?? '0')) {
      const answered = `  ${dim('observed')} ${state} ${dim(`· ${ago(now.observed.at)}${now.observed.note ? ` · ${now.observed.note}` : ''}`)}`;
      if (wait) wait.stop(answered); else console.log(answered);
      return;
    }
  }
  const late = dim(`  not answered within ${opts.wait}s; the word is recorded and the page says "${state === 'paused' ? 'Pause requested' : 'Running'}" until the automation answers (oa status ${d.acct})`);
  if (wait) wait.stop(late); else console.log(late);
}
