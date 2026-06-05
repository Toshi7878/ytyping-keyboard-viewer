import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import style from './index.css?style';

const host = document.createElement('div');
host.id = 'ytyping-keyboard-viewer-root';
document.body.append(host);

const shadowRoot = host.attachShadow({ mode: 'open' });
shadowRoot.append(style);

const app = document.createElement('div');
shadowRoot.append(app);

ReactDOM.createRoot(app).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
