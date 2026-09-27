// What a deployment calls itself, set once when the worker loads: the word in the bar and the title of every page, and
// the mark beside the word and in the tab. The mark is an image URL; a tenant passes its own, the default is the acorn.
export const OPEN_AUTONOMY_LOGO = 'https://brand.volter.ai/logo/open-autonomy/svg';
let brand = 'open-autonomy';
let logo = OPEN_AUTONOMY_LOGO;
export function configurePage(config: { brand?: string; logo?: string }): void {
  if (config.brand) brand = config.brand;
  if (config.logo) logo = config.logo;
}
export const pageConfig = (): { brand: string; logo: string } => ({ brand, logo });
