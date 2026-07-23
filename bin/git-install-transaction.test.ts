import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acceptInstallCandidate,
  finalizeInstallCandidate,
  prepareInstallCandidate,
  renderPreparedInstallCandidate,
  requireCleanGitWorktree,
} from './git-install-transaction.ts'

const roots: string[] = []

function run(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(args, { cwd, stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) {
    throw new Error(`${args.join(' ')} failed: ${result.stderr.toString('utf8')}`)
  }
  return result.stdout.toString('utf8').trim()
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-install-transaction-test-'))
  roots.push(root)
  run(root, ['git', 'init', '-q'])
  writeFileSync(join(root, 'existing.txt'), 'base\n')
  run(root, ['git', 'add', 'existing.txt'])
  run(root, [
    'git',
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-q',
    '-m',
    'base',
  ])
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('install candidate transaction', () => {
  test('refuses tracked, staged, untracked, and submodule-visible dirt before preparation', async () => {
    const root = repo()
    writeFileSync(join(root, 'untracked.txt'), 'dirty\n')
    expect(() => requireCleanGitWorktree(root)).toThrow(/dirty Git worktree/)
    await expect(
      prepareInstallCandidate({
        targetDir: root,
        kind: 'install',
        message: 'Install Open Autonomy',
        apply(candidateRoot) {
          writeFileSync(join(candidateRoot, 'generated.txt'), 'generated\n')
        },
      }),
    ).rejects.toThrow(/dirty Git worktree/)
    expect(existsSync(join(root, 'generated.txt'))).toBe(false)
  })

  test('prepares one reviewable commit without touching the target, then accepts that exact SHA', async () => {
    const root = repo()
    const base = run(root, ['git', 'rev-parse', 'HEAD'])
    const candidate = await prepareInstallCandidate({
      targetDir: root,
      kind: 'upgrade',
      message: 'Upgrade Open Autonomy',
      now: () => '2026-07-23T00:00:00.000Z',
      apply(candidateRoot) {
        writeFileSync(join(candidateRoot, 'existing.txt'), 'upgraded\n')
        mkdirSync(join(candidateRoot, 'nested'), { recursive: true })
        writeFileSync(join(candidateRoot, 'nested', 'new.txt'), 'new\n')
      },
    })
    expect(candidate).not.toBeNull()
    expect(run(root, ['git', 'rev-parse', 'HEAD'])).toBe(base)
    expect(readFileSync(join(root, 'existing.txt'), 'utf8')).toBe('base\n')
    expect(existsSync(join(root, 'nested', 'new.txt'))).toBe(false)
    expect(candidate!.receipt.baseSha).toBe(base)
    expect(candidate!.patch).toContain('diff --git a/existing.txt b/existing.txt')
    expect(candidate!.patch).toContain('diff --git a/nested/new.txt b/nested/new.txt')
    expect(renderPreparedInstallCandidate(candidate!)).toContain(
      `open-autonomy accept ${candidate!.receipt.candidateSha}`,
    )

    acceptInstallCandidate(root, candidate!.receipt.candidateSha)
    expect(run(root, ['git', 'rev-parse', 'HEAD'])).toBe(candidate!.receipt.candidateSha)
    expect(readFileSync(join(root, 'existing.txt'), 'utf8')).toBe('upgraded\n')
    expect(readFileSync(join(root, 'nested', 'new.txt'), 'utf8')).toBe('new\n')
    expect(run(root, ['git', 'status', '--porcelain'])).toBe('')
  })

  test('acceptance refuses dirt and a moved HEAD instead of applying a stale reviewed commit', async () => {
    const root = repo()
    const candidate = await prepareInstallCandidate({
      targetDir: root,
      kind: 'install',
      message: 'Install Open Autonomy',
      apply(candidateRoot) {
        writeFileSync(join(candidateRoot, 'generated.txt'), 'generated\n')
      },
    })
    expect(candidate).not.toBeNull()

    writeFileSync(join(root, 'dirty.txt'), 'dirty\n')
    expect(() => acceptInstallCandidate(root, candidate!.receipt.candidateSha)).toThrow(
      /dirty Git worktree/,
    )
    rmSync(join(root, 'dirty.txt'))

    writeFileSync(join(root, 'later.txt'), 'later\n')
    run(root, ['git', 'add', 'later.txt'])
    run(root, [
      'git',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-q',
      '-m',
      'later',
    ])
    expect(() => acceptInstallCandidate(root, candidate!.receipt.candidateSha)).toThrow(
      /target HEAD moved/,
    )
    expect(existsSync(join(root, 'generated.txt'))).toBe(false)
  })

  test('candidate creation and acceptance do not execute target repository hooks', async () => {
    const root = repo()
    const marker = join(root, '.git', 'installer-hook-ran')
    for (const hook of ['pre-commit', 'post-merge']) {
      const path = join(root, '.git', 'hooks', hook)
      writeFileSync(path, `#!/bin/sh\nprintf ran > '${marker}'\n`)
      chmodSync(path, 0o755)
    }

    const candidate = await prepareInstallCandidate({
      targetDir: root,
      kind: 'install',
      message: 'Install Open Autonomy',
      apply(candidateRoot) {
        writeFileSync(join(candidateRoot, 'generated.txt'), 'generated\n')
      },
    })
    expect(candidate).not.toBeNull()
    expect(existsSync(marker)).toBe(false)
    acceptInstallCandidate(root, candidate!.receipt.candidateSha)
    expect(existsSync(marker)).toBe(false)
  })

  test('one-shot setup may resume an already-accepted candidate until explicit finalization', async () => {
    const root = repo()
    const candidate = await prepareInstallCandidate({
      targetDir: root,
      kind: 'install',
      message: 'Install Open Autonomy',
      apply(candidateRoot) {
        writeFileSync(join(candidateRoot, 'generated.txt'), 'generated\n')
      },
    })
    expect(candidate).not.toBeNull()
    const options = {
      expectedKind: 'install' as const,
      retainReceipt: true,
      allowAlreadyAccepted: true,
    }
    acceptInstallCandidate(root, candidate!.receipt.candidateSha, options)
    expect(existsSync(candidate!.receipt.patchPath)).toBe(true)
    expect(
      acceptInstallCandidate(root, candidate!.receipt.candidateSha, options).candidateSha,
    ).toBe(candidate!.receipt.candidateSha)

    finalizeInstallCandidate(root, candidate!.receipt.candidateSha)
    expect(existsSync(candidate!.receipt.patchPath)).toBe(false)
    expect(() =>
      acceptInstallCandidate(root, candidate!.receipt.candidateSha, options),
    ).toThrow(/no prepared install candidate receipt/)
  })

  test('returns no candidate for a no-op and leaves no target changes', async () => {
    const root = repo()
    const candidate = await prepareInstallCandidate({
      targetDir: root,
      kind: 'upgrade',
      message: 'Upgrade Open Autonomy',
      apply() {},
    })
    expect(candidate).toBeNull()
    expect(run(root, ['git', 'status', '--porcelain'])).toBe('')
  })
})
