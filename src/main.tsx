import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const render = (Component: React.ComponentType) => root.render(<React.StrictMode><Component /></React.StrictMode>);

if (import.meta.env.DEV && window.location.pathname === '/edge-tool-repro') {
  void import('./EdgeToolRepro').then(({ default: EdgeToolRepro }) => render(EdgeToolRepro));
} else {
  void import('./styles.css').then(() => import('./App')).then(({ default: App }) => render(App));
}
