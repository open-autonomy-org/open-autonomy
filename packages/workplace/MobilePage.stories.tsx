import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileApp } from '@runhuman/workplace/mobile/MobileApp';
import { webPlatform } from '@runhuman/workplace/mobile/MobileWebApp';
const meta = { title: 'Contributions/Books/Phone page', component: MobileApp, args: { platform: webPlatform }, parameters: { docs: { description: { component: 'The production phone page, through its signed-in console and installed app door.' } } } } satisfies Meta<typeof MobileApp>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Page: Story = { render: () => <MobileApp platform={webPlatform} initialPath="/console/books" /> };
