// The CardRegistry Durable Object — single instance (the LimitLedger pattern): every card
// binding, the float ledger, and (PR-3+) the auth log live here. The DO write happens
// BEFORE the mint response returns, and every external call is idempotency-keyed on the
// reserve id, so a crashed mint re-runs to the same end state instead of double-minting.

export interface Binding {
  account: string;
  amount_cents: number;
  approval_ref: string;
  auth_log: Array<{ authorization_id: string; decision: 'approved' | 'declined'; reason: string; ts: string }>;
  card_id: string;
  cardholder_id: string;
  expires_at_ms: number;
  job_ref: string;
  merchant_lock: { mcc?: string; name_pattern?: string; network_id?: string };
  reserve_id: string;
  settled_cents?: number;
  settled_txn_id?: string;
  receipt_ref?: string;
  status: 'armed' | 'authorized' | 'settled' | 'expired' | 'canceled' | 'incident';
}

interface RegistryState {
  bindings: Record<string, Binding>; // by card_id
  by_job_ref: Record<string, string>; // job_ref -> card_id (the mint idempotency spine)
  float: { armed_total_cents: number };
}

const EMPTY: RegistryState = { bindings: {}, by_job_ref: {}, float: { armed_total_cents: 0 } };

export class CardRegistry {
  private loaded = false;
  private registry: RegistryState = structuredClone(EMPTY);

  constructor(private readonly state: DurableObjectState) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.registry = await this.state.storage.get<RegistryState>('registry') ?? structuredClone(EMPTY);
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('registry', this.registry);
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await request.json() as Record<string, unknown> : {};
    // Internal RPC surface (worker → DO only; the worker authenticates callers).
    if (url.pathname === '/lookup-job-ref') {
      const cardId = this.registry.by_job_ref[body.job_ref as string];
      const binding = cardId === undefined ? undefined : this.registry.bindings[cardId];
      return Response.json({ binding: binding ?? null });
    }
    if (url.pathname === '/float') {
      return Response.json({ armed_total_cents: this.registry.float.armed_total_cents });
    }
    if (url.pathname === '/arm') {
      const binding = body.binding as unknown as Binding;
      // Re-arming the same job_ref is a replay: return the existing binding untouched.
      const existingCardId = this.registry.by_job_ref[binding.job_ref];
      if (existingCardId !== undefined) return Response.json({ binding: this.registry.bindings[existingCardId], replay: true });
      this.registry.bindings[binding.card_id] = binding;
      this.registry.by_job_ref[binding.job_ref] = binding.card_id;
      this.registry.float.armed_total_cents += binding.amount_cents;
      await this.persist();
      return Response.json({ binding, replay: false });
    }
    if (url.pathname === '/lookup-card') {
      const binding = this.registry.bindings[body.card_id as string];
      return Response.json({ binding: binding ?? null });
    }
    if (url.pathname === '/latch-auth') {
      // The atomic single-use latch: only an 'armed' binding transitions; a concurrent
      // second auth loses here regardless of what its snapshot showed.
      const binding = this.registry.bindings[body.card_id as string];
      if (binding === undefined) return Response.json({ latched: false, reason: 'unknown-card' });
      const entry = { authorization_id: body.authorization_id as string, decision: body.decision as 'approved' | 'declined', reason: body.reason as string, ts: body.ts as string };
      binding.auth_log.push(entry);
      if (body.decision !== 'approved') { await this.persist(); return Response.json({ latched: false, reason: entry.reason }); }
      if (binding.status !== 'armed') { entry.decision = 'declined'; entry.reason = `latch-race:${binding.status}`; await this.persist(); return Response.json({ latched: false, reason: entry.reason }); }
      binding.status = 'authorized';
      await this.persist();
      return Response.json({ latched: true });
    }
    if (url.pathname === '/list') {
      return Response.json({ bindings: Object.values(this.registry.bindings) });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
