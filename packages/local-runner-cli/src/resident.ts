import { configuredActivationHome } from './activation-paths.ts';
import { start } from './reconciler.ts';

export interface ResidentOptions {
  cwd: string;
  signal: AbortSignal;
  onReady?: () => void;
}

/** The one resident execution path used by both foreground and managed starts. */
export async function runResident(opts: ResidentOptions): Promise<void> {
  let ready = false;
  const onReady = () => {
    if (ready) return;
    ready = true;
    opts.onReady?.();
  };

  if (configuredActivationHome(opts.cwd)) {
    const { superviseActivation } = await import('./activation-supervisor.ts');
    await superviseActivation({ cwd: opts.cwd, signal: opts.signal, onActive: onReady });
    return;
  }
  await start({ cwd: opts.cwd, signal: opts.signal, onHeartbeat: onReady });
}
