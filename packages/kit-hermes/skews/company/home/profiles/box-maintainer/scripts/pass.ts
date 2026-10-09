import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

// The scheduled caller waits below ten seconds. Delivery belongs to the native machine daemon: disconnecting this
// caller leaves its request running under the native door's deadline, including a cold session's startup. A timeout
// is unconfirmed, never a wake receipt; the hourly key makes a retry the same mail.
const started = performance.now();
const startedAt = Date.now();
const installHome = resolve(process.env.HERMES_HOME || resolve(import.meta.dir, "../../.."));
const statusPath = join(installHome, "maintenance", "box-maintainer-pass.json");
const installId = createHash("sha256").update(installHome).digest("hex").slice(0, 20);
type Incident = { key: string; kind: string; text: string; notified: boolean };
type Status = { updated_at_ms: number; incident: Incident | null };
function readStatus(): Status | null {
  try {
    const value = JSON.parse(readFileSync(statusPath, "utf8"));
    return typeof value.updated_at_ms === "number" && (value.incident === null ||
      typeof value.incident?.key === "string" && typeof value.incident?.kind === "string"
      && typeof value.incident?.text === "string" && typeof value.incident?.notified === "boolean") ? value : null;
  } catch { return null; }
}
function saveStatus(incident: Incident | null) {
  if ((readStatus()?.updated_at_ms ?? 0) > startedAt) return;
  mkdirSync(dirname(statusPath), { recursive: true });
  const temporary = `${statusPath}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ updated_at_ms: startedAt, incident }));
  renameSync(temporary, statusPath);
}

const params = {
  locator: { harness: 'agent', session_id: 'box-maintainer' },
  text: 'FLEET PASS. Read each enrolled host\'s native volume capacity without starting a guest, and reclaim immediately where needed. Then inspect resources, hangs and stopped working sessions through native doors. Read your current persona; send no routine report or acknowledgement.',
  from_name: 'box-maintainer-pass', subject: 'hourly fleet pass',
  idempotency_key: `box-maintainer-pass-${new Date().toISOString().slice(0, 13)}`,
};
let service: ReturnType<typeof Bun.spawn> | undefined;
let done = false;
async function finish(ok: boolean, why: string, receipt?: { message_id: string; delivered_to_bus?: boolean; delivery?: { how?: string; handoff_confirmed?: boolean } }) {
  if (done) return;
  done = true;
  clearTimeout(bound);
  // Stop only the CLI this fire started. The daemon owns harness serve and the outstanding delivery, so it survives
  // a caller timeout; this script never launches or kills a private serve process.
  if (service) {
    if (service.exitCode === null) service.kill('SIGTERM');
    await Promise.race([service.exited, Bun.sleep(500)]);
    if (service.exitCode === null) service.kill('SIGKILL');
  }
  const elapsedMs = Math.round(performance.now() - started);
  const filed = receipt?.delivered_to_bus === true && typeof receipt.message_id === 'string'
    && receipt.message_id.startsWith('m-');
  if (filed) console.log(JSON.stringify({ filed: true, handoff_confirmed: ok, message_id: receipt!.message_id,
    delivery: receipt?.delivery?.how, elapsed_ms: elapsedMs,
    ...(ok ? {} : { recovery: 'not confirmed; native mailbox retains the pass' }) }));
  if (!ok) console.error(`fleet pass ${filed ? 'recovery not confirmed' : 'unconfirmed'} (${elapsedMs} ms): ${why}`);
  if (ok) {
    try { saveStatus(null); } catch { /* Native handoff is still confirmed; the helper cache has no authority. */ }
  } else {
    // The hourly scheduler is the observer when its sole maintainer cannot take a pass. One retained native notice
    // per incident, cleared by a later confirmed handoff; it starts no model and adds no restart/watch loop.
    const kind = filed ? typeof receipt?.delivery?.handoff_confirmed === 'boolean'
      ? 'handoff_unconfirmed' : 'receipt_capability_unknown' : 'filing_unconfirmed';
    const prior = readStatus();
    if (!prior || prior.updated_at_ms <= startedAt) {
      const incident: Incident = prior?.incident?.kind === kind ? prior.incident : {
        key: `box-maintainer-pass-incident-${startedAt}-${kind}`,
        kind, text: `Fleet pass ${kind}. Native main handoff is unconfirmed; this is not a confirmed session outage. ${why}`,
        notified: false,
      };
      if (!incident.notified) {
        let kept = false;
        try { saveStatus(incident); kept = true; } catch {
          // With no writable local record there is no durable episode boundary. Use one native key for this install
          // and failure kind across fires, rather than mailing a new notice every hour. A later episode cannot be
          // distinguished while persistence stays unavailable; report that limit instead of inventing a boundary.
          incident.key = `box-maintainer-pass-incident-${installId}-${kind}-state-unavailable`;
          // The native key also requires the same payload. The varying pass id/reason stays in the failed job output.
          incident.text = `Fleet pass ${kind}. Native main handoff is unconfirmed; this is not a confirmed session outage. Incident state cannot be written, so repeated fires share this notice and separate episode boundaries are unknown until persistence returns. The failed job retains its current native delivery reason.`;
          console.error('pass incident state unavailable; native notice key remains stable, episode boundary unknown');
        }
        let notice: ReturnType<typeof Bun.spawn> | undefined;
        let confirmed = false;
        try {
          notice = Bun.spawn([process.env.SUPERCODE_BIN || 'supercode', 'teams', 'rpc',
            'harness.v1.sessions.message', JSON.stringify({ locator: { harness: 'agent', session_id: 'manager' },
              from_name: 'box-maintainer-pass-status', subject: 'fleet pass handoff unconfirmed',
              text: incident.text, idempotency_key: incident.key })], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
          const result = await Promise.race([
            Promise.all([new Response(notice.stdout).text(), new Response(notice.stderr).text(), notice.exited]),
            Bun.sleep(700).then(() => null),
          ]);
          if (result?.[2] === 0) {
            try { const answer = JSON.parse(result[0]); confirmed = answer.delivered_to_bus === true
              && typeof answer.message_id === 'string' && answer.message_id.startsWith('m-'); } catch { /* unknown */ }
          }
        } catch (error) { console.error(`manager notice caller failed: ${String(error)}`); }
        finally {
          if (notice) {
            if (notice.exitCode === null) notice.kill('SIGTERM');
            await Promise.race([notice.exited, Bun.sleep(100)]);
            if (notice.exitCode === null) notice.kill('SIGKILL');
          }
        }
        if (confirmed && kept) { incident.notified = true; try { saveStatus(incident); } catch { /* Retry the same key. */ } }
        console.error(`manager notice ${confirmed ? 'filed' : 'unconfirmed; the native request may still finish'}`);
      }
    }
  }
  process.exit(ok ? 0 : 1);
}
const bound = setTimeout(() => void finish(false,
  'caller budget ended at 8 seconds; native delivery may still finish, retry the same hourly key'), 8000);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => void finish(false, `interrupted by ${signal}; native delivery may still finish`));
void (async () => {
  try {
    service = Bun.spawn([process.env.SUPERCODE_BIN || 'supercode', 'teams', 'rpc',
      'harness.v1.sessions.message', JSON.stringify(params)], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    const [out, err, code] = await Promise.all([
      new Response(service.stdout).text(), new Response(service.stderr).text(), service.exited,
    ]);
    let receipt;
    try { receipt = JSON.parse(out); } catch { /* No native receipt is a failure, including plain error output. */ }
    const filed = code === 0 && receipt?.delivered_to_bus === true && typeof receipt?.message_id === 'string'
      && receipt.message_id.startsWith('m-');
    // The daemon owns this fact; display wording is not a protocol. An older daemon without the field gives an
    // unknown handoff, with its capability named in the failure rather than inferring a successful fire.
    const how = typeof receipt?.delivery?.how === 'string' ? receipt.delivery.how : '';
    const handedOver = receipt?.delivery?.handoff_confirmed === true;
    const reason = receipt?.refusal?.message || (filed
      ? typeof receipt?.delivery?.handoff_confirmed === 'boolean'
        ? how || 'native receipt confirms filing but no handoff'
        : `native receipt omitted delivery.handoff_confirmed; handoff is unknown. ${how}`
      : err.trim().slice(-1000) || 'native mailbox did not confirm filing');
    await finish(filed && handedOver, reason, receipt);
  } catch (error) { await finish(false, String(error)); }
})();
