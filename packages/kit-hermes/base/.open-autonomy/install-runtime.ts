#!/usr/bin/env bun
// Install the same version contract from npm, a review registry or exact npm-pack artifacts.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

type Options = {
  directory: string;
  environment: Record<string, string>;
  command?: (args: string[]) => string[];
  frozen?: boolean;
  registry?: string;
  archive?: string;
  lockOnly?: boolean;
  // Told of the install's child the moment it starts, so a caller that stops on a signal can stop it too, rather than
  // leave a `bun install` running with nobody waiting on it.
  started?: (child: ReturnType<typeof Bun.spawn>) => void;
};

function archivePaths(archive?: string): string[] {
  if (!archive) return [];
  const path = resolve(archive);
  return statSync(path).isDirectory()
    ? readdirSync(path).filter(name => name.endsWith('.tgz')).sort().map(name => join(path, name))
    : [path];
}

export function runtimeInstallIdentity(options: Pick<Options, 'directory' | 'registry' | 'archive'>): string {
  const hash = createHash('sha256').update(readFileSync(join(options.directory, 'package.json')));
  for (const name of ['bun.lock', 'bun.lockb']) {
    const path = join(options.directory, name);
    if (existsSync(path)) hash.update(name).update(readFileSync(path));
  }
  hash.update(options.registry ?? 'https://registry.npmjs.org');
  for (const path of archivePaths(options.archive)) hash.update(readFileSync(path));
  return hash.digest('hex');
}

export async function installHostRuntime(options: Options): Promise<void> {
  const registry = new URL(options.registry ?? 'https://registry.npmjs.org');
  if (!['http:', 'https:'].includes(registry.protocol) || registry.username || registry.password) {
    throw new Error('Runtime registry must be an HTTP(S) URL without credentials');
  }
  const artifacts = new Map<string, { manifest: any; bytes: Buffer; sha256: string; integrity: string }>();
  for (const path of archivePaths(options.archive)) {
    const packed = Bun.spawnSync(['tar', '-xOf', path, 'package/package.json']);
    if (packed.exitCode !== 0) throw new Error(`Cannot read runtime package ${path}`);
    const manifest = JSON.parse(packed.stdout.toString());
    if (!/^@volter\/[a-z0-9-]+$/.test(manifest.name) || typeof manifest.version !== 'string') {
      throw new Error('Runtime archive must be a versioned @volter package');
    }
    if (artifacts.has(manifest.name)) throw new Error(`Duplicate candidate package ${manifest.name}`);
    const bytes = readFileSync(path);
    artifacts.set(manifest.name, { manifest, bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` });
  }
  if (options.archive && artifacts.size === 0) throw new Error('Runtime artifact directory contains no npm-pack archives');
  // The installer serves immutable archives on loopback; all other locked dependencies use the normal registry.
  // No source override or alternate event implementation enters the consumer process.
  const server = artifacts.size ? Bun.serve({ hostname: '127.0.0.1', port: 0,
    async fetch(request, server) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Read only', { status: 405 });
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      for (const [name, artifact] of artifacts) {
        const tarPath = `/${name}/-/${name.split('/')[1]}-${artifact.manifest.version}.tgz`;
        if (pathname === tarPath) return new Response(request.method === 'HEAD' ? null : artifact.bytes,
          { headers: { 'content-type': 'application/octet-stream' } });
        if (pathname === `/${name}` || pathname === `/${name}/${artifact.manifest.version}`) {
          const version = { ...artifact.manifest, dist: { tarball: `http://127.0.0.1:${server.port}${tarPath}`, integrity: artifact.integrity } };
          if (pathname !== `/${name}`) return Response.json(version);
          const upstreamUrl = new URL(registry);
          upstreamUrl.pathname = `${registry.pathname.replace(/\/$/, '')}/${encodeURIComponent(name)}`;
          const response = await fetch(upstreamUrl);
          if (!response.ok && response.status !== 404) throw new Error(`Runtime registry metadata returned HTTP ${response.status}`);
          const upstream = response.ok ? await response.json() as any : {};
          return Response.json({ ...upstream, name,
            'dist-tags': { ...upstream['dist-tags'], latest: version.version },
            versions: { ...upstream.versions, [version.version]: version } });
        }
      }
      const target = new URL(registry);
      target.pathname = `${registry.pathname.replace(/\/$/, '')}${new URL(request.url).pathname}`;
      target.search = new URL(request.url).search;
      const response = await fetch(target, { method: request.method });
      // fetch decodes compressed responses; preserve the decoded stream without its wire encoding headers.
      const headers = new Headers(response.headers);
      headers.delete('content-encoding'); headers.delete('content-length');
      return new Response(response.body, { status: response.status, headers });
    }
  }) : undefined;
  const lockPath = join(options.directory, 'bun.lock');
  const previousLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : undefined;
  try {
    for (const [name, artifact] of artifacts) console.log(`runtime candidate: ${name}@${artifact.manifest.version} sha256=${artifact.sha256}`);
    const endpoint = server ? `http://127.0.0.1:${server.port}` : registry.href;
    const args = ['bun', 'install', '--registry', endpoint, ...(server ? ['--no-cache'] : []), ...(options.frozen ? ['--frozen-lockfile'] : []), ...(options.lockOnly ? ['--lockfile-only'] : [])];
    const child = Bun.spawn((options.command ?? (args => args))(args), {
      cwd: options.directory, env: options.environment, stdout: 'inherit', stderr: 'inherit'
    });
    options.started?.(child);
    const code = await child.exited;
    if (code !== 0) throw new Error(`Runtime dependency installation exited ${code}`);
    // Commit registry-neutral resolution with the candidate integrity, never an ephemeral review listener.
    if (server && existsSync(lockPath)) {
      const original = readFileSync(lockPath, 'utf8');
      let normalized = original;
      for (const [name, artifact] of artifacts) {
        const url = `http://127.0.0.1:${server.port}/${name}/-/${name.split('/')[1]}-${artifact.manifest.version}.tgz`;
        normalized = normalized.replaceAll(JSON.stringify(url), '""');
      }
      if (normalized !== original) writeFileSync(lockPath, normalized);
    }
  } catch (error) {
    if (previousLock !== undefined) writeFileSync(lockPath, previousLock);
    throw error;
  } finally { server?.stop(true); }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const value = (name: string) => { const index = argv.indexOf(name); if (index < 0) return undefined;
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${name} needs a value`);
    return argv[index + 1]; };
  await installHostRuntime({ directory: resolve(value('--directory') ?? dirname(import.meta.path)),
    environment: process.env as Record<string, string>, registry: value('--runtime-registry'), archive: value('--runtime-package'),
    frozen: !argv.includes('--update-lock'), lockOnly: argv.includes('--lockfile-only') });
}
