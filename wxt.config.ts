import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      // Stamped once per build; the overlay renders it so a stale content script is visible.
      __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
    },
  }),
  manifest: {
    name: 'JP Subtitle Overlay',
    description: '在任意网页视频上叠加本地字幕，支持日语词性着色与显示时长控制',
    minimum_chrome_version: '120',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '字幕扩展',
    },
  },
});
