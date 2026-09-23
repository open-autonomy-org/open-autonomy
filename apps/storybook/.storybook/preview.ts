import type { Preview } from '@storybook/html-vite';

// The font only; each story carries the page stylesheet in its own render, so a hot reload of the theme is seen at once.
if (!document.getElementById('oa-font')) { const link = document.createElement('link'); link.id = 'oa-font'; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Michroma&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap'; document.head.appendChild(link); }
const preview: Preview = { parameters: { layout: 'fullscreen', backgrounds: { disable: true } } };
export default preview;
