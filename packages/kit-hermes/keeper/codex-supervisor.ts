#!/usr/bin/env bun
// Supervise only this host proxy's own listener. This retained process is outside every keeper generation.
import { initializeWorkLedger, closeWorkLedger, recordWork, spawnWork } from '../base/.open-autonomy/work-ledger.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const [port, binding, instance] = process.argv.slice(2);
if (!binding || !instance || !Number.isInteger(Number(port))) throw new Error('Codex supervisor needs port, binding and instance');
await initializeWorkLedger('oa-codex-supervisor', { kind: 'machine', id: `${binding}\0${port}` });
let stopping = false, child: ChildProcess | undefined;
const stop = () => { stopping = true; child?.kill('SIGTERM'); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
while (!stopping) {
  const began = Date.now();
  child = spawnWork(() => spawn(process.execPath, [resolve(import.meta.dir, 'codex-service.ts'), port!, binding, instance], {
    env: process.env, stdio: ['ignore', 'inherit', 'inherit'],
  }), 'node');
  const result = await new Promise<string>(done => {
    child!.once('error', error => done(error.message));
    child!.once('exit', (code, signal) => done(String(signal ?? code)));
  });
  if (stopping) break;
  recordWork('pass', 'supervisor.restart');
  console.error(`codex: owned listener ended (${result}); restarting from retained sources`);
  // A refused bind never stops whoever holds the port. Bound repeated startup failures without touching that owner.
  const delay = Math.max(0, 1000 - (Date.now() - began));
  if (delay) await Bun.sleep(delay);
}
await closeWorkLedger();
