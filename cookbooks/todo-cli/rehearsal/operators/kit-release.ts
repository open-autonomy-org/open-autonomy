// Publish an explicit rehearsal release through the npm registry API in the world.
// Pack copies of the current SDK and kit; the source tree is untouched.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DATA, ROOT } from '../../.open-autonomy/rehearsal/lib.ts';
const TREE = resolve(ROOT, '..', '..'); // this cookbook lives in Open Autonomy's tree, whose kit and SDK are packed

if (!process.env.VOLTER_WORLD) throw new Error('publish the rehearsal kit inside volter-world attach');
const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+$/.test(target)) throw new Error('usage: kit-release.ts <fresh stable version>');
const registry = process.env.NPM_REGISTRY_TWIN_URL;
if (!registry) throw new Error('the world must contain an npm registry twin');
const dir = resolve(DATA, 'kit-release');
mkdirSync(dir, { recursive: true });
for (const pkg of ['sdk', 'kit-hermes']) {
  const cwd = resolve(dir, pkg);
  rmSync(cwd, { recursive: true, force: true });
  cpSync(resolve(TREE, 'packages', pkg), cwd, { recursive: true, filter: (p) => !p.includes('/node_modules') });
  const path = resolve(cwd, 'package.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (pkg === 'sdk') {
    const existing = await fetch(`${registry}/${encodeURIComponent(data.name)}/${data.version}`);
    if (existing.ok) { console.log(`world registry: reusing ${data.name}@${data.version}`); continue; }
    if (existing.status !== 404) throw new Error(`read SDK release: ${existing.status}`);
  }
  if (pkg === 'kit-hermes') {
    data.version = target;
    data.dependencies['@open-autonomy/sdk'] = JSON.parse(readFileSync(resolve(TREE, 'packages/sdk/package.json'), 'utf8')).version;
    const src = resolve(cwd, 'src/kit.ts');
    writeFileSync(src, readFileSync(src, 'utf8').replace(/version: '[0-9.]+'/, `version: '${target}'`));
  }
  writeFileSync(path, JSON.stringify(data, null, 2));
  const packed = Bun.spawnSync({ cmd: ['bun', 'pm', 'pack', '--destination', dir, '--quiet'], cwd, stdout: 'pipe', stderr: 'pipe' });
  if (packed.exitCode) throw new Error(packed.stderr.toString());
  const filename = packed.stdout.toString().trim().split('/').pop()!;
  const bytes = readFileSync(resolve(dir, filename));
  const metadata = { ...data, _id: `${data.name}@${data.version}`, dist: {
    tarball: `${registry}/${data.name}/-/${filename}`,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex'),
  } };
  const response = await fetch(`${registry}/${encodeURIComponent(data.name)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer world-publisher' },
    body: JSON.stringify({ _id: data.name, name: data.name, 'dist-tags': { latest: data.version },
      versions: { [data.version]: metadata }, _attachments: { [filename]: {
        content_type: 'application/octet-stream', data: bytes.toString('base64'), length: bytes.length,
      } } }),
  });
  if (!response.ok) throw new Error(`publish ${metadata._id}: ${response.status} ${await response.text()}`);
  console.log(`world registry: published ${metadata._id}`);
}
