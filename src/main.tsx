import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProvider } from './app/context';
import { App } from './App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { PinProvider } from './ui/pin';
import { TeamProvider } from './app/team';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <PinProvider>
          <TeamProvider>
            <App />
          </TeamProvider>
        </PinProvider>
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);
