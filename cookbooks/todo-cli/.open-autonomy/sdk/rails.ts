// The rails a project's agent may spend through, as its owner bounds them in `.open-autonomy/config.yaml`:
//
//   rails:
//     card:                     # a single-use virtual card minted against the balance (Stripe Issuing)
//       max_usd_cents: 2500     # the most one card may be minted for (0, the default: the rail is off)
//       categories: [computer_software_stores, ...]   # Stripe merchant categories a card may pay at
//     partner:                  # a partner service settling a metered charge against the balance
//       max_usd_cents: 500      # the most one charge may be (0, the default: the rail is off)
//       partners: [...]         # the partner ids allowed to settle
//
// The model rail needs no bounds beyond the balance and the key's models. Every rail leaves a record on the
// audit trail naming itself.
export interface RailsConfig {
  card: { max_usd_cents: number; categories: string[] };
  partner: { max_usd_cents: number; partners: string[] };
}
export const RAILS_OFF: RailsConfig = { card: { max_usd_cents: 0, categories: [] }, partner: { max_usd_cents: 0, partners: [] } };

export function parseRailsConfig(yaml: string): RailsConfig {
  const cfg: RailsConfig = { card: { max_usd_cents: 0, categories: [] }, partner: { max_usd_cents: 0, partners: [] } };
  let block = '';
  let rail: 'card' | 'partner' | '' = '';
  let list: 'categories' | 'partners' | '' = '';
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) { block = top[2] === '' ? top[1] : ''; rail = ''; list = ''; continue; }
    if (block !== 'rails') continue;
    const l2 = /^  ([a-z_]+):\s*$/.exec(line);
    if (l2) { rail = l2[1] === 'card' || l2[1] === 'partner' ? l2[1] : ''; list = ''; continue; }
    if (!rail) continue;
    const l3 = /^    ([a-z_]+):\s*(.*)$/.exec(line);
    if (l3) {
      const [, key, value] = l3;
      list = '';
      if (key === 'max_usd_cents') cfg[rail].max_usd_cents = Math.max(0, Math.floor(Number(value) || 0));
      else if ((key === 'categories' && rail === 'card') || (key === 'partners' && rail === 'partner')) {
        const inline = /^\[(.*)\]$/.exec(value.trim());
        if (inline) (cfg[rail] as Record<string, unknown>)[key] = inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        else list = key;
      }
      continue;
    }
    const item = /^      -\s+(.+)$/.exec(line);
    if (item && list) ((cfg[rail] as Record<string, unknown>)[list] as string[]).push(item[1].trim().replace(/^["']|["']$/g, ''));
  }
  return cfg;
}

// The models the project's funds may buy on the model rail, from the same `.open-autonomy/config.yaml`:
//   models: [zai/glm-5.3-flash]      or a block list. Empty or absent: no bound beyond the key's own list.
// The bound is the owner's, read by the platform from the repository, and holds whatever a key was minted with.
export function parseModelsBound(yaml: string): string[] {
  const out: string[] = [];
  let inList = false;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) {
      inList = false;
      if (top[1] !== 'models') continue;
      const inline = /^\[(.*)\]$/.exec(top[2].trim());
      if (inline) out.push(...inline[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
      else if (top[2] === '') inList = true;
      continue;
    }
    const item = inList ? /^\s+-\s+(.+)$/.exec(line) : null;
    if (item) out.push(item[1].trim().replace(/^["']|["']$/g, ''));
  }
  return out;
}

// The limits the project's funds run under on the model rail, from the same file — the shape a provider's rate
// limits and a budget's period share: each limit is one measure over one window, rolling.
//   spend:
//     limits:
//       - { window: 1d, usd_cents: 500 }                    # the money: cents over the window
//       - { window: 30d, usd_cents: 6000 }
//       - { window: 1m, calls: 60 }                         # the pace: requests over the window
//       - { window: 1h, tokens: 2000000 }                   # the volume: tokens in and out over the window
//       - { window: 1d, usd_cents: 100, model: openai/gpt-5 } # one model's own budget
// Windows: N m (minutes, up to 60), N h (hours, up to 24), N d (days, up to 31). Every limit holds at once; the platform
// refuses the call that would cross one and says which. None: no bound of the project's own beyond the platform's rail.
export interface SpendLimit { window: string; window_seconds: number; usd_cents?: number; calls?: number; tokens?: number; model?: string }
export function parseWindow(spec: string): number | undefined {
  const m = /^(\d+)\s*(m|h|d)$/.exec(spec.trim());
  if (!m) return undefined;
  const n = Number(m[1]); const unit = { m: 60, h: 3600, d: 86400 }[m[2] as 'm' | 'h' | 'd'];
  const max = { m: 60, h: 24, d: 31 }[m[2] as 'm' | 'h' | 'd'];
  return n >= 1 && n <= max ? n * unit : undefined;
}
export function parseSpendLimits(yaml: string): SpendLimit[] {
  const out: SpendLimit[] = [];
  let block = ''; let inLimits = false; let item: Record<string, string> | null = null;
  const flush = () => {
    if (!item) return;
    const seconds = item.window ? parseWindow(item.window) : undefined;
    const num = (k: string) => (item![k] !== undefined && /^\d+$/.test(item![k]) ? Number(item![k]) : undefined);
    const limit: SpendLimit = { window: (item.window ?? '').trim(), window_seconds: seconds ?? 0 };
    if (num('usd_cents') !== undefined) limit.usd_cents = num('usd_cents');
    if (num('calls') !== undefined) limit.calls = num('calls');
    if (num('tokens') !== undefined) limit.tokens = num('tokens');
    if (item.model) limit.model = item.model.trim().replace(/^["']|["']$/g, '');
    if (seconds && (limit.usd_cents !== undefined || limit.calls !== undefined || limit.tokens !== undefined)) out.push(limit);
    item = null;
  };
  const pairs = (text: string): Record<string, string> => Object.fromEntries(text.split(',').map((kv) => kv.split(':')).filter((kv) => kv.length >= 2).map(([k, ...v]) => [k.trim(), v.join(':').trim().replace(/^["']|["']$/g, '')]));
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) { flush(); block = top[2] === '' ? top[1] : ''; inLimits = false; continue; }
    if (block !== 'spend') continue;
    if (/^  limits:\s*$/.test(line)) { flush(); inLimits = true; continue; }
    if (!inLimits) continue;
    const flow = /^\s+-\s*\{(.*)\}\s*$/.exec(line);
    if (flow) { flush(); item = pairs(flow[1]); flush(); continue; }
    const start = /^\s+-\s+([a-z_]+):\s*(.+)$/.exec(line);
    if (start) { flush(); item = { [start[1]]: start[2].trim() }; continue; }
    const more = item ? /^\s+([a-z_]+):\s*(.+)$/.exec(line) : null;
    if (more) item![more[1]] = more[2].trim();
  }
  flush();
  return out;
}
