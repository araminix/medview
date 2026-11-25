import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

// Browsers fetch each font subset lazily, the first time a matching character is drawn.
// Loading them all up front keeps the promise that nothing is requested once the page has loaded.
document.fonts.forEach((face) => void face.load().catch(() => undefined));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
