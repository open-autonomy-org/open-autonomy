#!/usr/bin/env bun
// Supervise only this host proxy's own listener. This retained process is outside every keeper generation.
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const [port, binding, instance] = process.argv.slice(2);
if (!binding || !instance || !Number.isInteger(Number(port))) throw new Error('Codex supervisor needs port, binding and instance');
let stopping = false, child: ChildProcess | undefined;
const stop = () => { stopping = true; child?.kill('SIGTERM'); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
while (!stopping) {
  const began = Date.now();
  child = spawn(process.execPath, [resolve(import.meta.dir, 'codex-service.ts'), port!, binding, instance], {
    env: process.env, stdio: ['ignore', 'inherit', 'inherit'],
  });
  const result = await new Promise<string>(done => {
    child!.once('error', error => done(error.message));
    child!.once('exit', (code, signal) => done(String(signal ?? code)));
  });
  if (stopping) break;
  console.error(`codex: owned listener ended (${result}); restarting from retained sources`);
  // A refused bind never stops whoever holds the port. Bound repeated startup failures without touching that owner.
  const delay = Math.max(0, 1000 - (Date.now() - began));
  if (delay) await Bun.sleep(delay);
}
