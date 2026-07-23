import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const INSTALL_CANDIDATE_SCHEMA = 'open-autonomy.install-candidate.v1' as const

export interface InstallCandidateReceipt {
  schema: typeof INSTALL_CANDIDATE_SCHEMA
  id: string
  kind: 'install' | 'upgrade'
  targetRoot: string
  baseSha: string
  candidateSha: string
  ref: string
  createdAt: string
  patchPath: string
}

export interface PreparedInstallCandidate {
  receipt: InstallCandidateReceipt
  patch: string
}

interface GitResult {
  status: number
  stdout: string
  stderr: string
}

function git(cwd: string, args: string[]): GitResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  }
}

function mustGit(cwd: string, args: string[], purpose: string): string {
  const result = git(cwd, args)
  if (result.status !== 0) {
    throw new Error(
      `open-autonomy: ${purpose} failed (git ${args.join(' ')}, exit ${result.status}): ` +
        `${(result.stderr || result.stdout).trim() || 'no output'}`,
    )
  }
  return result.stdout.trim()
}

function gitRoot(targetDir: string): string {
  const resolvedTarget = realpathSync(resolve(targetDir))
  const root = realpathSync(
    mustGit(resolvedTarget, ['rev-parse', '--show-toplevel'], 'target repository discovery'),
  )
  if (resolvedTarget !== root) {
    throw new Error(
      `open-autonomy: install target must be the Git worktree root (${root}), not a subdirectory (${resolvedTarget})`,
    )
  }
  return root
}

function gitCommonDir(root: string): string {
  const raw = mustGit(root, ['rev-parse', '--git-common-dir'], 'Git metadata discovery')
  return realpathSync(isAbsolute(raw) ? raw : resolve(root, raw))
}

function candidateStore(root: string): string {
  return join(gitCommonDir(root), 'open-autonomy', 'install-candidates')
}

function receiptPath(root: string, candidateSha: string): string {
  return join(candidateStore(root), `${candidateSha}.json`)
}

function patchPath(root: string, candidateSha: string): string {
  return join(candidateStore(root), `${candidateSha}.patch`)
}

export function gitWorktreeStatus(targetDir: string): {
  root: string
  headSha: string
  porcelain: string
} {
  const root = gitRoot(targetDir)
  const headSha = mustGit(root, ['rev-parse', '--verify', 'HEAD'], 'HEAD discovery')
  const porcelain = mustGit(
    root,
    ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
    'worktree status check',
  )
  return { root, headSha, porcelain }
}

export function requireCleanGitWorktree(targetDir: string): {
  root: string
  headSha: string
} {
  const status = gitWorktreeStatus(targetDir)
  if (status.porcelain) {
    throw new Error(
      'open-autonomy: refusing to install into a dirty Git worktree. Commit, stash, or remove every ' +
        `tracked, staged, untracked, and submodule change first.\n${status.porcelain}`,
    )
  }
  return { root: status.root, headSha: status.headSha }
}

function safeCandidateId(): string {
  return `${new Date().toISOString().replaceAll(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
}

export async function prepareInstallCandidate(options: {
  targetDir: string
  kind: InstallCandidateReceipt['kind']
  message: string
  apply: (candidateRoot: string) => void | Promise<void>
  forceAddPaths?: (candidateRoot: string) => string[]
  now?: () => string
}): Promise<PreparedInstallCandidate | null> {
  const { root, headSha: baseSha } = requireCleanGitWorktree(options.targetDir)
  const id = safeCandidateId()
  const ref = `refs/open-autonomy/install-candidates/${id}`
  const scratchParent = mkdtempSync(join(tmpdir(), 'open-autonomy-install-'))
  const candidateRoot = join(scratchParent, 'worktree')
  let worktreeAdded = false

  try {
    mustGit(root, ['worktree', 'add', '--detach', candidateRoot, baseSha], 'candidate worktree creation')
    worktreeAdded = true
    await options.apply(candidateRoot)

    mustGit(candidateRoot, ['add', '-A', '--'], 'candidate staging')
    const forceAddPaths = options.forceAddPaths?.(candidateRoot) ?? []
    if (forceAddPaths.length) {
      mustGit(candidateRoot, ['add', '-f', '--', ...forceAddPaths], 'generated candidate staging')
    }
    const staged = git(candidateRoot, ['diff', '--cached', '--quiet', '--exit-code'])
    if (staged.status === 0) return null
    if (staged.status !== 1) {
      throw new Error(
        `open-autonomy: candidate staged-diff check failed: ${(staged.stderr || staged.stdout).trim()}`,
      )
    }
    mustGit(
      candidateRoot,
      [
        '-c',
        'user.name=Open Autonomy Installer',
        '-c',
        'user.email=open-autonomy@localhost',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '--no-gpg-sign',
        '-m',
        options.message,
      ],
      'candidate commit creation',
    )
    const candidateStatus = mustGit(
      candidateRoot,
      ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'],
      'candidate completeness check',
    )
    if (candidateStatus) {
      throw new Error(
        'open-autonomy: candidate preparation left repository bytes outside the reviewed commit:\n' +
          candidateStatus,
      )
    }
    const candidateSha = mustGit(
      candidateRoot,
      ['rev-parse', '--verify', 'HEAD'],
      'candidate commit discovery',
    )
    const parentSha = mustGit(
      candidateRoot,
      ['rev-parse', '--verify', `${candidateSha}^`],
      'candidate parent discovery',
    )
    if (parentSha !== baseSha) {
      throw new Error(
        `open-autonomy: candidate commit ${candidateSha} is not a single commit on reviewed base ${baseSha}`,
      )
    }
    mustGit(root, ['update-ref', ref, candidateSha, '0'.repeat(40)], 'candidate ref creation')

    const patch = mustGit(
      candidateRoot,
      [
        'show',
        '--format=fuller',
        '--stat',
        '--patch',
        '--binary',
        '--full-index',
        '--find-renames',
        '--no-ext-diff',
        '--no-textconv',
        candidateSha,
      ],
      'candidate diff rendering',
    )
    const store = candidateStore(root)
    mkdirSync(store, { recursive: true })
    const storedPatchPath = patchPath(root, candidateSha)
    const storedReceiptPath = receiptPath(root, candidateSha)
    const receipt: InstallCandidateReceipt = {
      schema: INSTALL_CANDIDATE_SCHEMA,
      id,
      kind: options.kind,
      targetRoot: root,
      baseSha,
      candidateSha,
      ref,
      createdAt: options.now?.() ?? new Date().toISOString(),
      patchPath: storedPatchPath,
    }
    writeFileSync(storedPatchPath, `${patch}\n`)
    writeFileSync(storedReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
    return { receipt, patch }
  } finally {
    if (worktreeAdded) {
      const removed = git(root, ['worktree', 'remove', '--force', candidateRoot])
      if (removed.status !== 0 && existsSync(candidateRoot)) {
        throw new Error(
          `open-autonomy: candidate worktree cleanup failed: ${(removed.stderr || removed.stdout).trim()}`,
        )
      }
    }
    if (existsSync(scratchParent)) rmSync(scratchParent, { recursive: true, force: true })
  }
}

function readReceipt(root: string, candidateSha: string): InstallCandidateReceipt {
  const path = receiptPath(root, candidateSha)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `open-autonomy: no prepared install candidate receipt for ${candidateSha}: ${(error as Error).message}`,
    )
  }
  const receipt = parsed as Partial<InstallCandidateReceipt>
  if (
    receipt.schema !== INSTALL_CANDIDATE_SCHEMA ||
    receipt.candidateSha !== candidateSha ||
    typeof receipt.baseSha !== 'string' ||
    typeof receipt.ref !== 'string' ||
    typeof receipt.targetRoot !== 'string'
  ) {
    throw new Error(`open-autonomy: malformed install candidate receipt ${path}`)
  }
  return receipt as InstallCandidateReceipt
}

export function acceptInstallCandidate(
  targetDir: string,
  candidateSha: string,
  options: {
    expectedKind?: InstallCandidateReceipt['kind']
    retainReceipt?: boolean
    allowAlreadyAccepted?: boolean
  } = {},
): InstallCandidateReceipt {
  if (!/^[0-9a-f]{40}$/.test(candidateSha)) {
    throw new Error('open-autonomy: --accept requires the full 40-character reviewed candidate SHA')
  }
  const { root, headSha } = requireCleanGitWorktree(targetDir)
  const receipt = readReceipt(root, candidateSha)
  if (options.expectedKind && receipt.kind !== options.expectedKind) {
    throw new Error(
      `open-autonomy: candidate ${candidateSha} is a ${receipt.kind} candidate, not ${options.expectedKind}`,
    )
  }
  if (realpathSync(receipt.targetRoot) !== root) {
    throw new Error(
      `open-autonomy: candidate ${candidateSha} belongs to ${receipt.targetRoot}, not ${root}`,
    )
  }
  if (headSha !== receipt.baseSha && headSha !== candidateSha) {
    throw new Error(
      `open-autonomy: target HEAD moved after candidate preparation: reviewed base ${receipt.baseSha}, ` +
        `current HEAD ${headSha}. Prepare and review a new candidate.`,
    )
  }
  const resolvedCandidate = mustGit(
    root,
    ['rev-parse', '--verify', receipt.ref],
    'candidate ref verification',
  )
  if (resolvedCandidate !== candidateSha) {
    throw new Error(
      `open-autonomy: candidate ref ${receipt.ref} no longer resolves to reviewed SHA ${candidateSha}`,
    )
  }
  const parentSha = mustGit(
    root,
    ['rev-parse', '--verify', `${candidateSha}^`],
    'candidate parent verification',
  )
  if (parentSha !== receipt.baseSha) {
    throw new Error(
      `open-autonomy: candidate parent ${parentSha} no longer matches reviewed base ${receipt.baseSha}`,
    )
  }
  if (headSha === candidateSha) {
    if (!options.allowAlreadyAccepted) {
      throw new Error(
        `open-autonomy: candidate ${candidateSha} is already HEAD; no second acceptance is needed`,
      )
    }
  } else {
    mustGit(
      root,
      ['-c', 'core.hooksPath=/dev/null', 'merge', '--ff-only', candidateSha],
      'reviewed candidate acceptance',
    )
  }
  const acceptedHead = mustGit(root, ['rev-parse', '--verify', 'HEAD'], 'accepted HEAD verification')
  if (acceptedHead !== candidateSha) {
    throw new Error(
      `open-autonomy: accepted HEAD ${acceptedHead} does not match reviewed candidate ${candidateSha}`,
    )
  }
  requireCleanGitWorktree(root)
  if (!options.retainReceipt) finalizeInstallCandidate(root, candidateSha)
  return receipt
}

export function finalizeInstallCandidate(
  targetDir: string,
  candidateSha: string,
): InstallCandidateReceipt {
  const root = gitRoot(targetDir)
  const receipt = readReceipt(root, candidateSha)
  const headSha = mustGit(root, ['rev-parse', '--verify', 'HEAD'], 'accepted HEAD discovery')
  if (headSha !== candidateSha) {
    throw new Error(
      `open-autonomy: cannot finalize candidate ${candidateSha}; target HEAD is ${headSha}`,
    )
  }
  const resolvedCandidate = mustGit(
    root,
    ['rev-parse', '--verify', receipt.ref],
    'candidate ref finalization check',
  )
  if (resolvedCandidate !== candidateSha) {
    throw new Error(
      `open-autonomy: cannot finalize candidate ${candidateSha}; ${receipt.ref} resolves to ${resolvedCandidate}`,
    )
  }
  mustGit(root, ['update-ref', '-d', receipt.ref, candidateSha], 'candidate ref cleanup')
  const storedReceipt = receiptPath(root, candidateSha)
  const storedPatch = patchPath(root, candidateSha)
  if (existsSync(storedReceipt)) unlinkSync(storedReceipt)
  if (existsSync(storedPatch)) unlinkSync(storedPatch)
  const store = dirname(storedReceipt)
  if (existsSync(store)) {
    try {
      rmSync(store)
    } catch {
      // Other prepared candidates still use this directory.
    }
  }
  return receipt
}

export function renderPreparedInstallCandidate(candidate: PreparedInstallCandidate): string {
  const { receipt, patch } = candidate
  return [
    `Prepared ${receipt.kind} candidate ${receipt.candidateSha}`,
    `Base: ${receipt.baseSha}`,
    `Target: ${receipt.targetRoot}`,
    `Stored full patch: ${receipt.patchPath}`,
    '',
    'REVIEW THIS COMPLETE COMMIT DIFF:',
    '',
    patch,
    '',
    `After an installing agent has reviewed this exact SHA, accept it with the calling workflow's --accept flag`,
    `or: open-autonomy accept ${receipt.candidateSha} --target ${receipt.targetRoot}`,
    'If the target worktree or HEAD changes first, acceptance will refuse and a new candidate must be prepared.',
  ].join('\n')
}
