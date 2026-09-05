#!/usr/bin/env bun
// lexicon — a shared glossary in a JSON file, rendered to the homepage. Commands are added by the board, one
// task at a time. Usage: bun src/lexicon.ts <command> [args]   (the store is ./lexicon.json, or $LEXICON_FILE)
export const HELP = `lexicon — a shared glossary in a JSON file

usage: lexicon <command> [args]

commands:
  help          show this help
`;
export function main(argv: string[]): string {
  const [command] = argv;
  if (!command || command === 'help') return HELP;
  throw new Error(`unknown command: ${command}\n\n${HELP}`);
}
if (import.meta.main) {
  try { console.log(main(process.argv.slice(2))); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
