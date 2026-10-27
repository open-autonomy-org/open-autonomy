#!/usr/bin/env bun
// A host-owned listener, started once and reused by successive keepers. Board signals never reach this process.
import { serveCodex } from '../base/.open-autonomy/codex-proxy.ts';
import { initializeWorkLedger, flushWorkOnSignals } from '../base/.open-autonomy/work-ledger.ts';

const [port, binding, instance] = process.argv.slice(2);
if (!binding || !instance) throw new Error('Codex service needs its binding and instance identities');
await initializeWorkLedger('oa-codex-proxy', { kind: 'machine', id: `${binding}\0${port}` });
flushWorkOnSignals();
serveCodex(Number(port), { binding, instance });
console.log(`codex: independent host proxy listening on 127.0.0.1:${Number(port)} (pid ${process.pid})`);
