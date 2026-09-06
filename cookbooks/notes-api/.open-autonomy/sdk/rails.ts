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

// The most the project's funds may spend on the model rail in a day (UTC), from the same file:
//   spend:
//     daily_usd_cents: 500
// 0 or absent: no bound of the project's own beyond the platform's global rail.
export function parseSpendBound(yaml: string): { daily_usd_cents: number } {
  let block = '';
  let daily = 0;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) { block = top[2] === '' ? top[1] : ''; continue; }
    if (block !== 'spend') continue;
    const kv = /^\s+daily_usd_cents:\s*(\d+)\s*$/.exec(line);
    if (kv) daily = Math.max(0, Math.floor(Number(kv[1])));
  }
  return { daily_usd_cents: daily };
}
