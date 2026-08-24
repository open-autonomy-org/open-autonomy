// Procurement approval artifacts. The bridge trusts the SIGNATURE, not RH2's word: an
// Ed25519-signed JSON artifact produced by RH2's procurement approval flow (human tap for
// anything above the trivial threshold — approval classes never graduate). Wire form:
// `base64url(JSON artifact).base64url(signature over those exact payload bytes)`.

export interface ApprovalArtifact {
  account: string;        // treasury account, e.g. "acme/app"
  amount_cents: number;   // exact-amount lock
  approved_at: string;    // ISO
  approver: string;       // principal, audit only
  job_ref: string;        // the procurement job id — the idempotency spine
  merchant_lock: { mcc?: string; name_pattern?: string; network_id?: string };
  ttl_seconds: number;    // reserve TTL the approval authorizes
}

function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export async function verifyApprovalArtifact(pubkeyB64url: string, wire: string): Promise<ApprovalArtifact | undefined> {
  const separator = wire.indexOf('.');
  if (separator <= 0 || separator === wire.length - 1) return undefined;
  const payload = wire.slice(0, separator);
  const signature = wire.slice(separator + 1);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('raw', b64urlToBytes(pubkeyB64url), { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return undefined;
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify('Ed25519', key, b64urlToBytes(signature), b64urlToBytes(payload));
  } catch {
    return undefined;
  }
  if (!valid) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const artifact = parsed as Record<string, unknown>;
  if (typeof artifact.account !== 'string' || artifact.account.length === 0
    || !Number.isSafeInteger(artifact.amount_cents) || (artifact.amount_cents as number) <= 0
    || typeof artifact.job_ref !== 'string' || artifact.job_ref.length === 0 || (artifact.job_ref as string).length > 128
    || typeof artifact.approver !== 'string' || typeof artifact.approved_at !== 'string'
    || !Number.isSafeInteger(artifact.ttl_seconds) || (artifact.ttl_seconds as number) <= 0
    || artifact.merchant_lock === null || typeof artifact.merchant_lock !== 'object') return undefined;
  return artifact as unknown as ApprovalArtifact;
}
