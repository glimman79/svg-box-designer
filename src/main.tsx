import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const render = (Component: React.ComponentType) => root.render(<React.StrictMode><Component /></React.StrictMode>);

if (import.meta.env.DEV && window.location.pathname === '/edge-svg-bisect') {
  void import('./EdgeSvgBisect').then(({ default: EdgeSvgBisect }) => render(EdgeSvgBisect));
} else if (import.meta.env.DEV && window.location.pathname === '/edge-canvas-repro') {
  void import('./EdgeCanvasRepro').then(({ default: EdgeCanvasRepro }) => render(EdgeCanvasRepro));
} else if (import.meta.env.DEV && window.location.pathname === '/edge-tool-repro') {
  void import('./EdgeToolRepro').then(({ default: EdgeToolRepro }) => render(EdgeToolRepro));
} else {
  void import('./styles.css').then(() => import('./App')).then(({ default: App }) => render(App));
}
