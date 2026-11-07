import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { App } from './App';
import { applyDocumentSettings } from './lib/settings';
import { installUiSounds } from './lib/uiSounds';
import { loadSkinFonts } from './themes/fonts';

applyDocumentSettings();
installUiSounds();
loadSkinFonts();

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
