#!/usr/bin/env bun
// oa: Open Autonomy on the command line. Every command is one of the platform's doors, as the SDK speaks them:
// a project's word, money and sessions to read; the owner's pause and resume to say; keys to mint. Nothing here
// runs or upgrades an agent (that is create-open-autonomy's), and nothing here is a door the platform lacks.
import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import { account, doors } from './config.ts';
import { books } from './commands/books.ts';
import { mint, rotate } from './commands/key.ts';
import { roadmap } from './commands/roadmap.ts';
import { session, sessions } from './commands/sessions.ts';
import { setState } from './commands/state.ts';
import { status } from './commands/status.ts';
import { Fail, dim } from './ui.ts';

const VERSION = (JSON.parse(await Bun.file(new URL('../package.json', import.meta.url)).text()) as { version: string }).version;
const int = (v: string): number => { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError('a whole number'); return n; };

const program = new Command('oa')
  .description('Open Autonomy on the command line: a project\'s word, money and sessions; the owner\'s pause and resume; keys.')
  .version(VERSION, '-v, --version')
  .option('--platform <url>', 'the deployment (or OPEN_AUTONOMY_URL)', undefined)
  .option('--key <file|token>', 'a key file or token (or OPEN_AUTONOMY_KEY); the project\'s own files when absent')
  .option('--json', 'the platform\'s records, unrendered')
  .showHelpAfterError(dim('(oa --help for the commands)'))
  .configureHelp({ sortSubcommands: false })
  .addHelpText('after', `
${pc.bold('Examples')}
  oa status open-autonomy-org/hookline
  oa sessions open-autonomy-org/hookline --limit 10
  oa session open-autonomy-org/hookline cron_79bd…_20260913_050441 --follow
  oa pause open-autonomy-org/hookline --reason "holiday"
  oa key mint open-autonomy-org/hookline --scopes steer

${pc.bold('Keys')}
  A read needs no key for what the owner opened to everyone; a closed panel opens to the project's own key.
  Pause and resume need a key with the steer scope, which an agent's key deliberately lacks.
  ${dim('~/.config/open-autonomy/<owner>/<project>/{steer,agent,treasurer}.env are read in that order.')}`);

type Global = { platform?: string; key?: string; json?: boolean };
const g = (): Global => program.opts<Global>();

program.command('status').description('the word, the money, what is running, the board').argument('<owner/project>')
  .action((acct: string) => status(doors(account(acct), g())));
program.command('sessions').description('the stream, newest first').argument('<owner/project>')
  .option('-n, --limit <n>', 'how many', int, 30)
  .action((acct: string, o: { limit: number }) => sessions(doors(account(acct), g()), o));
program.command('session').description('one session\'s transcript; --follow stays with it while live').argument('<owner/project>').argument('<key>')
  .option('-f, --follow', 'stay with a live session as its turns land', false)
  .option('--tail <n>', 'only the last n turns (0 for all)', int, 60)
  .action((acct: string, key: string, o: { follow: boolean; tail: number }) => session(doors(account(acct), g()), key, o));
program.command('roadmap').description('the board: in progress, planned, proposed, shipped').argument('<owner/project>')
  .option('--shipped <n>', 'how many shipped items (0 for all)', int, 10)
  .action((acct: string, o: { shipped: number }) => roadmap(doors(account(acct), g()), o));
program.command('books').description('the ledger and the owner\'s bounds; --calls for every metered call').argument('<owner/project>')
  .option('--calls', 'every metered call, newest first', false)
  .option('-n, --limit <n>', 'how many calls', int, 50)
  .action((acct: string, o: { calls: boolean; limit: number }) => books(doors(account(acct), g()), o));
program.command('pause').description('the owner\'s word: pause the scheduled work').argument('<owner/project>')
  .option('-r, --reason <text>', 'why, on the page')
  .option('--wait <seconds>', 'how long to wait for the automation\'s answer', int, 30)
  .action((acct: string, o: { reason?: string; wait: number }) => setState(doors(account(acct), g(), ['steer']), 'paused', o));
program.command('resume').description('the owner\'s word: run').argument('<owner/project>')
  .option('-r, --reason <text>', 'why, on the page')
  .option('--wait <seconds>', 'how long to wait for the automation\'s answer', int, 30)
  .action((acct: string, o: { reason?: string; wait: number }) => setState(doors(account(acct), g(), ['steer']), 'running', o));

const key = program.command('key').description('the project\'s keys: mint the adopter way, rotate');
key.command('mint').description('a key, after a claim on the repository\'s default branch').argument('<owner/project>')
  .option('--scopes <list>', 'spend,narrate (the default), spend,narrate,pay (a treasurer), steer (an owner-side driver)')
  .option('--models <list>', 'the models the key may spend on')
  .option('--repo <dir>', 'a checkout of the project to write the claim into (default: the current directory)')
  .option('--out <file>', 'where to write the key (default: ~/.config/open-autonomy/<owner>/<project>/<steer|agent|treasurer>.env)')
  .action((acct: string, o: { scopes?: string; models?: string; out?: string; repo?: string }) => mint(doors(account(acct), g()), o));
key.command('rotate').description('a new key in place of the current one, with a grace period').argument('<owner/project>')
  .option('--grace <seconds>', 'how long the previous key still works')
  .option('--out <file>', 'where to write the key (default: where it was read)')
  .action((acct: string, o: { out?: string; grace?: string }) => rotate(doors(account(acct), g()), o));

try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (e instanceof Fail) { console.error(`${pc.red('✖')} ${e.message}${e.hint ? `\n  ${dim(e.hint)}` : ''}`); process.exit(1); }
  const m = (e as Error).message ?? String(e);
  console.error(`${pc.red('✖')} ${/fetch failed|ECONNREFUSED|ENOTFOUND/.test(m) ? `cannot reach the platform (${g().platform ?? process.env.OPEN_AUTONOMY_URL ?? 'https://open-autonomy.org'})` : m}`);
  process.exit(1);
}
