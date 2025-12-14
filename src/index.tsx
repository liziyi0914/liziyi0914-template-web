import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initIcons } from '@/lib/icons.ts';
import reportWebVitals from '@/reportWebVitals.ts';

// @ts-ignore
import '@/assets/fonts/MiSansVF.ttf';

initIcons();

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// @ts-ignore
function sendToAnalytics({ id, name, value }) {
  // @ts-ignore
  ga('send', 'event', {
    eventCategory: 'Web Vitals',
    eventAction: name,
    eventValue: Math.round(name === 'CLS' ? value * 1000 : value), // values must be integers
    eventLabel: id, // id unique to current page load
    nonInteraction: true, // avoids affecting bounce rate
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(import.meta.env.DEV ? console.log : sendToAnalytics);

import { unstableSetRender } from 'antd-mobile'; // Support since version ^5.40.0
import { createRoot } from 'react-dom/client';

unstableSetRender((node, container) => {
  // @ts-ignore
  container._reactRoot ||= createRoot(container);
  // @ts-ignore
  const root = container._reactRoot;
  root.render(node);
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.unmount();
  };
});
