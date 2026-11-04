// Estructura de la app autenticada: barra superior (desktop) y barra inferior (móvil).
import { Suspense } from 'react';
import { NavLink, Outlet, Link } from 'react-router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { cx } from '../lib/utils';
import { Avatar, PageLoader } from './ui';
import { Logo } from './Logo';

const NAV_ITEMS = [
  { to: '/inicio', label: 'Inicio', glyph: '◧' },
  { to: '/competencias', label: 'Competir', glyph: '▦' },
  { to: '/amigos', label: 'Amigos', glyph: '◎' },
  { to: '/chat', label: 'Chat', glyph: '❝' },
  { to: '/rankings', label: 'Ranking', glyph: '▲' },
];

export function AppShell() {
  const { profile } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('[auth] signOut', error);
    }
  };

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
                className={({ isActive }) =>
                  cx('px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-ink text-paper' : 'hover:bg-paper-2')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {profile && (
              <Link to={`/u/${profile.uid}`} className="flex items-center gap-2 text-sm">
                <span className="hidden text-right leading-tight sm:block">
                  <span className="block font-semibold">{profile.displayName}</span>
                  <span className="block font-mono text-xs text-muted">{profile.rating} pts</span>
                </span>
                <Avatar name={profile.displayName} />
              </Link>
            )}
            <button onClick={handleSignOut} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
              Salir
            </button>
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
