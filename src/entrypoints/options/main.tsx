import * as React from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/tailwind.css';
import App from '@/features/options/App';
import { initI18n } from '@/shared/i18n';

const root = document.getElementById('root');
if (!root) throw new Error('options: #root missing');

void initI18n().then(() => {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
