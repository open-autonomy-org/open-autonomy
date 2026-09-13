#!/usr/bin/env bun
// The dashboard's browser half, built for a deployment's assets: the hydrating bundle and the kit's stylesheet.
// `bun scripts/build-dash.ts <assets dir>`; a deployment's `build` runs it before `wrangler` does anything.
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'public/assets');
await mkdir(out, { recursive: true });
const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../src/dash/client.tsx')], outdir: out, naming: 'dashboard.js', target: 'browser', minify: true, sourcemap: 'none' });
if (!built.success) { for (const l of built.logs) console.error(String(l)); process.exit(1); }
await copyFile(Bun.resolveSync('@volter-ai-dev/supercode-ui/styles.css', import.meta.dir), resolve(out, 'dashboard.css'));
console.log(`dashboard assets built into ${out}`);
