// What a deployment calls itself, set once when the worker loads: the word in the bar and the title of every page.
let brand = 'open-autonomy';
export function configurePage(config: { brand?: string }): void { if (config.brand) brand = config.brand; }
export const pageConfig = (): { brand: string } => ({ brand });
