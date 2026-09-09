#!/usr/bin/env bun
// Installed as `codex` inside the local container. This is only Hermes's stdio
// transport; the installed host CLI owns login, version and model execution.
import { forwardCodexStdio } from './sdk/codex-bridge.ts';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  const version = process.env.OPEN_AUTONOMY_CODEX_VERSION;
  if (!version || !/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) throw new Error('The host Codex version was not verified at startup.');
  console.log(version);
} else if (args[0] === 'app-server') {
  // Hermes may append native sandbox -c arguments for kanban. Host bridge policy
  // already fixes execution to the container and never applies client CLI flags.
  for (let i = 1; i < args.length; i += 2) {
    if (args[i] !== '-c' || !/^sandbox_(mode|workspace_write\.(writable_roots|network_access))=/.test(args[i + 1] ?? '')) throw new Error('Unsupported Codex transport argument.');
  }
  const keys = ['HERMES_HOME', 'HERMES_SESSION_ID', 'HERMES_KANBAN_TASK', 'HERMES_KANBAN_RUN_ID', 'HERMES_KANBAN_DB', 'HERMES_KANBAN_BOARD', 'HERMES_KANBAN_WORKSPACE', 'HERMES_KANBAN_WORKSPACES_ROOT', 'HERMES_KANBAN_CLAIM_LOCK'];
  const context = Object.fromEntries(keys.filter(k => process.env[k]).map(k => [k, process.env[k]!]));
  await forwardCodexStdio({ url: process.env.OPEN_AUTONOMY_CODEX_URL ?? '', token: process.env.OPEN_AUTONOMY_CODEX_TOKEN ?? '', context });
} else {
  console.error('This container transport supports only the native Hermes app-server connection.');
  process.exit(2);
}
