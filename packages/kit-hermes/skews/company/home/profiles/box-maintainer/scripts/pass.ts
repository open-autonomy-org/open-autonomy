// The hourly fleet pass, filed through the public mailbox door. Bound delivery below ten seconds;
// a missing receipt fails this fire, without pretending that a stopped main was woken.
const service = Bun.spawn([process.env.SUPERCODE_BIN || 'supercode', 'harness', 'serve'], {
  stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
});
let done = false;
let detail = '';
async function finish(ok: boolean, why: string) {
  if (done) return;
  done = true;
  clearTimeout(bound);
  service.stdin.end();
  service.kill('SIGTERM');
  await Promise.race([service.exited, Bun.sleep(500)]);
  if (service.exitCode === null) service.kill('SIGKILL');
  if (ok) console.log('fleet pass filed to agent box-maintainer');
  else console.error(`fleet pass not confirmed: ${why}`);
  process.exit(ok ? 0 : 1);
}
const bound = setTimeout(() => void finish(false, 'no mailbox receipt within 8 seconds'), 8000);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
  process.on(signal, () => void finish(false, `interrupted by ${signal}`));
service.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'harness.v1.capabilities', params: {} }) + '\n');
service.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'harness.v1.sessions.message', params: {
  locator: { harness: 'agent', session_id: 'box-maintainer' },
  text: 'FLEET PASS. Read each enrolled host\'s native volume capacity without starting a guest, and reclaim immediately where needed. Then inspect resources, hangs and stopped working sessions through native doors. Read your current persona; send no routine report or acknowledgement.',
  from_name: 'box-maintainer-pass', subject: 'hourly fleet pass',
  idempotency_key: `box-maintainer-pass-${new Date().toISOString().slice(0, 13)}`,
} }) + '\n');
void (async () => {
  for await (const chunk of service.stderr) detail = (detail + new TextDecoder().decode(chunk)).slice(-1000);
})();
void (async () => {
  let pending = '';
  const decoder = new TextDecoder();
  for await (const chunk of service.stdout) {
    pending += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      let answer;
      try { answer = JSON.parse(line); } catch { continue; }
      if (answer.id !== 1) continue;
      const receipt = answer.result;
      const ok = receipt?.delivered_to_bus === true && Boolean(receipt.message_id);
      await finish(ok, answer.error?.message || receipt?.refusal?.message || 'mailbox did not confirm filing');
      return;
    }
  }
  await finish(false, detail.trim() || 'service ended without a mailbox receipt');
})();
