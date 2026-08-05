import React from 'react';
import ReactDOM from 'react-dom/client';
import { IS_MOBILE_UI } from '@/lib/platform';
import reportWebVitals from '@/lib/reportWebVitals.ts';
import App from './App';
import '@/assets/fonts/MiSansVF.ttf';

// 挂在 <html> 而非移动端外壳上，Portal 出去的 toast、弹层才能一起放大命中区域
document.documentElement.classList.toggle('touch-ui', IS_MOBILE_UI);

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// @ts-expect-error
function sendToAnalytics({ id, name, value }) {
  // @ts-expect-error
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
