// Scripted PM judgment reads the setup-written command from the actual skill.
// This is a rehearsal helper, not a runtime policy parser.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function outreachCommand(home: string): string[] {
  const skill = readFileSync(resolve(home, 'skills/open-autonomy/pm/SKILL.md'), 'utf8');
  const command = /^python "\$HERMES_HOME\/hooks\/escalate\/handler.py" remind (--via (?:github|discord) --recipient [a-zA-Z0-9-]+ --reminder-hours [\d.]+)$/m.exec(skill);
  if (!command) throw new Error('scripted PM: setup has not written a delivery command in the PM skill');
  return ['python', resolve(home, 'hooks/escalate/handler.py'), 'remind', ...command[1].split(' ')];
}
