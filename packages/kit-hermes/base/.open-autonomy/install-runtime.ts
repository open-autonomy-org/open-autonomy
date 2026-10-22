#!/usr/bin/env bun
// Install the same version contract from npm, a review registry or exact npm-pack artifacts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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

// Match supercode's front door, using the environment of the user who will run it (including --as).
function sourceLock(environment: Record<string, string | undefined>): string | undefined {
  const home = environment.SUPERCODE_HOME || join(environment.XDG_CONFIG_HOME || join(environment.HOME || environment.USERPROFILE || homedir(), '.config'), 'supercode');
  const file = join(home, 'source-lock.json');
  return existsSync(file) ? file : undefined;
}

// Select the explicitly staged complete binding while preparing candidate inputs. Ordinary installs read the
// primary. Native activation re-verifies the complete graph before any serving selection changes.
function selectedSource(file: string, environment: Record<string, string | undefined>): any {
  const primary = readFileSync(file, 'utf8'), current = JSON.parse(primary), named = environment.SUPERCODE_SOURCE_CANDIDATE;
  if (!named) return current;
  const path = realpathSync(named), base = realpathSync(join(dirname(file), 'source', 'handovers'));
  if (path !== resolve(named) || dirname(dirname(path)) !== base || !path.endsWith('/candidate.json')) throw new Error('candidate source receipt is outside this machine handovers');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const same = (binding: any) => ['root','commit','supercode','graph'].every(key => JSON.stringify(binding?.[key] ?? null) === JSON.stringify(receipt.lock?.[key] ?? null));
  if (receipt.version !== 1 || receipt.kind !== 'serving-source-candidate' || (!same(current)
    && !(current.serving_handover?.previous_receipt === path && same(current.serving_handover.previous))
    && receipt.base_digest !== createHash('sha256').update(primary).digest('hex'))) throw new Error('candidate source no longer matches its primary');
  return receipt.lock;
}

export function machineSourceBinding(environment: Record<string, string | undefined> = process.env): any | null {
  const file = sourceLock(environment);
  return file ? selectedSource(file, environment) : null;
}

export function machineSourceReceipt(environment: Record<string, string | undefined>): string | null {
  const file = sourceLock(environment);
  if (!file) return null;
  if (environment.SUPERCODE_SOURCE_CANDIDATE) { selectedSource(file, environment); return realpathSync(environment.SUPERCODE_SOURCE_CANDIDATE); }
  const text = readFileSync(file, 'utf8'), lock = JSON.parse(text), digest = createHash('sha256').update(text).digest('hex');
  const directory = join(dirname(file), 'source/handovers', `snapshot-${digest}`), path = join(directory, 'candidate.json');
  if (!existsSync(path)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, kind: 'serving-source-candidate', base_digest: digest, lock }) + '\n', { mode: 0o600 });
    renameSync(temporary, path);
  }
  return realpathSync(path);
}

// Published installs use the same complete retained closure as the native machine owner. A replaced global npm
// directory is preparation input, never evidence that the serving release changed.
export function machinePublishedBinding(environment: Record<string, string | undefined> = process.env): any | null {
  if (sourceLock(environment)) {
    if (environment.SUPERCODE_RELEASE_RECEIPT) throw new Error('a source-pinned machine cannot select a separate published release');
    return null;
  }
  const home = environment.SUPERCODE_HOME || join(environment.XDG_CONFIG_HOME || join(environment.HOME || homedir(), '.config'), 'supercode');
  const service = join(environment.SUPERCODE_TEAMS_HOME || join(home, 'teams'), 'service');
  const primary = join(service, 'active-release.json');
  let named = environment.SUPERCODE_RELEASE_RECEIPT;
  if (!named && existsSync(primary)) {
    const active = JSON.parse(readFileSync(primary, 'utf8'));
    if (!active.release?.supports_generations) return null;
    named = active.release.receipt ?? join(dirname(active.release.root), 'retained-release.json');
  }
  if (!named) return null;
  const path = realpathSync(named), receipt = JSON.parse(readFileSync(path, 'utf8'));
  if (path !== resolve(named) || dirname(dirname(path)) !== realpathSync(join(service, 'releases'))
    || path !== join(dirname(path), 'retained-release.json') || receipt.version !== 3 || !receipt.supports_generations
    || receipt.root !== join(dirname(path), 'package')) throw new Error('published release receipt is outside this machine retained releases');
  const manifest = JSON.parse(readFileSync(join(receipt.root, 'package.json'), 'utf8'));
  if (manifest.name !== '@volter/supercode' || manifest.version !== receipt.release) throw new Error('retained machine release manifest changed');
  for (const name of ['@volter/supercode-orchestrator', '@volter/supercode-harness-sdk', '@volter/supercode-teams']) {
    if (!manifest.dependencies?.[name] || JSON.parse(readFileSync(join(receipt.root, 'node_modules', name, 'package.json'), 'utf8')).version !== manifest.dependencies[name])
      throw new Error(`retained machine release has no exact ${name}`);
  }
  if (!realpathSync(receipt.native).startsWith(receipt.root + sep)) throw new Error('retained machine native escapes its release');
  return { ...receipt, receipt: path };
}

// Bun owns dependency resolution. Only the file: packages declared inside the locked source tree need a different
// on-disk representation: links to that tree, never installed copies. Leave registry packages on Bun's normal backend
// so their scripts and Node imports retain ordinary node_modules resolution.
function sourceLinks(options: Options): Array<{ name: string; target: string }> {
  const file = sourceLock(options.environment);
  if (!file) {
    const published = machinePublishedBinding(options.environment);
    if (!published) return [];
    const manifest = JSON.parse(readFileSync(join(options.directory, 'package.json'), 'utf8'));
    const declarations = { ...manifest.devDependencies, ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.overrides };
    return ['@volter/supercode-orchestrator', '@volter/supercode-harness-sdk', '@volter/supercode-teams'].filter(name => declarations[name]).map(name => ({ name, target: realpathSync(join(published.root, 'node_modules', name)) }));
  }
  const lock = selectedSource(file, options.environment);
  if (typeof lock.root !== 'string' || !isAbsolute(lock.root)) throw new Error(`Supercode source lock ${file} needs an absolute root`);
  const root = realpathSync(lock.root);
  const manifest = JSON.parse(readFileSync(join(options.directory, 'package.json'), 'utf8'));
  const declarations = { ...manifest.devDependencies, ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.overrides };
  return Object.entries(declarations).flatMap(([name, value]) => {
    if (typeof value !== 'string' || !value.startsWith('file:')) return [];
    const matches = Object.values(lock.graph?.instances ?? {}).filter((instance: any) => instance.package === name) as any[];
    if (matches.length > 1) throw new Error(`Source dependency ${name} needs one exact package instance`);
    const target = realpathSync(matches.length ? resolve(matches[0].root, matches[0].dir) : resolve(options.directory, value.slice(5)));
    const path = relative(root, target);
    if (!matches.length && (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))) return [];
    if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name) || name === '.' || name === '..' ||
        JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name !== name) {
      throw new Error(`Source-linked dependency ${name} must name its package at ${target}`);
    }
    return [{ name, target }];
  });
}

export function runtimeInstallIdentity(options: Pick<Options, 'directory' | 'registry' | 'archive'> & Partial<Pick<Options, 'environment'>>): string {
  const hash = createHash('sha256').update(readFileSync(join(options.directory, 'package.json')));
  for (const name of ['bun.lock', 'bun.lockb']) {
    const path = join(options.directory, name);
    if (existsSync(path)) hash.update(name).update(readFileSync(path));
  }
  hash.update(options.registry ?? 'https://registry.npmjs.org');
  const lock = sourceLock(options.environment ?? process.env);
  // A pin move, or adopting the linked-install policy, invalidates stamps made for copies too.
  if (lock) { const selected = selectedSource(lock, options.environment ?? process.env);
    hash.update('source-lock:file-links-v2').update(JSON.stringify(Object.fromEntries(['root','commit','supercode','graph'].map(key => [key, selected[key] ?? null]))));
  }
  const published = machinePublishedBinding(options.environment ?? process.env);
  if (published) hash.update('retained-release-v3').update(readFileSync(published.receipt));
  for (const path of archivePaths(options.archive)) hash.update(readFileSync(path));
  return hash.digest('hex');
}

export async function installHostRuntime(options: Options): Promise<void> {
  const links = sourceLinks(options);
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
        if (pathname === tarPath) return new Response(request.method === 'HEAD' ? null : new Uint8Array(artifact.bytes),
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
    if (!options.lockOnly) for (const { name, target } of links) {
      const installed = join(options.directory, 'node_modules', name);
      rmSync(installed, { recursive: true, force: true });
      mkdirSync(dirname(installed), { recursive: true });
      symlinkSync(target, installed, process.platform === 'win32' ? 'junction' : 'dir');
      console.log(`runtime source link: ${name} -> ${target}`);
    }
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
