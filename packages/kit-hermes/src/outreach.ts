// Setup owns this part of the PM skill. The rest continues to receive kit upgrades.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PM_SKILL = 'hermes/skills/open-autonomy/pm/SKILL.md';
const BEGIN = '<!-- open-autonomy:outreach-policy:begin -->';
const END = '<!-- open-autonomy:outreach-policy:end -->';
export const OUTREACH_PENDING = 'Setup has not established this project’s outreach policy.';

export function outreachSection(text: string): string | undefined {
  if (!text.includes(BEGIN) && !text.includes(END)) return;
  if (text.split(BEGIN).length !== 2 || text.split(END).length !== 2 || text.indexOf(END) < text.indexOf(BEGIN)) {
    throw new Error('PM outreach policy markers are malformed; repair them before setup or upgrade');
  }
  return text.slice(text.indexOf(BEGIN), text.indexOf(END) + END.length);
}

export function withOutreach(text: string, section: string): string {
  const current = outreachSection(text);
  return current ? text.replace(current, () => section) : `${text.trimEnd()}\n\n${section}\n`;
}

export interface Outreach { channel: string; recipient: string; reminderHours: number }

export function writeOutreach(dir: string, policy: Outreach): void {
  const { channel, recipient, reminderHours } = policy;
  if (channel !== 'github' && channel !== 'discord') throw new Error('outreach channel must be github or discord');
  if (!(channel === 'github' ? /^[a-z\d](?:[a-z\d-]{0,38})$/i : /^\d{17,20}$/).test(recipient)) {
    throw new Error(channel === 'github' ? 'outreach recipient must be a GitHub username' : 'outreach recipient must be a Discord user ID');
  }
  if (!Number.isFinite(reminderHours) || reminderHours < 1) throw new Error('outreach reminder hours must be at least 1');
  const destination = channel === 'github' ? `a GitHub issue in this repository assigned to @${recipient}` : `a Discord direct message to user ${recipient}`;
  const section = `${BEGIN}
## Project outreach policy

Setup established ${destination} as the owner's channel for release review and other owner input.
Send concrete release proposals there; the owner provides the required human review and may approve,
reject or redirect. Follow up in the same conversation after ${reminderHours} hours without a response.
Silence grants no approval. Implementation volunteers keep their explicitly agreed contact arrangements.

After preparing owner requests on the native board, deliver them and reconcile reminders with:

\`\`\`sh
python "$HERMES_HOME/hooks/escalate/handler.py" remind --via ${channel} --recipient ${recipient} --reminder-hours ${reminderHours}
\`\`\`

No alternate channel is authorized. If delivery fails, keep the request blocked and report the delivery
gap in your scrum result. Do not choose another channel because its credentials are available. Changes
to this policy require owner direction; setup writes the policy and kit upgrades preserve it.
${END}`;
  const path = join(dir, PM_SKILL);
  writeFileSync(path, withOutreach(readFileSync(path, 'utf8'), section));
}
