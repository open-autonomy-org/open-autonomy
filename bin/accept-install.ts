#!/usr/bin/env bun
import { resolve } from 'node:path'
import { acceptInstallCandidate } from './git-install-transaction.ts'

const args = process.argv.slice(2)
const targetIndex = args.indexOf('--target')
const target = targetIndex >= 0 ? args[targetIndex + 1] : '.'
const unknownFlags = args.filter(
  (value) => value.startsWith('-') && value !== '--target' && value !== '--help' && value !== '-h',
)
const positional = args.filter((value, index) => {
  if (value === '--target') return false
  if (targetIndex >= 0 && index === targetIndex + 1) return false
  return !value.startsWith('--')
})
const candidateSha = positional[0]
const usage = 'usage: open-autonomy accept <full-candidate-sha> [--target <git-worktree>]'

if (
  !candidateSha ||
  !target ||
  positional.length !== 1 ||
  unknownFlags.length > 0 ||
  args.includes('--help') ||
  args.includes('-h')
) {
  process.stdout.write(`${usage}\n`)
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 2)
}

try {
  const receipt = acceptInstallCandidate(resolve(target), candidateSha)
  process.stdout.write(
    `Accepted reviewed ${receipt.kind} candidate ${receipt.candidateSha} onto ${receipt.targetRoot}.\n`,
  )
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
}
