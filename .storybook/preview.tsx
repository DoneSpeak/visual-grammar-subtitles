import * as React from 'react';
import type { Preview } from '@storybook/react-vite';

import '@/assets/tailwind.css';

type Theme = 'light' | 'dark';

function ThemeFrame({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      {children}
    </div>
  );
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: '主题',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', title: '浅色' },
          { value: 'dark', title: '深色' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story, context) => (
      <ThemeFrame theme={(context.globals.theme as Theme) ?? 'light'}>
        <Story />
      </ThemeFrame>
    ),
  ],
};

export default preview;
