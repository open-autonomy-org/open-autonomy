import type { Preview } from '@storybook/html-vite';

// The font only; each story carries the page stylesheet in its own render, so a hot reload of the theme is seen at once.
if (!document.getElementById('oa-font')) { const link = document.createElement('link'); link.id = 'oa-font'; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'; document.head.appendChild(link); }
const preview: Preview = { parameters: { layout: 'fullscreen', backgrounds: { disable: true } } };
export default preview;
