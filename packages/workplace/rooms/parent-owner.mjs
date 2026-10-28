// A selected child reads recovery authority only from its actual retained native IPC parent.
import { randomUUID } from 'node:crypto';
import { canonical, copy, refuse } from './recovery-journal.mjs';

const ACTIONS = new Set(['recovery-status', 'recovery-cut', 'provider-closure', 'recovery-readiness', 'recovery-lineage-offer', 'recovery-lineage-ack']);
export function createParentOwner(binding) {
  if (!binding || !process.send || !process.connected) refuse('the retained native parent channel is absent');
  const pending = new Map();
  const same = other => canonical(other) === canonical(binding);
  process.on('message', frame => {
    if (frame?.type !== 'connection-program-owner-result') return;
    const entry = pending.get(frame.id);
    if (!entry) return;
    pending.delete(frame.id); clearTimeout(entry.timer);
    if (frame.protocol !== 1 || !frame.binding || !same(frame.binding)) return entry.reject(new Error('Project Rooms recovery: native owner response binding differs'));
    if (frame.ok !== true) return entry.reject(new Error(`Project Rooms recovery: native owner refused ${entry.action}: ${String(frame.error ?? 'no result')}`));
    try { entry.resolve(copy(frame.result)); } catch (error) { entry.reject(error); }
  });
  process.once('disconnect', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Project Rooms recovery: native owner channel was lost')); }
    pending.clear();
  });
  return async function request(action, { operation, expectedRevision } = {}) {
    if (!ACTIONS.has(action) || typeof operation !== 'string' || !operation
      || expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) refuse('unsupported native owner request');
    if (!process.connected) refuse('native owner channel is disconnected');
    const id = `rooms-owner-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Project Rooms recovery: native ${action} answer is unknown after 9000ms`)); }, 9000);
      pending.set(id, { action, resolve, reject, timer });
      process.send({ type: 'connection-program-owner-request', id, binding, protocol: 1, action, operation,
        ...(expectedRevision === undefined ? {} : { expectedRevision }) }, error => {
        if (!error) return;
        const entry = pending.get(id);
        if (entry) { pending.delete(id); clearTimeout(timer); reject(error); }
      });
    });
  };
}
