// The generic supplier vocabulary + credential helpers for the treasury's supplier API.
//
// A SUPPLIER is any authorized external biller — a compute host, a labor marketplace, a media
// renderer, a landlord's accrual bot — that posts itemized debits (or two-phase reserve/settle
// holds) against treasury accounts. Suppliers are strangers: nothing here assumes who they are
// beyond an admin-created registry entry with a scoped credential and an allowed-category list.
// The model proxy's own inline model debits are attributed to the built-in supplier #0
// (`model-proxy`) through the same debit path, so the category breakdown is complete.

/** The cost categories a debit can be itemized under (the public books' spending mix). */
export const COST_CATEGORIES = ['model', 'machine-seconds', 'labor', 'media', 'rent', 'procurement', 'other'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export function isCostCategory(value: unknown): value is CostCategory {
  return typeof value === 'string' && (COST_CATEGORIES as readonly string[]).includes(value);
}

/** The built-in supplier id the proxy's own inline model debits are attributed to. */
export const MODEL_PROXY_SUPPLIER = 'model-proxy';

/** Supplier ids are lowercase slugs so they read cleanly in flows, caps, and bearer tokens. */
export const SUPPLIER_ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

// A supplier bearer token is `sup.<id>.<secret>`: the id routes the lookup, the secret proves it.
// Only a SHA-256 hash of the secret is stored (a leaked ledger snapshot leaks no credentials).
export interface SupplierTokenParts {
  id: string;
  secret: string;
}

export function formatSupplierToken(id: string, secret: string): string {
  return `sup.${id}.${secret}`;
}

export function parseSupplierToken(token: string | null): SupplierTokenParts | null {
  if (!token) return null;
  const [prefix, id, secret, extra] = token.split('.');
  if (prefix !== 'sup' || !id || !secret || extra !== undefined) return null;
  if (!SUPPLIER_ID_RE.test(id)) return null;
  return { id, secret };
}

export function generateSupplierSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hashSupplierSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
