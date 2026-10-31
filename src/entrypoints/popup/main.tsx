import * as React from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/tailwind.css';
import App from '@/features/popup/App';

const root = document.getElementById('root');
if (!root) throw new Error('popup: #root missing');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
