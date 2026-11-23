import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { App } from './App.tsx';
import { ApiError } from './api.ts';
import { i18n, initializeI18n } from './i18n.ts';
import 'virtual:fabcore-style';
import './fleet.css';
import './app.css';

await initializeI18n();
const client = new QueryClient({ defaultOptions: { queries: {
  retry: (attempt, error) => attempt < 1 && !(error instanceof ApiError && [401, 403].includes(error.status)),
  refetchOnWindowFocus: true,
}, mutations: { retry: false } } });
const container = document.getElementById('root');
if (!container) throw new Error('FabCore root missing');
const root = createRoot(container);
root.render(<QueryClientProvider client={client}><I18nextProvider i18n={i18n}><App /></I18nextProvider></QueryClientProvider>);
addEventListener('pagehide', () => { root.unmount(); client.clear(); });
addEventListener('pageshow', event => { if ((event as PageTransitionEvent).persisted) location.reload(); });
