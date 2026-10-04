// The install is up when its start has rendered the home from home/: the organization's layer at the root, the board.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const home = process.env.VO_AGENT_HOME;
if (!home) process.exit(1);
const persona = resolve(home, 'AGENTS.md');
const ok = existsSync(persona) && readFileSync(persona, 'utf8').includes("the organization's layer") && existsSync(resolve(home, 'workflow.yaml')) && existsSync(resolve(home, 'profiles', 'account-manager-owner', 'AGENTS.md'));
process.exit(ok ? 0 : 1);
