// Where people act (ADR 0008). A project declares, in the JSON-valued `seams:` section of config.yaml, each place a
// person's act takes effect: the roster scope that may act there, the door the act goes through, and where the act
// is recorded; and the vendor accounts whose administrators are people in scope. Only three doors exist: a commit by a
// roster member to a declared file, a code host's gate with a named reviewer, and a platform door that needs a key no
// agent holds. Chat is never a door.
import { TEAM_SCOPES, configSection, type TeamScope } from './team.ts';

export const SEAM_DOORS = ['commit', 'code-host-gate', 'platform-key'] as const;
export type SeamDoor = typeof SEAM_DOORS[number];
export interface Seam { id: string; scope: TeamScope; door: SeamDoor; record: string }
export interface VendorAccount { id: string; vendor: string; account: string }
export interface Seams { seams: Seam[]; vendor_accounts: VendorAccount[] }

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const label = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v);
const ident = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
const only = (o: Record<string, unknown>, keys: string[], what: string) => {
  const extra = Object.keys(o).filter((k) => !keys.includes(k));
  if (extra.length) throw new Error(`${what} has unknown field ${extra.join(', ')}; it takes ${keys.join(', ')}.`);
};

export function validateSeams(value: unknown): Seams {
  if (!record(value)) throw new Error('The seams section must be an object with seams and vendor_accounts.');
  only(value, ['seams', 'vendor_accounts'], 'The seams section');
  if (!Array.isArray(value.seams) || !value.seams.length) throw new Error('Declare at least one seam.');
  const ids = new Set<string>();
  const seams = value.seams.map((s, i): Seam => {
    if (!record(s)) throw new Error(`Seam ${i + 1} must be an object.`);
    only(s, ['id', 'scope', 'door', 'record'], `Seam ${String(s.id ?? i + 1)}`);
    if (!ident(s.id)) throw new Error(`Seam ${i + 1} needs an id of lowercase letters, digits and dashes.`);
    if (ids.has(s.id)) throw new Error(`Seam ${s.id} is declared twice.`);
    ids.add(s.id);
    if (!(TEAM_SCOPES as readonly unknown[]).includes(s.scope)) throw new Error(`Seam ${s.id} names scope ${JSON.stringify(s.scope)}; a seam is held by a roster scope: ${TEAM_SCOPES.join(', ')}.`);
    if (!(SEAM_DOORS as readonly unknown[]).includes(s.door)) throw new Error(`Seam ${s.id} acts through ${JSON.stringify(s.door)}; the only doors are ${SEAM_DOORS.join(', ')} (ADR 0008). Chat carries requests, never the record of an act.`);
    if (!label(s.record, 300)) throw new Error(`Seam ${s.id} must say where its acts are recorded.`);
    return { id: s.id, scope: s.scope as TeamScope, door: s.door as SeamDoor, record: s.record };
  });
  const accounts = (value.vendor_accounts ?? []) as unknown[];
  if (!Array.isArray(accounts)) throw new Error('vendor_accounts must be a list.');
  const aids = new Set<string>();
  const vendor_accounts = accounts.map((a, i): VendorAccount => {
    if (!record(a)) throw new Error(`Vendor account ${i + 1} must be an object.`);
    only(a, ['id', 'vendor', 'account'], `Vendor account ${String(a.id ?? i + 1)}`);
    if (!ident(a.id) || aids.has(a.id)) throw new Error(`Vendor account ${i + 1} needs a unique id of lowercase letters, digits and dashes.`);
    aids.add(a.id);
    if (!label(a.vendor, 80) || !label(a.account, 200)) throw new Error(`Vendor account ${a.id} needs a vendor and an account.`);
    return { id: a.id, vendor: a.vendor, account: a.account };
  });
  return { seams, vendor_accounts };
}

// The project's declaration, or null when it declares none.
export function parseSeamsConfig(config: string): Seams | null {
  const block = configSection(config, 'seams');
  if (!block) return null;
  try { return validateSeams(JSON.parse(block.value)); }
  catch (e) { throw new Error(`Invalid seams section: ${(e as Error).message}`); }
}
