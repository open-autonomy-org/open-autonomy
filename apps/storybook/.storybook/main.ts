import type { StorybookConfig } from '@storybook/html-vite';
import { resolve } from 'node:path';

// Pages are server-rendered hono/jsx; a story renders one to an HTML string from fixtures.
const config: StorybookConfig = {
  framework: '@storybook/html-vite',
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  viteFinal: async (cfg) => ({
    ...cfg,
    esbuild: { ...(cfg.esbuild ?? {}), jsx: 'automatic', jsxImportSource: 'hono/jsx' },
    resolve: { ...(cfg.resolve ?? {}), alias: { ...((cfg.resolve as { alias?: Record<string, string> })?.alias ?? {}), '@open-autonomy/sdk': resolve(process.cwd(), '../../packages/sdk/src') } },
    server: { ...(cfg.server ?? {}), fs: { allow: [resolve(process.cwd(), '../..')] } },
  }),
};
export default config;
