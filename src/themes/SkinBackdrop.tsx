// Escenario de fondo de cada tema (detrás del contenido, sin eventos de puntero).
// Medieval: muro de cripta (imagen en /themes/medieval/ con respaldo procedural) y antorchas que titilan.
// Cyber: suelo de rejilla en perspectiva que gira al cambiar de sección, horizonte y lente de visor VR.
import { useSettings } from '../lib/settings';

function Torch({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`torch torch-${side}`}>
      <span className="torch-glow" />
      <span className="torch-flame" />
      <span className="torch-sconce" />
    </div>
  );
}

export function SkinBackdrop() {
  const { skin } = useSettings();
  if (skin === 'medieval') {
    return (
      <div aria-hidden className="skin-backdrop">
        <div className="medieval-wall" />
        <div className="medieval-shade" />
        <Torch side="left" />
        <Torch side="right" />
      </div>
    );
  }
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
