// Escenario de fondo de cada tema (detrás del contenido, sin eventos de puntero).
// Cripta: muro (imagen en /themes/crypt/ con respaldo procedural), antorchas de Gemini con viento y luz viva;
// la escena se desplaza con la navegación y el puntero (ver cryptLight.ts y crypt.css).
// Cyber: suelo de rejilla en perspectiva que gira al cambiar de sección, horizonte y lente de visor VR.
import { useEffect, useRef } from 'react';
import { useSettings } from '../lib/settings';
import { startCryptLight } from './cryptLight';

function Torch({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`torch torch-${side}`} data-torch={side}>
      <span className="torch-light" />
      <img className="torch-sprite" src="/themes/crypt/torch.webp" alt="" draggable={false} decoding="async" />
      <span className="torch-flame" />
      <span className="torch-sparks">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function CryptScene() {
  const { motion } = useSettings();
  const scene = useRef<HTMLDivElement>(null);
  // Se reinicia si cambia la preferencia de movimiento (reducido = luz fija).
  useEffect(() => (scene.current ? startCryptLight(scene.current) : undefined), [motion]);
  return (
    <div aria-hidden className="skin-backdrop">
      <div ref={scene} className="crypt-scene">
        <div className="crypt-wall" />
        <div className="crypt-shade" />
        <Torch side="left" />
        <Torch side="right" />
      </div>
    </div>
  );
}

export function SkinBackdrop() {
  const { skin } = useSettings();
  if (skin === 'crypt') return <CryptScene />;
  if (skin === 'cyber') {
    return (
      <>
        <div aria-hidden className="skin-backdrop cyber-space">
          <div className="cyber-sky" />
          <div className="cyber-floor" />
        </div>
        {/* Lente del visor: por encima del contenido, muy sutil y sin capturar toques. */}
        <div aria-hidden className="cyber-lens">
          <span className="hud-corner hud-tl" />
          <span className="hud-corner hud-tr" />
          <span className="hud-corner hud-bl" />
          <span className="hud-corner hud-br" />
        </div>
      </>
    );
  }
  return null;
}
