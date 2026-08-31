import React from 'react';
import ReactDOM from 'react-dom/client';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const render = (Component: React.ComponentType) => root.render(<React.StrictMode><Component /></React.StrictMode>);

void import('./styles.css').then(() => import('./App')).then(({ default: App }) => render(App));
