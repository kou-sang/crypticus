// Botón «Volver»: regresa a la pantalla anterior de la app o, si se entró por un enlace directo, a `fallback`.
import { useNavigate } from 'react-router';
import { cx } from '../lib/utils';

interface BackLinkProps {
  /** Destino fijo. Si se indica, ignora el historial (útil cuando la pantalla previa ya no tiene sentido). */
  to?: string;
  fallback?: string;
  label?: string;
  className?: string;
}

function hasAppHistory(): boolean {
  // React Router guarda en history.state un índice de navegación; 0 significa que esta es la primera pantalla.
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

export function BackLink({ to, fallback = '/inicio', label = 'Volver', className }: BackLinkProps) {
  const navigate = useNavigate();
  const goBack = () => {
    if (to) navigate(to);
    else if (hasAppHistory()) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return (
    <button
      type="button"
      onClick={goBack}
      className={cx(
        'mb-4 inline-flex h-9 items-center gap-1.5 pr-3 text-sm font-semibold text-muted transition-colors hover:text-ink',
        className,
      )}
    >
      <span aria-hidden className="text-lg leading-none">
        ←
      </span>
      {label}
    </button>
  );
}
