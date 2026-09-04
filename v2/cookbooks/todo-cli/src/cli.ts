#!/usr/bin/env bun
// todo — a todo list in a JSON file. Commands are added by the roadmap, one item at a time.
// Usage: bun src/cli.ts <command> [args]   (the store is ./todo.json, or $TODO_FILE)

export const HELP = `todo — a todo list in a JSON file

usage: todo <command> [args]

commands:
  help          show this help
`;

export function main(argv: string[]): { code: number; out: string } {
  const [command] = argv;
  if (!command || command === 'help' || command === '--help') return { code: 0, out: HELP };
  return { code: 2, out: `unknown command: ${command}\n\n${HELP}` };
}

if (import.meta.main) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(out);
  process.exit(code);
}
