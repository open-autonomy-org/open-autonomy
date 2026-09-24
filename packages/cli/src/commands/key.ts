// oa key mint <owner/project> [--scopes steer] [--models a,b] [--out <file>]: a key the adopter way. The platform names
// a claim; the claim lands on the repository's default branch through its ordinary landing; the rerun mints. The
// key is written where the valves and this tool read it (~/.config/open-autonomy/<owner>/<project>/<name>.env),
// never printed.
// oa key mint <org>: the org's steer key (ADR 0010), the claim landed on <org>/.github's default branch; it pauses and
// resumes every project of the org, and nothing else.
// oa key rotate <owner/project> [--out <file>] [--grace <seconds>]: with the current key, no commit.
import * as p from '@clack/prompts';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { funderChallenge, keyChallenge, keyMint, keyRotate, orgMint } from '@open-autonomy/sdk/client';
import { checkoutProject as checkoutRepo, configDir, keyMatches, type Doors } from '../config.ts';
import { bold, c, dim, fail } from '../ui.ts';

const SCOPES = ['spend', 'pay', 'narrate', 'steer', 'give'];
const CLAIM_FILE = '.open-autonomy-claim';

function destination(acct: string, out: string | undefined, name: string): string {
  const path = resolve(out ?? join(configDir(acct), `${name}.env`));
  let existing;
  try { existing = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) fail(`${path} must be a regular file, not a symlink, hard link or directory`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existing) chmodSync(path, 0o600);
  return path;
}
function write(path: string, base: string, token: string): void {
  const keep = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((l) => !/^(OPEN_AUTONOMY_KEY|OPEN_AUTONOMY_BASE_URL)=/.test(l) && l.trim()) : [];
  writeFileSync(path, `${[...keep, `OPEN_AUTONOMY_BASE_URL=${base}`, `OPEN_AUTONOMY_KEY=${token}`].join('\n')}\n`, { mode: 0o600 });
}

export async function mint(d: Doors, opts: { scopes?: string; models?: string; out?: string; repo?: string }): Promise<void> {
  if (d.acct.startsWith('@')) return mintOrg(d, opts);
  const scopes = opts.scopes?.split(',').map((x) => x.trim()).filter(Boolean);
  if (scopes?.some((x) => !SCOPES.includes(x))) fail(`unknown scope in ${opts.scopes}`, `scopes: ${SCOPES.join(', ')}`);
  const models = opts.models?.split(',').map((x) => x.trim()).filter(Boolean);
  const name = scopes?.length === 1 && scopes[0] === 'steer' ? 'steer' : scopes?.includes('pay') ? 'treasurer' : 'agent';
  const path = destination(d.acct, opts.out, name);
  const minted = await keyMint(d.base, d.acct, models, scopes);
  const code = (minted as { error?: { code?: string } }).error?.code;
  if (code === 'claim_file_missing' || code === 'claim_mismatch') {
    const challenge = await keyChallenge(d.base, d.acct);
    if (!challenge.ok || challenge.file !== CLAIM_FILE) fail('the platform gave no claim for this project');
    const repo = resolve(opts.repo ?? '.');
    const claimPath = join(repo, CLAIM_FILE);
    const inRepo = existsSync(join(repo, '.git'));
    if (inRepo) {
      let existing; try { existing = lstatSync(claimPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) fail(`${claimPath} must be a regular file`);
      if (!existing || readFileSync(claimPath, 'utf8').trim() !== challenge.claim) writeFileSync(claimPath, `${challenge.claim}\n`);
    }
    if (d.json) { console.log(JSON.stringify({ ok: false, claim: challenge, written: inRepo ? claimPath : null }, null, 2)); process.exitCode = 1; return; }
    p.note([
      `The platform must see today's claim on ${bold(d.acct)}'s default branch before it mints.`,
      '',
      `  ${CLAIM_FILE}   ${c.cyan(challenge.claim)}   ${dim(`valid through ${challenge.valid_through}`)}`,
      '',
      inRepo ? `Written to ${claimPath}. Land it the way this repository lands anything, then run this command again.` : `Run this from a checkout of ${d.acct} (or pass --repo <dir>) to have it written, land it, then run this command again.`,
      dim('The raw host serves a landed file within a few minutes.'),
    ].join('\n'), 'A claim to land');
    process.exitCode = 1;
    return;
  }
  if (!minted.ok || !minted.token) fail(`mint refused: ${code ?? JSON.stringify(minted)}`);
  write(path, d.base, minted.token);
  if (d.json) { console.log(JSON.stringify({ ok: true, key: minted.key, file: path }, null, 2)); return; }
  console.log(`${c.green('✔')} key ${dim(minted.key.kid)} for ${bold(minted.key.account)} ${dim(`· ${scopes?.join(', ') ?? 'spend, narrate'} · models ${minted.key.models.join(', ')} · expires ${minted.key.exp.slice(0, 10)}`)}`);
  console.log(`  ${dim('written to')} ${path}`);
}

export async function rotate(d: Doors, opts: { out?: string; grace?: string }): Promise<void> {
  if (!d.key) fail(`no key for ${d.acct} to rotate`, 'pass --key <file>, or mint one');
  keyMatches(d);
  const path = destination(d.acct, opts.out ?? (d.key.from.endsWith('.env') ? d.key.from : undefined), d.key.kind ?? 'agent');
  const rotated = await keyRotate(d.base, d.key.token, opts.grace === undefined ? {} : { graceSeconds: Number(opts.grace) });
  if (!rotated.ok || !rotated.token) fail(`rotation refused: ${JSON.stringify(rotated)}`);
  write(path, d.base, rotated.token);
  if (d.json) { console.log(JSON.stringify({ ok: true, key: rotated.key, previous: rotated.previous, file: path }, null, 2)); return; }
  console.log(`${c.green('✔')} key rotated ${dim(`· ${rotated.key.kid} replaces ${rotated.previous?.kid ?? 'the previous'}${rotated.previous?.exp ? `, good until ${rotated.previous.exp}` : ''}`)}`);
  console.log(`  ${dim('written to')} ${path}`);
}

async function mintOrg(d: Doors, opts: { scopes?: string; models?: string; out?: string; repo?: string }): Promise<void> {
  const org = d.acct.slice(1);
  if ((opts.scopes && opts.scopes !== 'steer') || opts.models) fail(`an org's key only steers: its pause, which its projects inherit`, `oa key mint ${org}`);
  const path = destination(d.acct, opts.out, 'steer');
  const minted = await orgMint(d.base, org);
  const code = (minted as { error?: { code?: string } }).error?.code;
  if (code === 'claim_file_missing' || code === 'claim_mismatch') {
    const challenge = await funderChallenge(d.base, org);
    if (!challenge.ok || challenge.file !== CLAIM_FILE) fail(`the platform gave no claim for ${org}`);
    const repo = resolve(opts.repo ?? '.');
    const claimPath = join(repo, CLAIM_FILE);
    const inRepo = existsSync(join(repo, '.git')) && checkoutRepo(repo)?.toLowerCase() === `${org}/.github`.toLowerCase();
    if (inRepo) {
      let existing; try { existing = lstatSync(claimPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) fail(`${claimPath} must be a regular file`);
      if (!existing || readFileSync(claimPath, 'utf8').trim() !== challenge.claim) writeFileSync(claimPath, `${challenge.claim}\n`);
    }
    if (d.json) { console.log(JSON.stringify({ ok: false, claim: challenge, written: inRepo ? claimPath : null }, null, 2)); process.exitCode = 1; return; }
    p.note([
      `The platform must see today's claim on ${bold(`${org}/.github`)}'s default branch, the repository GitHub reads as the org's own.`,
      '',
      `  ${CLAIM_FILE}   ${c.cyan(challenge.claim)}   ${dim(`valid through ${challenge.valid_through}`)}`,
      '',
      inRepo ? `Written to ${claimPath}. Land it, then run this command again.` : `Run this from a checkout of ${org}/.github (or pass --repo <dir>) to have it written, land it, then run this command again.`,
      dim('The raw host serves a landed file within a few minutes.'),
    ].join('\n'), 'A claim to land');
    process.exitCode = 1;
    return;
  }
  if (!minted.ok || !minted.token) fail(`mint refused: ${code ?? JSON.stringify(minted)}`);
  write(path, d.base, minted.token);
  if (d.json) { console.log(JSON.stringify({ ok: true, key: minted.key, file: path }, null, 2)); return; }
  console.log(`${c.green('✔')} key ${dim(minted.key.kid)} for ${bold(org)} ${dim(`· steer: the org's pause, inherited by each of its projects · expires ${minted.key.exp.slice(0, 10)}`)}`);
  console.log(`  ${dim('written to')} ${path}`);
}
