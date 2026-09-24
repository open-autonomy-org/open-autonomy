#!/usr/bin/env bun
// oa: Open Autonomy on the command line. Every command is one of the platform's doors, as the SDK speaks them:
// a project's word, money and sessions to read; the owner's pause and resume to say; keys to mint. Nothing here
// runs or upgrades an agent (that is create-open-autonomy's), and nothing here is a door the platform lacks.
import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import { account, checkoutProject, doors, saveScope, savedScope, scopeOf } from './config.ts';
import { books } from './commands/books.ts';
import { mint, rotate } from './commands/key.ts';
import { roadmap } from './commands/roadmap.ts';
import { session, sessions } from './commands/sessions.ts';
import { setState } from './commands/state.ts';
import { orgStatus, status } from './commands/status.ts';
import { Fail, dim } from './ui.ts';

const VERSION = (JSON.parse(await Bun.file(new URL('../package.json', import.meta.url)).text()) as { version: string }).version;
const int = (v: string): number => { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError('a whole number'); return n; };

const program = new Command('oa')
  .description('Open Autonomy on the command line: a project\'s word, money and sessions; the owner\'s pause and resume; keys.')
  .version(VERSION, '-v, --version')
  .option('--platform <url>', 'the deployment (or OPEN_AUTONOMY_URL)', undefined)
  .option('--key <file|token>', 'a key file or token (or OPEN_AUTONOMY_KEY); the project\'s own files when absent')
  .option('--project <owner/project>', 'the project to act on (or the checkout, or oa use)')
  .option('--org <org>', 'the org to act on: its projects at a glance, its pause')
  .option('--json', 'the platform\'s records, unrendered')
  .showHelpAfterError(dim('(oa --help for the commands)'))
  .configureHelp({ sortSubcommands: false })
  .addHelpText('after', `
${pc.bold('Scope')}
  Each command acts on a project (owner/project) or an org (owner): the argument, --project or --org, the
  checkout's GitHub remote, then the default oa use saved. An org's pause holds for every project of it.

${pc.bold('Examples')}
  oa status open-autonomy-org/hookline
  oa status volter-ai                      ${dim('every project of the org, and its word')}
  oa pause volter-ai --reason "cap review" ${dim('the org pauses; its projects inherit it')}
  oa use volter-ai/volter
  oa sessions open-autonomy-org/hookline --limit 10
  oa session open-autonomy-org/hookline cron_79bd…_20260913_050441 --follow
  oa pause open-autonomy-org/hookline --reason "holiday"
  oa key mint open-autonomy-org/hookline --scopes steer

${pc.bold('Keys')}
  A read needs no key for what the owner opened to everyone; a closed panel opens to the project's own key.
  Pause and resume need a key with the steer scope, which an agent's key deliberately lacks.
  ${dim('~/.config/open-autonomy/<owner>/<project>/{steer,agent,treasurer}.env are read in that order;')}
  ${dim('an org\'s steer key is ~/.config/open-autonomy/<org>/steer.env, minted through <org>/.github.')}`);

type Global = { platform?: string; key?: string; json?: boolean; project?: string; org?: string };
const g = (): Global => program.opts<Global>();

const scope = (arg?: string): string => scopeOf(arg, g()).scope;
program.command('use').description('the default scope when no argument, flag or checkout names one').argument('[org|org/project]')
  .action((arg?: string) => {
    if (arg) { const { scope: s } = scopeOf(arg, {}); saveScope(s.replace(/^@/, '')); console.log(`${pc.green('✔')} oa acts on ${pc.bold(s.replace(/^@/, ''))} ${dim('when nothing else names a scope')}`); return; }
    const here = checkoutProject(), saved = savedScope();
    console.log(`${pc.bold(scopeOf(undefined, g()).scope.replace(/^@/, ''))}${here ? dim(`   this checkout: ${here}`) : ''}${saved ? dim(`   oa use: ${saved}`) : ''}`);
  });
program.command('status').description('a project: the word, the money, what is running, the board; an org: each project at a glance').argument('[org|owner/project]')
  .action((arg?: string) => { const s = scope(arg); return s.startsWith('@') ? orgStatus(doors(s, g())) : status(doors(s, g())); });
program.command('sessions').description('the stream, newest first').argument('[owner/project]')
  .option('-n, --limit <n>', 'how many', int, 30)
  .action((acct: string | undefined, o: { limit: number }) => sessions(doors(account(acct, g()), g()), o));
program.command('session').description('one session\'s transcript; --follow stays with it while live').argument('<owner/project|key>').argument('[key]')
  .option('-f, --follow', 'stay with a live session as its turns land', false)
  .option('--tail <n>', 'only the last n turns (0 for all)', int, 60)
  // One word is the key, in the scope the flags, the checkout or oa use name; two are the project and the key.
  .action((first: string, second: string | undefined, o: { follow: boolean; tail: number }) => {
    if (second === undefined && first.includes('/')) throw new Fail(`which session of ${first}?`, `oa session ${first} <key>`);
    return session(doors(account(second === undefined ? undefined : first, g()), g()), second ?? first, o);
  });
program.command('roadmap').description('the board: in progress, planned, proposed, shipped').argument('[owner/project]')
  .option('--shipped <n>', 'how many shipped items (0 for all)', int, 10)
  .action((acct: string | undefined, o: { shipped: number }) => roadmap(doors(account(acct, g()), g()), o));
program.command('books').description('the ledger and the owner\'s bounds; --calls for every metered call').argument('[owner/project]')
  .option('--calls', 'every metered call, newest first', false)
  .option('-n, --limit <n>', 'how many calls', int, 50)
  .action((acct: string | undefined, o: { calls: boolean; limit: number }) => books(doors(account(acct, g()), g()), o));
program.command('pause').description('the owner\'s word: pause the scheduled work (an org\'s holds for all its projects)').argument('[org|owner/project]')
  .option('-r, --reason <text>', 'why, on the page')
  .option('--wait <seconds>', 'how long to wait for the automation\'s answer', int, 30)
  .action((arg: string | undefined, o: { reason?: string; wait: number }) => setState(doors(scope(arg), g(), ['steer']), 'paused', o));
program.command('resume').description('the owner\'s word: run').argument('[org|owner/project]')
  .option('-r, --reason <text>', 'why, on the page')
  .option('--wait <seconds>', 'how long to wait for the automation\'s answer', int, 30)
  .action((arg: string | undefined, o: { reason?: string; wait: number }) => setState(doors(scope(arg), g(), ['steer']), 'running', o));

const key = program.command('key').description('the project\'s keys: mint the adopter way, rotate');
key.command('mint').description('a key, after a claim on the repository\'s default branch (an org\'s: <org>/.github, steer only)').argument('[org|owner/project]')
  .option('--scopes <list>', 'spend,narrate (the default), spend,narrate,pay (a treasurer), steer (an owner-side driver)')
  .option('--models <list>', 'the models the key may spend on')
  .option('--repo <dir>', 'a checkout of the project to write the claim into (default: the current directory)')
  .option('--out <file>', 'where to write the key (default: ~/.config/open-autonomy/<owner>/<project>/<steer|agent|treasurer>.env)')
  .action((arg: string | undefined, o: { scopes?: string; models?: string; out?: string; repo?: string }) => mint(doors(scope(arg), g()), o));
key.command('rotate').description('a new key in place of the current one, with a grace period').argument('[org|owner/project]')
  .option('--grace <seconds>', 'how long the previous key still works')
  .option('--out <file>', 'where to write the key (default: where it was read)')
  .action((arg: string | undefined, o: { out?: string; grace?: string }) => { const s = scope(arg); return rotate(doors(s, g(), s.startsWith('@') ? ['steer'] : undefined), o); });

try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (e instanceof Fail) { console.error(`${pc.red('✖')} ${e.message}${e.hint ? `\n  ${dim(e.hint)}` : ''}`); process.exit(1); }
  const m = (e as Error).message ?? String(e);
  console.error(`${pc.red('✖')} ${/fetch failed|ECONNREFUSED|ENOTFOUND/.test(m) ? `cannot reach the platform (${g().platform ?? process.env.OPEN_AUTONOMY_URL ?? 'https://open-autonomy.org'})` : m}`);
  process.exit(1);
}
