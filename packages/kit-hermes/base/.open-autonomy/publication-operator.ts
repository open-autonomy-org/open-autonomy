#!/usr/bin/env bun
// Explicit local enrollment/adoption under existing filesystem custody. This door
// neither reads native stores nor calls a service, and never invents legacy aliases.
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { PublicationStore, retainedDigest, savePublicationBytes, savePublicationFile, type NativeRuntimeSelection } from './publication.ts';
const args = process.argv.slice(2), command = args.shift();
const all = (key: string): string[] => args.flatMap((value, i) => value === key ? [args[i + 1] ?? ''] : []);
const one = (key: string): string | undefined => { const values = all(key); if (values.length > 1) throw new Error(`Repeated ${key}`); return values[0]; };
const need = (key: string): string => { const value = one(key); if (!value) throw new Error(`Required ${key}`); return value; };
const readJSON = (file: string): any => { if (lstatSync(file).isSymbolicLink()) throw new Error(`Refusing symlink ${file}`); return JSON.parse(readFileSync(file, 'utf8')); };
try {
  const configFile = resolve(need('--config')), text = readFileSync(configFile, 'utf8'), cfg = Bun.YAML.parse(text) as any;
  if (!cfg || typeof cfg.account !== 'string' || !cfg.account) throw new Error('Reporter configuration needs its explicit OA account');
  const base = dirname(configFile), stateFile = resolve(one('--state-file') ?? resolve(base, cfg.state_file ?? 'reporter-state.json'));
  const cacheFile = resolve(one('--cache-file') ?? `${stateFile}.board.json`);
  const apiBase = `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`;
  const runtime = (): NativeRuntimeSelection => {
    const kind = need('--kind'); if (kind !== 'hermes' && kind !== 'orchestrator') throw new Error('--kind must be hermes or orchestrator');
    const selected = { kind, root: resolve(need('--root')) } as NativeRuntimeSelection;
    if (cfg.native_runtime && (cfg.native_runtime.kind !== kind || resolve(cfg.native_runtime.root) !== selected.root)) throw new Error('Selected runtime conflicts with reporter declaration');
    return selected;
  };
  if (command === 'status') {
    console.log(JSON.stringify({ account: cfg.account, apiBase, enrolled: Boolean(cfg.publication), reporter: existsSync(stateFile) ? { version: readJSON(stateFile).version, digest: retainedDigest(stateFile) } : null, cache: existsSync(cacheFile) ? { version: readJSON(cacheFile).version, digest: retainedDigest(cacheFile) } : null, lock: existsSync(`${stateFile}.lock`) ? readJSON(resolve(`${stateFile}.lock`, 'owner.json')) : null }, null, 2));
  } else if (command === 'enroll' || command === 'prepare-adoption') {
    if (cfg.publication) throw new Error('Publication is already declared; no fresh contexts overwrite an enrollment');
    if (existsSync(`${stateFile}.lock`)) throw new Error('Publisher ownership is held/unknown; stop its owner first');
    if (command === 'enroll' && (existsSync(stateFile) || existsSync(cacheFile))) throw new Error('Retained state requires prepare-adoption and an exact reviewed alias manifest');
    if (command === 'prepare-adoption' && (!existsSync(stateFile) || !existsSync(cacheFile) || readJSON(stateFile).version !== 2 || readJSON(cacheFile).version !== 1)) throw new Error('Legacy preparation requires original version2 reporter and version1 cache');
    const selected = runtime(), boards = all('--backing-board'), contexts = all('--store-context');
    if (!boards.length || boards.some(board => !board) || new Set(boards).size !== boards.length || (contexts.length && contexts.length !== boards.length)) throw new Error('Explicit unique --backing-board selectors and matching optional --store-context values required');
    const sourceContext = one('--source-context') ?? randomUUID(), stores = boards.map((backing_board, i) => ({ context: contexts[i] ?? randomUUID(), backing_board }));
    const validUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (!validUUID.test(sourceContext) || stores.some(store => !validUUID.test(store.context)) || new Set(stores.map(store => store.context)).size !== stores.length) throw new Error('OA contexts must be unique lowercase UUIDv4 values');
    const privateDirectory = resolve(base, 'publication-private');
    if (existsSync(privateDirectory) && lstatSync(privateDirectory).isSymbolicLink()) throw new Error('Private publication directory must not be a symlink');
    mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
    const custodyName = `publication-private/${basename(configFile)}.custody.json`, custodyFile = resolve(base, custodyName);
    if (existsSync(custodyFile)) throw new Error('Custody declaration already exists; retain it and reconcile incomplete enrollment explicitly');
    const custody = { version: 1, generation: 1, account: cfg.account, apiBase, sourceContext, stores, nativeRuntime: selected, operator: need('--operator'), statement: need('--statement'), evidence: need('--evidence') };
    const publication = { source_context: sourceContext, stores, custody: custodyName };
    const declared = { ...cfg, publication };
    // Block mappings support an append that retains comments. A complete flow
    // mapping cannot accept another top-level block: serialize its existing data.
    let prepared = `${text}${text.endsWith('\n') ? '' : '\n'}\npublication: ${JSON.stringify(publication)}\n`;
    try { if (JSON.stringify(Bun.YAML.parse(prepared)) !== JSON.stringify(declared)) prepared = Bun.YAML.stringify(declared) + '\n'; }
    catch { prepared = Bun.YAML.stringify(declared) + '\n'; }
    if (JSON.stringify(Bun.YAML.parse(prepared)) !== JSON.stringify(declared)) throw new Error('Prepared publication configuration does not preserve the existing parsed data');
    // Keep original bytes before either enrollment write. A partial operation
    // retains these and the exact declaration; it never creates replacement IDs.
    const beforeFile = resolve(privateDirectory, `${basename(configFile)}.before-enrollment.yaml`);
    if (existsSync(beforeFile)) throw new Error('Original enrollment configuration already retained; reconcile the prior operation explicitly');
    savePublicationBytes(beforeFile, text);
    savePublicationFile(custodyFile, custody);
    savePublicationBytes(configFile, prepared);
    console.log(JSON.stringify({ account: cfg.account, publication, ...(command === 'prepare-adoption' ? { reporterDigest: retainedDigest(stateFile), cacheDigest: retainedDigest(cacheFile), next: 'Supply explicit reviewed items/notes/sessions provenance in adoption JSON; adopt does not infer it.' } : { next: 'Review/commit the association configuration; native execution is unchanged.' }) }, null, 2));
  } else if (command === 'adopt') {
    if (!cfg.publication) throw new Error('Run prepare-adoption and review its explicit source declaration first');
    const store = new PublicationStore({ configFile, stateFile, cacheFile, publication: { ...cfg.publication, adoption: need('--manifest') }, account: cfg.account, apiBase, nativeRuntime: runtime() });
    await store.close(); console.log('Explicit adoption saved; original bytes retained. Next publisher start requires a genuine full native snapshot.');
  } else if (command === 'release-lock') {
    if (!args.includes('--same-executor-stopped')) throw new Error('Release requires verified teardown in the same executor/process namespace');
    const lock = `${stateFile}.lock`, owner = readJSON(resolve(lock, 'owner.json'));
    if (owner.nonce !== need('--nonce') || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Lock owner nonce/process identity differs');
    try { process.kill(owner.pid, 0); throw new Error('Publication owner process still exists; release refused'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    rmSync(lock, { recursive: true }); console.log('Verified stopped local publisher lock released; publication state retained.');
  } else throw new Error('Use status, enroll, prepare-adoption, adopt or release-lock with --config FILE; run this door inside the owning World/executor.');
} catch (error) { console.error(`publication: ${(error as Error).message}`); process.exitCode = 1; }
