import * as React from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/tailwind.css';
import App from '@/features/options/App';

const root = document.getElementById('root');
if (!root) throw new Error('options: #root missing');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
