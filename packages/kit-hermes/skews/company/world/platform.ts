#!/usr/bin/env bun
// The platform (Open Autonomy's apps/platform/world.ts, the first argument) with its gateway key: the organization the
// World's Merge twin made (world/gateway.ts), as an operator sets MODEL_GATEWAY_API_KEY.
import { readFileSync } from 'node:fs';
const [entry, ...rest] = process.argv.slice(2);
const key = readFileSync(`${process.env.VOLTER_WORLD_DATA}/gateway.key`, 'utf8').trim();
const platform = Bun.spawn({ cmd: ['bun', entry!, ...rest], env: { ...process.env, MODEL_GATEWAY_API_KEY: key }, stdout: 'inherit', stderr: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => platform.kill(signal));
process.exit(await platform.exited);
