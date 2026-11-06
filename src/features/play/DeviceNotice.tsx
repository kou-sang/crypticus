// Aviso cuando la sala mezcla jugadores en móvil y en PC (teclear en táctil suele ser más lento).
import type { Participant } from '../../../shared/types';

export function DeviceNotice({ participants }: { participants: Participant[] }) {
  const mobile = participants.filter((p) => p.device === 'mobile');
  const desktop = participants.filter((p) => p.device === 'desktop');
  if (mobile.length === 0 || desktop.length === 0) return null;

  const names = (list: Participant[]) => list.map((p) => p.displayName).join(', ');
  return (
    <p role="note" className="flex items-start gap-2 border border-line bg-paper-2/60 px-3 py-2 text-sm">
      <span aria-hidden>📱💻</span>
      <span>
        <strong>Partida mixta.</strong> En móvil: {names(mobile)}. En PC: {names(desktop)}. Escribir en pantalla táctil suele ser más
        lento; tenlo en cuenta al elegir reglas de velocidad.
      </span>
    </p>
  );
}
