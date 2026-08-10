import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { AppMotionProvider } from './components/motion/AppMotionProvider';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppMotionProvider>
        <App />
      </AppMotionProvider>
    </ThemeProvider>
  </StrictMode>,
);
