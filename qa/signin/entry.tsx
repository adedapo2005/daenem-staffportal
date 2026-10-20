import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from '../../src/auth';
import '../../src/signin-experience.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthScreen onAuthenticated={() => undefined} />
  </React.StrictMode>,
);
