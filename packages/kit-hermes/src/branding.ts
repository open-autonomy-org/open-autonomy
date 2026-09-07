// A small project-owned identity bundle, prepared by the setup agent. No generated brand service
// or harness-specific identity: integrations consume the same provisional name, blurb and icon.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Branding { name: string; description: string; icon: string }
export function readBranding(dir: string): Branding {
  const instruction = 'Have the setup agent prepare branding/brand.json (name and description) and a square branding/icon.png. A first pass is enough; reuse existing project branding.';
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'branding/brand.json'), 'utf8'));
    if (!raw || typeof raw.name !== 'string' || raw.name.trim().length < 2 || raw.name.length > 32 || /[\x00-\x1f]/.test(raw.name)) throw new Error('Project display name must be 2–32 characters.');
    if (typeof raw.description !== 'string' || !raw.description.trim() || raw.description.length > 200 || /[\x00-\x1f]/.test(raw.description)) throw new Error('Project blurb must be one line of 1–200 characters.');
    const icon = join(dir, 'branding/icon.png');
    const png = readFileSync(icon);
    if (png.length < 24 || png.length > 1_000_000 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.toString('ascii', 12, 16) !== 'IHDR' || png.readUInt32BE(16) < 512 || png.readUInt32BE(16) !== png.readUInt32BE(20)) throw new Error('Use a square PNG at least 512 pixels across and under 1 MB.');
    return { name: raw.name.trim(), description: raw.description.trim(), icon };
  } catch (e) { throw new Error(`${(e as Error).message}\n${instruction}`); }
}

export function projectAppManifest(brand: Branding, account: string, port: number) {
  return { name: brand.name, description: brand.description, url: `https://open-autonomy.org/p/${encodeURIComponent(account)}`,
    redirect_url: `http://127.0.0.1:${port}/created`, setup_url: `http://127.0.0.1:${port}/installed`, setup_on_update: false, public: false,
    default_permissions: { issues: 'write', discussions: 'write', metadata: 'read', pull_requests: 'read', contents: 'read', checks: 'read', statuses: 'read', actions: 'read' }, default_events: [] };
  // No webhook is used: omit the optional hook_attributes object, which requires a URL when present.
  // GitHub's manifest has no icon field. The setup agent uploads the same PNG in the app's settings.
}
