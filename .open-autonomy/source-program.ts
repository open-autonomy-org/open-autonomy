// Read the machine graph's selected program honestly: a Node source file is never a native build.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);

// Source graph integers use the source owner's lossless codec. Preparation has no dependency on this kit's
// as-yet-uninstalled runtime packages. Legacy declarations remain readable for separately permitted adoption.
export function sourceJson(root: string, binding?: string): { parse: (text: string) => any; equal: (a: any, b: any) => boolean; stringify: (value: any) => string } {
  const path = join(root, 'sdk/interchange/native-json.mjs');
  if (existsSync(path)) {
    const codec = require(path);
    return { parse: codec.parseNativeJson, equal: codec.nativeJsonEqual, stringify: codec.stringifyNativeJson };
  }
  if (binding === 'node') throw new Error('the Node source selection has no lossless source graph codec');
  return { parse: JSON.parse, equal: (a, b) => JSON.stringify(a) === JSON.stringify(b), stringify: JSON.stringify };
}
export function sourceProgram(lock: any): { program: string; node: string | null; binding: string } {
  const graph = lock?.graph, consumer = graph?.consumers?.[graph.default];
  const id = consumer?.entry?.instance, instance = graph?.instances?.[id];
  if (!instance?.root) throw new Error('source selection has no complete default entry');
  if (lock.binding === 'node') {
    const program = realpathSync(join(instance.root, 'packaging/npm/bin/supercode.js'));
    const output = (consumer.outputs ?? []).map((key: string) => graph.receipts?.[key]).find((row: any) => row?.instance === id && row.path === 'packaging/npm/bin/supercode.js' && row.kind === 'file');
    if (consumer.entry.bin !== 'supercode' || !output || output.sha256 !== createHash('sha256').update(readFileSync(program)).digest('hex') || typeof consumer.runtime?.path !== 'string')
      throw new Error('source selection has no exact Node entry and runtime receipt');
    return { binding: 'node', program, node: realpathSync(consumer.runtime.path) };
  }
  const output = graph.receipts?.[instance.native?.build];
  if (!output?.path) throw new Error('legacy source selection has no native build receipt');
  return { binding: 'native', program: realpathSync(resolve(instance.root, output.path)), node: consumer?.runtime?.path ? realpathSync(consumer.runtime.path) : null };
}
export function sourceReceiptProgram(path: string): ReturnType<typeof sourceProgram> {
  const text = readFileSync(path, 'utf8'), observed = JSON.parse(text);
  const receipt = sourceJson(observed.lock.root, observed.lock.binding).parse(text), selected = sourceProgram(receipt.lock);
  if (receipt.program !== undefined && (receipt.program !== selected.program || receipt.node !== selected.node || receipt.binding !== selected.binding))
    throw new Error('source candidate program or runtime differs from its complete graph');
  if (receipt.native && realpathSync(receipt.native) !== selected.program) throw new Error('legacy source candidate names another program');
  return selected;
}
export function publishedProgram(receipt: any): string | null {
  const value = receipt?.version === 4 && receipt.program_kind === 'node' && receipt.native === receipt.program
    ? receipt.program : receipt?.version === 3 ? receipt.native : null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
