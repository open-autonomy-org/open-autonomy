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
