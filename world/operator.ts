// One manual action against OA's scenario. Native Hermes and vendor APIs own their state.
import { resolve } from 'node:path';
import { api, hermesBin, homeChannel, need, STACK } from './lib.ts';
if (!process.env.VOLTER_WORLD) throw new Error('Use volter-world attach for scenario actions');
const [command, ...args] = process.argv.slice(2);
if (command === 'hermes') {
  process.exit(Bun.spawnSync({ cmd: [resolve(hermesBin(), 'hermes'), ...args], cwd: resolve(STACK, 'project'),
    env: { ...process.env, HERMES_HOME: resolve(STACK, 'home'), GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot' },
    stdio: ['inherit', 'inherit', 'inherit'] }).exitCode);
} else if (command === 'say' || command === 'channel') {
  const discord = api(need('DISCORD_TWIN_URL'), { authorization: 'Bot maintainer' });
  const path = `/api/v10/channels/${homeChannel()}/messages`;
  if (command === 'say' && !args.length) throw new Error('say requires a message');
  const response = command === 'say' ? await discord.post(path, { content: args.join(' ') }) : await discord.get(path);
  if (response.status !== 200) throw new Error(`Discord: ${response.status} ${response.text}`);
  console.log(JSON.stringify(response.body, null, 2));
} else throw new Error('usage: operator.ts hermes <args...> | say <message...> | channel');
