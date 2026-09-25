// `.open-autonomy/agent.ts` imports the orchestrator's applier by its light entry points, `./apply` and `./apply/doors`,
// which the package (0.3.13) ships as plain .mjs; its root export re-exports the same functions, renamed, with their
// types (index.mjs, index.d.ts). These are those declarations under the entry points' own names, mapped as index.mjs maps
// them. Remove this file when the package declares the entry points itself.
declare module '@volter-ai-dev/supercode-orchestrator/apply' {
  export { planSetup as plan, applySetup as apply, adoptSetup as adopt, resolveSetup as resolve, provisionHome as provision, validateSetup as validate, resolveParameters, hermesConfig, SETUP_SCHEMA_VERSION as SCHEMA_VERSION } from '@volter-ai-dev/supercode-orchestrator';
}

declare module '@volter-ai-dev/supercode-orchestrator/apply/doors' {
  export { hermesDoor, orchestratorDoor, locateHermes, localRunner, containerRunner } from '@volter-ai-dev/supercode-orchestrator';
}
