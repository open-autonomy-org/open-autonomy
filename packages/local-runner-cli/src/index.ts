// @volter/oa — the local substrate as a versioned CLI. Public API surface: every verb is both a callable
// function (for programmatic use — e.g. a future fleet console) and reachable via `runCli(argv)`, which
// `src/bin/oa.ts` (the `oa` executable) calls.
export { start } from './reconciler.ts';
export type { StartOptions } from './reconciler.ts';
export { once } from './once.ts';
export type { OnceResult } from './once.ts';
export { pause, resume, isPaused, pausedMarkerPath, pausedMessage, pauseReasonText, DRAIN_NOTE } from './pause.ts';
export { status, formatStatus, readLastFires } from './status.ts';
export { acceptControlGeneration, readControlGeneration, verifyControlGeneration, verifyControlPaths } from './control-generation.ts';
export type { ControlGeneration } from './control-generation.ts';
export { recoverEffect } from './effect-recovery.ts';
export type { StatusReport, LastFireRecord } from './status.ts';
export { dispatch } from './dispatch.ts';
export type { DispatchResult } from './dispatch.ts';
export { doctor, formatDoctorReport } from './doctor.ts';
export type { DoctorReport, DoctorCheck } from './doctor.ts';
export { loadSchedule, normalizeSchedule, agentOf, reconciledScripts, otherScripts } from './config.ts';
export { hasDispatchableWork, resolveBoardKind, readMaturitySignals } from './board-readiness.ts';
export type { DispatchableWorkOptions, DispatchableWorkVerdict, BoardKind, BoardKindSource } from './board-readiness.ts';
export { missionAdvancingSignal } from './m6-signal.ts';
export type { Signal as MissionAdvancingSignal, MissionAdvancingContext, MissionAdvancingSignalFn } from './m6-signal.ts';
export type { NormalizedJob, NormalizedSchedule, NormalizedScript } from './types.ts';
export { bringUpProvider, providerStatus, providerDown } from './provider.ts';
export type { BringUpOptions, BringUpResult, ProviderState, ProviderStatusResult, ProviderDownResult } from './provider.ts';
export {
  disableService,
  enableService,
  ensureService,
  serviceStatus,
} from './service.ts';
export type {
  EnsureServiceResult,
  ServiceEnableReceipt,
  ServiceStatus,
} from './service.ts';
export {
  disableZtrackIntegration,
  enableZtrackIntegration,
  ZTRACK_SERVICE_HOOK_ID,
} from './ztrack-integration.ts';
export type { ZtrackIntegrationOptions } from './ztrack-integration.ts';
export {
  a1GeneratedJsonValid,
  a2CompileClean,
  a3AutonomyYmlParses,
  a4PausedSeeded,
  a5PausedAbsent,
  a6HarnessCommitted,
  a8a10DoctorPass,
  a11PreflightPass,
  a12GhPreflightReady,
  a13ProvisionMatchesLiveProtection,
  a14BoardHasDispatchableWork,
  IMM_SIGNALS,
  collectImmSignals,
} from './imm-signals.ts';
export type { Signal, SignalFn, SignalContext } from './imm-signals.ts';
export { IMM_SIGNAL_IDS, signalSetFor } from './signal-sets.ts';
export { resolveInstallScript, runInstallDelegate, INSTALL_NOT_AVAILABLE_MESSAGE } from './install-delegate.ts';
export type { InstallDelegateResult, RunInstallDelegateOptions, SpawnFn } from './install-delegate.ts';
export type { ImmSignalId, SignalId, SignalSet, SignalSetPack, SkippedSignal, InstallTarget } from './signal-sets.ts';
export {
  computeMaturity,
  directionContentSignal,
  proxyReadySignal,
  humanSeamWiredSignal,
  evaluateExtraRung,
  declaredAgentNames,
  STAGE_NAMES,
  STAGE_ORDER,
  INSTALL_JSON_REL,
} from './maturity.ts';
export type { Stage, InstallRecord, InstallSignalEntry, InstallSkipEntry, MaturityOptions, PackInfo, SessionProbe } from './maturity.ts';

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './reconciler.ts';
import { once } from './once.ts';
import { pause, resume } from './pause.ts';
import { status, formatStatus } from './status.ts';
import { dispatch } from './dispatch.ts';
import { doctor, formatDoctorReport } from './doctor.ts';
import { bringUpProvider, providerStatus, providerDown } from './provider.ts';
import { computeMaturity } from './maturity.ts';
import type { MaturityOptions } from './maturity.ts';
import type { InstallTarget } from './signal-sets.ts';
import { runInstallDelegate } from './install-delegate.ts';
import { activationHome, configuredActivationHome, readActivationRoutingState } from './activation-paths.ts';
import {
  disableService,
  enableService,
  ensureService,
  readServiceEnable,
  runService,
  servicePaths,
  serviceStatus,
} from './service.ts';
import { disableZtrackIntegration, enableZtrackIntegration } from './ztrack-integration.ts';
import { runResident } from './resident.ts';

function signalExitCode(signal: NodeJS.Signals | null): number {
  if (!signal) return 0;
  const numbers: Partial<Record<NodeJS.Signals, number>> = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGTERM: 15,
  };
  return 128 + (numbers[signal] ?? 1);
}

function pkgVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP = `oa <command> [args]  (@volter/oa v${pkgVersion()}) — the local open-autonomy substrate as a CLI

  oa start                     continuous scheduler; follows atomic generations when activation is configured
  oa service enable            arm on-demand recovery for this repository; does not start anything
  oa service ensure            start the armed service if it is down; otherwise reuse the singleton
  oa service status            report armed/running state and the repository-scoped service pid
  oa service disable           disarm recovery and stop the running service, if any
  oa integration ztrack enable arm the service and register OA through ztrack's public project hook
  oa integration ztrack disable
                               remove OA's ztrack hook; does not stop or disarm the service
  oa once                      make one pass over jobs, respecting fences and concurrency
  oa pause [reason]             touch the conventional .open-autonomy/paused job fence
  oa resume                     remove .open-autonomy/paused and re-arm jobs assigned that fence
  oa status                     fence state + live sessions + last-fire info
  oa dispatch <agent>           fire one declared agent job now, bypassing cadence only
  oa recover-effect <marker> --control-sha <sha>
                                bind one inspected legacy marker to the active accepted generation
  oa activate [--profile <path>] [--provider-url <url>] [--local-schedule-config <path>] [--poll-ms <n>]
                                configure (when --profile is given), stage, validate, and atomically activate
                                the remote default branch; reruns are idempotent
  oa rollback [sha]             atomically route back to the retained previous (or named) generation
  oa doctor [--live] [--json]   offline checks: dep-integrity + fence + schedule.json + prompts/skills;
                                --live additionally probes the termfleet provider's /healthz over the network
  oa maturity [--json] [--profile-dir <path>] [--profile <name>] [--target local|gh-actions]
                                [--repo <owner/name>] [--actor <name>] [--work-item <id>]
                                [--preflight-bin <path>] [--gh-preflight-script <path>]
                                composes the IMM stage verdict (M0..M6, DESIGN §Q1) from every deterministic
                                signal + the mission-advancing check and writes .open-autonomy/install.json
                                (idempotent overwrite every run). --profile-dir points at the SOURCE profile
                                (e.g. profiles/simple-sdlc) — without it, only the universal signal set runs
                                and profile-specific rungs report honestly unresolved. A report verb (like
                                'oa status'): always exits 0 — the stage itself is the payload.
  oa provider up                 bring up a repo-unique-port termfleet console+provider, verify its
                                identity, and pin TERMFLEET_PROVIDER_URL durably into schedule.json's env
                                (idempotent: no-ops on a healthy pin, restarts a dead one on the same ports)
  oa provider status             report whether the pinned provider is up and really answering as termfleet
  oa provider down                stop the provider/console this install brought up (best-effort SIGTERM)
  oa install [args]              (TE.8) the one-shot install agent — chains DETECT->SELECT->DIRECTION->
                                AUTHORIZE->EXECUTE->VALIDATE->HAND-OFF->PROVE-ADVANCING into one command,
                                pausing at the 4 human gates by default. Try 'oa install --dry-run' FIRST —
                                the safe way to rehearse the entire chain against a real repo with zero real
                                side effects (no real npm/git/compile writes, no real termfleet provider
                                bring-up, no real agent dispatch). Delegates (spawns, never imports) to the
                                monorepo's own bin/install.ts — SOURCE-CHECKOUT ONLY today (T0.1): run
                                'oa install --help' for the full flow, or see it directly with
                                'bun bin/install.ts --help'.

Fence marker files declared by scheduled jobs remain the source of truth; service receipts control only
process lifetime, never dispatch policy. schedule.json/autonomy.yml/prompts are read from the current
working directory (the repo root) — nothing is bundled or cached from a prior install.
`;

/** Programmatic argv-compatible entry point used by the `oa` executable. */
export async function runCli(
  argv: string[],
  options: { launcherPath?: string; ztrackPath?: string; nodePath?: string } = {},
): Promise<number> {
  const [cmd, ...rest] = argv;
  const cwd = process.cwd();
  const activeRuntime = (): { cwd: string; ambient: NodeJS.ProcessEnv } => {
    const state = readActivationRoutingState(cwd);
    const generation = state?.active;
    if (configuredActivationHome(cwd) && !generation) {
      throw new Error('[oa] activation is configured but has no validated active generation; run `oa activate` before firing work');
    }
    if (!generation) return { cwd, ambient: process.env };
    return {
      cwd: generation.root,
      ambient: {
        ...process.env,
        AUTONOMY_ACTIVATION_HOME: activationHome(cwd),
        AUTONOMY_CONTROL_ROOT: generation.root,
        AUTONOMY_CONTROL_SHA: generation.sha,
      },
    };
  };

  if (!cmd || cmd === 'start') {
    try {
      let repositoryScoped = true;
      try {
        servicePaths(cwd);
      } catch (error) {
        if ((error as Error).message !== '[oa] service requires a git repository') throw error;
        repositoryScoped = false;
      }
      if (!repositoryScoped) {
        if (configuredActivationHome(cwd)) {
          const { superviseActivation } = await import('./activation-supervisor.ts');
          await superviseActivation({ cwd });
        } else await start({ cwd });
        return 0;
      }
      const signal = await runService({
        cwd,
        installSignalHandlers: true,
        run: (abortSignal, onReady) => runResident({ cwd, signal: abortSignal, onReady }),
      });
      return signalExitCode(signal);
    } catch (e) {
      // A preflight failure already printed its guard message inside runPreflight; surface the summary +
      // exit nonzero — the exact behavior run.mjs had (process.exit(1) after the guard's console.error).
      console.error((e as Error)?.message ?? e);
      return 1;
    }
  }
  if (cmd === 'service') {
    const sub = rest[0];
    const projectIndex = rest.indexOf('--project');
    const project = projectIndex >= 0 && rest[projectIndex + 1] ? resolve(rest[projectIndex + 1]!) : cwd;
    try {
      if (sub === 'enable') {
        const launcher = options.launcherPath ?? process.argv[1];
        if (!launcher) throw new Error('[oa] service enable could not resolve the oa launcher');
        const receipt = enableService(project, launcher);
        console.log(
          `[oa] service enabled for ${receipt.projectRoot}; run \`oa service ensure\` explicitly, ` +
          `or \`oa integration ztrack enable\` to add an on-demand trigger`,
        );
        return 0;
      }
      if (sub === 'ensure') {
        const result = await ensureService(project);
        console.log(`[oa] service ${result.action} (pid ${result.health.pid})`);
        return 0;
      }
      if (sub === 'status') {
        const result = await serviceStatus(project);
        const pid = result.health ? `, pid ${result.health.pid}` : '';
        console.log(`[oa] service: ${result.enabled ? 'enabled' : 'disabled'}, ${result.state}${pid}`);
        return result.state === 'port-conflict' ? 1 : 0;
      }
      if (sub === 'disable') {
        const result = await disableService(project);
        console.log(`[oa] service disabled${result.stopped ? ' and stopped' : ''}`);
        return 0;
      }
      if (sub === 'run') {
        const signal = await runService({
          cwd: project,
          installSignalHandlers: true,
          run: (abortSignal, onReady) => runResident({ cwd: project, signal: abortSignal, onReady }),
        });
        return signalExitCode(signal);
      }
      console.error('[oa] service: usage: oa service enable|ensure|status|disable');
      return 1;
    } catch (error) {
      console.error((error as Error)?.message ?? error);
      return 1;
    }
  }
  if (cmd === 'integration' && rest[0] === 'ztrack') {
    const action = rest[1];
    const projectIndex = rest.indexOf('--project');
    const project = projectIndex >= 0 && rest[projectIndex + 1] ? resolve(rest[projectIndex + 1]!) : cwd;
    try {
      if (action === 'enable') {
        const launcher = options.launcherPath ?? process.argv[1];
        if (!launcher) throw new Error('[oa] ztrack integration could not resolve the oa launcher');
        const receipt = enableService(project, launcher);
        try {
          enableZtrackIntegration(receipt.projectRoot, {
            launcherPath: launcher,
            ...(options.ztrackPath ? { ztrackPath: options.ztrackPath } : {}),
            ...(options.nodePath ? { nodePath: options.nodePath } : {}),
          });
        } catch (error) {
          console.error((error as Error)?.message ?? error);
          console.error('[oa] service is armed but has no automatic trigger; use `oa service ensure`');
          return 1;
        }
        console.log(
          `[oa] ztrack integration enabled for ${receipt.projectRoot}; ` +
          `a project-bound ztrack invocation will ensure the repository service`,
        );
        return 0;
      }
      if (action === 'disable') {
        disableZtrackIntegration(project, options.ztrackPath);
        console.log('[oa] ztrack integration disabled; service lifecycle is unchanged');
        return 0;
      }
      if (action === 'wake') {
        const paths = servicePaths(project);
        if (!readServiceEnable(paths)) return 0;
        await ensureService(project);
        return 0;
      }
      console.error('[oa] integration ztrack: usage: oa integration ztrack enable|disable');
      return 1;
    } catch (error) {
      console.error((error as Error)?.message ?? error);
      return 1;
    }
  }
  if (cmd === 'activate') {
    const { activateAcceptedGeneration, configureActivation, readActivationConfig } = await import('./activation.ts');
    const flag = (name: string): string | undefined => {
      const i = rest.indexOf(name);
      return i >= 0 && i + 1 < rest.length ? rest[i + 1] : undefined;
    };
    const profile = flag('--profile');
    if (profile) {
      configureActivation({
        profile,
        ...(flag('--provider-url') ? { providerUrl: flag('--provider-url')! } : {}),
        ...(flag('--local-schedule-config') ? { localScheduleConfig: flag('--local-schedule-config')! } : {}),
        pollMs: Number(flag('--poll-ms') ?? 60_000),
      }, { cwd });
    } else if (!readActivationConfig(cwd)) {
      console.error('[oa] activate: first use requires --profile <repo-relative-profile>');
      return 2;
    }
    const result = await activateAcceptedGeneration({ cwd });
    console.log(`[oa] activate: ${result.action}${result.state.active ? ` ${result.state.active.sha}` : ''}`);
    if (result.reason) console.error(`[oa] activate: ${result.reason}`);
    return result.ok ? 0 : 1;
  }
  if (cmd === 'rollback') {
    const { rollbackActivation } = await import('./activation.ts');
    const result = rollbackActivation({ cwd, ...(rest[0] ? { sha: rest[0] } : {}) });
    if (result.ok) console.log(`[oa] rollback: active ${result.state.active?.sha}`);
    else console.error(`[oa] rollback refused: ${result.reason}`);
    return result.ok ? 0 : 1;
  }
  if (cmd === '--once' || cmd === 'once') {
    const runtime = activeRuntime();
    const r = await once({ cwd: runtime.cwd, ambient: runtime.ambient });
    if (r.reason) console.error(`[oa] once: ${r.reason}`);
    return r.ok ? 0 : 1;
  }
  if (cmd === 'pause') {
    const r = pause({ cwd, reason: rest.length ? rest.join(' ') : undefined });
    console.log(`[oa] pause: ${r.alreadyPaused ? 'already paused' : 'paused'} (${r.path})`);
    return 0;
  }
  if (cmd === 'resume') {
    const r = resume({ cwd });
    console.log(`[oa] resume: ${r.wasPaused ? 'unpaused' : 'was not paused'} (${r.path})`);
    return 0;
  }
  if (cmd === 'status') {
    const r = await status({ cwd });
    console.log(formatStatus(r));
    return 0;
  }
  if (cmd === 'dispatch') {
    const agent = rest[0];
    if (!agent) {
      console.error('[oa] dispatch: requires an agent name — oa dispatch <agent>');
      return 1;
    }
    const runtime = activeRuntime();
    Object.assign(process.env, runtime.ambient);
    const r = dispatch(agent, { cwd: runtime.cwd });
    if (r.reason) console.error(r.reason);
    return r.ok ? 0 : 1;
  }
  if (cmd === 'recover-effect') {
    const marker = rest[0];
    const shaIndex = rest.indexOf('--control-sha');
    const sha = shaIndex >= 0 ? rest[shaIndex + 1] : undefined;
    if (!marker || !sha) {
      console.error('[oa] recover-effect: usage: oa recover-effect <parked-marker> --control-sha <accepted-sha>');
      return 1;
    }
    const { recoverEffect } = await import('./effect-recovery.ts');
    const result = recoverEffect(marker, sha, { cwd: activeRuntime().cwd });
    if (!result.ok) {
      console.error(`[oa] recover-effect refused: ${result.reason}`);
      return 1;
    }
    console.log(`[oa] recovered effect into ${result.path}`);
    return 0;
  }
  if (cmd === 'doctor') {
    const json = rest.includes('--json');
    const live = rest.includes('--live');
    const runtime = activeRuntime();
    const r = await doctor({ cwd: runtime.cwd, live, env: runtime.ambient });
    console.log(json ? JSON.stringify(r, null, 2) : formatDoctorReport(r));
    return r.ok ? 0 : 1;
  }
  if (cmd === 'maturity') {
    const json = rest.includes('--json');
    const flag = (name: string): string | undefined => {
      const i = rest.indexOf(name);
      return i >= 0 && i + 1 < rest.length ? rest[i + 1] : undefined;
    };
    const profileDir = flag('--profile-dir');
    const profile = flag('--profile');
    const targetFlag = flag('--target');
    const repo = flag('--repo');
    const actor = flag('--actor');
    const workItemId = flag('--work-item');
    const preflightBin = flag('--preflight-bin');
    const ghPreflightScript = flag('--gh-preflight-script');

    const mOpts: MaturityOptions = { cwd };
    if (profileDir) mOpts.profileDir = profileDir;
    if (profile) mOpts.profile = profile;
    if (targetFlag === 'local' || targetFlag === 'gh-actions') mOpts.target = targetFlag as InstallTarget;
    if (repo) mOpts.repo = repo;
    if (actor) mOpts.actor = actor;
    if (workItemId) mOpts.workItemId = workItemId;
    if (preflightBin) mOpts.preflightBin = preflightBin;
    if (ghPreflightScript) mOpts.ghPreflightScript = ghPreflightScript;

    const record = await computeMaturity(mOpts);
    if (json) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      console.log(`[oa] maturity: ${record.stage}/${record.stageName} (profile=${record.profile ?? '(unknown)'}, substrate=${record.substrate ?? '(unknown)'})`);
      for (const b of record.blockers) console.log(`[oa]   ${b}`);
      console.log(`[oa]   wrote ${join(cwd, '.open-autonomy', 'install.json')}`);
    }
    // A report verb, like `oa status` — the stage/blockers are the payload; the invocation itself never
    // "fails" just because the install isn't fully mature yet.
    return 0;
  }
  if (cmd === 'provider') {
    const sub = rest[0];
    if (sub === 'up') {
      const r = await bringUpProvider({ cwd });
      console.log(`[oa] provider up: ${r.action} — ${r.detail}`);
      return r.action === 'foreign-occupant-refused' ? 1 : 0;
    }
    if (sub === 'status') {
      const r = await providerStatus({ cwd });
      console.log(`[oa] provider status: ${r.detail}`);
      return r.running ? 0 : 1;
    }
    if (sub === 'down') {
      const r = providerDown({ cwd });
      console.log(`[oa] provider down: ${r.action} — ${r.detail}`);
      return 0;
    }
    console.error(`[oa] provider: unknown subcommand "${sub}" — usage: oa provider up|status|down`);
    return 1;
  }
  if (cmd === 'install') {
    const r = runInstallDelegate(rest, { cwd });
    if (r.message) console.error(r.message);
    return r.code;
  }
  if (cmd === '--help' || cmd === 'help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  console.error(`[oa] unknown command "${cmd}"\n\n${HELP}`);
  return 1;
}

export { HELP };
