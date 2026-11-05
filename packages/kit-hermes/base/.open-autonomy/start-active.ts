#!/usr/bin/env bun
// The install's stable service entry: the one path a launchd or systemd unit names to run a retained kit owner
// (ADR 0031). Each prepared install is a generation under <home>/../installs/, and an activation moves the kit owner's
// record (<home>/kit-install.json) onto the next one. A unit that names one generation's own start keeps starting that
// generation after the pin rolls: its receipt then no longer matches the machine's source pin and its start refuses,
// and once later activations retire it, the path is gone. This entry names no generation. At every start it reads the
// record and runs the selected generation's start with that generation's receipt, so a roll needs no new unit.
//
//   bun .open-autonomy/start-active.ts --home <home> [the start's other options: --secrets, --valve, ...]
//
// The selected generation is the record's active install; with none active, the predecessor of the transaction the
// record holds (the owner itself then decides that transaction from its record); with neither, the generation the last
// stack ran (running-kit.json), which is what an owner that exited after its stack ended had been serving. The kit
// owner validates the receipt in full before it starts anything. This file imports only the runtime's builtins, so it
// runs from the project checkout whatever that checkout's node_modules hold.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { constants } from 'node:os';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const option = (name: string): string | undefined => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
const fail = (message: string): never => { console.error(`start-active: ${message}. Nothing was started.`); process.exit(1); };
const json = (file: string): any => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };

const named = option('--home') ?? process.env.AGENT_HOME;
if (!named) fail('name the install\'s home (--home or AGENT_HOME)');
if (argv.includes('--prepared-install') || argv.includes('--stack-child')) fail('the generation is read from the kit owner\'s record; --prepared-install and --stack-child are not this entry\'s options');
if (!existsSync(named!)) fail(`${named} does not exist`);
const home = realpathSync(named!);
const record = json(resolve(home, 'kit-install.json'));
if (!record) fail(`${home}/kit-install.json is missing: this home has no kit owner yet, and its first start names its prepared install (start.ts --prepared-install)`);
const running = json(resolve(home, 'running-kit.json'));
const selected: unknown = record.active?.receipt ?? record.transaction?.predecessor?.receipt ?? running?.receipt;
if (typeof selected !== 'string' || !selected) fail(`${home}/kit-install.json selects no install (no active install, no transaction predecessor, no last running receipt)`);
if (!existsSync(selected as string)) fail(`the selected install receipt ${selected} is missing`);
const path = realpathSync(selected as string), receipt = json(path);
for (const key of ['entry', 'sourceProject', 'home', 'receipt'] as const)
  if (typeof receipt?.[key] !== 'string' || !receipt[key]) fail(`the selected install receipt ${path} has no ${key}`);
if (receipt.receipt !== path || resolve(receipt.home) !== home) fail(`the selected install receipt ${path} was not prepared for ${home}`);
if (!existsSync(receipt.entry)) fail(`the selected install's start ${receipt.entry} is missing`);

// The selected generation's start receives the unit's own options; project, home and receipt come from the receipt.
const rest: string[] = [];
for (let at = 0; at < argv.length; at++) { if (['--home', '--project'].includes(argv[at])) at++; else rest.push(argv[at]); }
const command = [process.execPath, receipt.entry, '--project', receipt.sourceProject, '--home', home, '--prepared-install', path, ...rest];
console.log(`start-active: ${home} serves ${path}`);
// The runtime has no exec: the start runs as this entry's child, which forwards the service manager's stop signals and
// exits with its status.
const child = Bun.spawn({ cmd: command, cwd: receipt.sourceProject, stdio: ['inherit', 'inherit', 'inherit'] });
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { try { child.kill(signal); } catch { /* already exited */ } });
const code = await child.exited;
process.exit(child.signalCode ? 128 + ((constants.signals as Record<string, number>)[child.signalCode] ?? 0) : code);
