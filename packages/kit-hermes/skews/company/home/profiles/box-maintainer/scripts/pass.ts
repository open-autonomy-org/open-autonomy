// The scheduled caller waits below ten seconds. Delivery belongs to the native machine daemon: disconnecting this
// caller leaves its request running under the native door's deadline, including a cold session's startup. A timeout
// is unconfirmed, never a wake receipt; the hourly key makes a retry the same mail.
const started = performance.now();
const params = {
  locator: { harness: 'agent', session_id: 'box-maintainer' },
  text: 'FLEET PASS. Read each enrolled host\'s native volume capacity without starting a guest, and reclaim immediately where needed. Then inspect resources, hangs and stopped working sessions through native doors. Read your current persona; send no routine report or acknowledgement.',
  from_name: 'box-maintainer-pass', subject: 'hourly fleet pass',
  idempotency_key: `box-maintainer-pass-${new Date().toISOString().slice(0, 13)}`,
};
const service = Bun.spawn([process.env.SUPERCODE_BIN || 'supercode', 'teams', 'rpc',
  'harness.v1.sessions.message', JSON.stringify(params)], {
  stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
});
let done = false;
async function finish(ok: boolean, why: string, receipt?: { message_id: string; delivery?: { how?: string } }) {
  if (done) return;
  done = true;
  clearTimeout(bound);
  // Stop only the CLI this fire started. The daemon owns harness serve and the outstanding delivery, so it survives
  // a caller timeout; this script never launches or kills a private serve process.
  if (service.exitCode === null) service.kill('SIGTERM');
  await Promise.race([service.exited, Bun.sleep(500)]);
  if (service.exitCode === null) service.kill('SIGKILL');
  const elapsedMs = Math.round(performance.now() - started);
  if (ok) console.log(JSON.stringify({ filed: true, message_id: receipt!.message_id,
    delivery: receipt?.delivery?.how, elapsed_ms: elapsedMs }));
  else console.error(`fleet pass unconfirmed (${elapsedMs} ms): ${why}`);
  process.exit(ok ? 0 : 1);
}
const bound = setTimeout(() => void finish(false,
  'caller budget ended at 8 seconds; native delivery may still finish, retry the same hourly key'), 8000);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => void finish(false, `interrupted by ${signal}; native delivery may still finish`));
void (async () => {
  try {
    const [out, err, code] = await Promise.all([
      new Response(service.stdout).text(), new Response(service.stderr).text(), service.exited,
    ]);
    let receipt;
    try { receipt = JSON.parse(out); } catch { /* No native receipt is a failure, including plain error output. */ }
    const ok = code === 0 && receipt?.delivered_to_bus === true && typeof receipt?.message_id === 'string'
      && receipt.message_id.startsWith('m-');
    await finish(ok, receipt?.refusal?.message || err.trim().slice(-1000) || 'native mailbox did not confirm filing', receipt);
  } catch (error) { await finish(false, String(error)); }
})();
