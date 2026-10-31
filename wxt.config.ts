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
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en_GB',
    minimum_chrome_version: '120',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
    // The word card lives in the page's Shadow DOM, so its <img> needs public URLs.
    web_accessible_resources: [{ resources: ['vocab/openmoji/*.svg'], matches: ['<all_urls>'] }],
    action: {
      default_title: '__MSG_extActionTitle__',
    },
  },
});
