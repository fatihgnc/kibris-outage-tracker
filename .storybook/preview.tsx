import type { Preview } from '@storybook/nextjs-vite';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },

    // The site is always on --color-night; there is no light theme to switch to.
    backgrounds: { default: 'night', values: [{ name: 'night', value: '#0b1220' }] },

    // Most components read next/navigation (usePathname, useRouter); this
    // opts every story into the App Router mocks by default.
    nextjs: { appDirectory: true },

    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--color-night)', color: 'var(--color-text)', minHeight: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
