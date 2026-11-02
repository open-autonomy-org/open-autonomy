// Source-bound publication reader inputs. This inventory is not behavioral qualification or permission to issue aliases.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PublicationInputs {
  protocol: 'oa-publication-inputs.v1'; reporterFormat: 4; aliasFormat: 1;
  files: Array<{ path: string; sha256: string }>;
  owner: { path: string; sha256: string };
  native: { path: string; sha256: string };
}
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export function publicationInputs(directory: string, native: string | null): PublicationInputs | null {
  // A predecessor without the actual alias reader is not upgraded by an npm version or a declaration.
  if (!existsSync(resolve(directory,'session-continuity.ts'))) return null;
  if (!native) throw new Error('Alias-capable kit needs its exact native selection receipt');
  const files = ['publication.ts','publisher.ts','reporting.ts','session-continuity.ts','transcript-queue.ts',
    'native-runtime.ts','native-continuity.ts','owner-control.ts','publication-inputs.ts','prepare-install.ts','install-runtime.ts',
    'machine-supercode.ts','source-program.ts','sdk/client.ts','sdk/redaction.ts'].map(path => ({path,sha256:hash(readFileSync(resolve(directory,path)))}));
  const owner = realpathSync(resolve(directory,'node_modules/create-open-autonomy/keeper/install-owner.ts'));
  const path = realpathSync(native);
  return {protocol:'oa-publication-inputs.v1',reporterFormat:4,aliasFormat:1,files,owner:{path:owner,sha256:hash(readFileSync(owner))},native:{path,sha256:hash(readFileSync(path))}};
}
export function samePublicationInputs(a: PublicationInputs | null | undefined,b: PublicationInputs | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
