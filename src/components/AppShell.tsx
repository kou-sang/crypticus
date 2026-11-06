// Estructura de la app autenticada: barra superior (desktop) y barra inferior (móvil).
import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { cx } from '../lib/utils';
import { Avatar, PageLoader } from './ui';
import { Logo } from './Logo';
import { prefetchAppRoutes, prefetchPath } from '../routes';

// Historial vive en el perfil (botón de avatar); el navbar no repite accesos.
const NAV_ITEMS = [
  { to: '/inicio', label: 'Inicio', glyph: '◧' },
  { to: '/competencias', label: 'Competir', glyph: '▦' },
  { to: '/amigos', label: 'Amigos', glyph: '◎' },
  { to: '/chat', label: 'Chat', glyph: '❝' },
  { to: '/rankings', label: 'Ranking', glyph: '▲' },
];

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6.6" />
    </svg>
  );
}

export function AppShell() {
  const { profile } = useAuth();
  useEffect(() => prefetchAppRoutes(), []);
  const prefetch = (to: string) => () => prefetchPath(to);

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/inicio" aria-label="Inicio">
            <Logo />
          </Link>
          <nav className="hidden flex-1 gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onPointerEnter={prefetch(item.to)}
                onFocus={prefetch(item.to)}
                className={({ isActive }) =>
                  cx('px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-ink text-paper' : 'hover:bg-paper-2')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {profile && (
              <NavLink
                to={`/u/${profile.uid}`}
                aria-label="Mi perfil"
                title="Mi perfil"
                className={({ isActive }) =>
                  cx('flex items-center gap-2 px-2 py-1 text-sm transition-colors', isActive ? 'bg-paper-2' : 'hover:bg-paper-2')
                }
              >
                <span className="hidden text-right leading-tight sm:block">
                  <span className="block font-semibold">{profile.displayName}</span>
                  <span className="block font-mono text-xs text-muted">{profile.rating} pts</span>
                </span>
                <Avatar name={profile.displayName} />
              </NavLink>
            )}
            <NavLink
              to="/ajustes"
              aria-label="Configuración"
              title="Configuración"
              className={({ isActive }) =>
                cx('inline-flex size-10 items-center justify-center transition-colors', isActive ? 'bg-ink text-paper' : 'hover:bg-paper-2')
              }
            >
              <GearIcon />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 fade-in">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {item.glyph}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
