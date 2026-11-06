// Cargadores de cada sección. Compartidos por `lazy()` y por la precarga, así el chunk se descarga una sola vez.
const loaders = {
  auth: () => import('./features/auth/AuthPage'),
  onboarding: () => import('./features/auth/OnboardingPage'),
  dashboard: () => import('./features/dashboard/DashboardPage'),
  competitions: () => import('./features/competitions/CompetitionsPage'),
  createCompetition: () => import('./features/competitions/CreateCompetitionPage'),
  room: () => import('./features/play/CompetitionRoom'),
  friends: () => import('./features/friends/FriendsPage'),
  chat: () => import('./features/chat/ChatPage'),
  rankings: () => import('./features/rankings/RankingsPage'),
  profile: () => import('./features/profile/ProfilePage'),
  settings: () => import('./features/settings/SettingsPage'),
} as const;

export type RouteKey = keyof typeof loaders;
export { loaders };

const PATH_TO_ROUTE: [prefix: string, key: RouteKey][] = [
  ['/inicio', 'dashboard'],
  ['/competencias/nueva', 'createCompetition'],
  ['/competencias', 'competitions'],
  ['/c/', 'room'],
  ['/amigos', 'friends'],
  ['/chat', 'chat'],
  ['/rankings', 'rankings'],
  ['/u/', 'profile'],
  ['/ajustes', 'settings'],
];

const requested = new Set<RouteKey>();

/** Descarga el chunk de una sección sin renderizarla. Los errores se ignoran: `lazy()` reintentará al navegar. */
export function prefetchRoute(key: RouteKey): void {
  if (requested.has(key)) return;
  requested.add(key);
  loaders[key]().catch(() => requested.delete(key));
}

export function prefetchPath(path: string): void {
  const match = PATH_TO_ROUTE.find(([prefix]) => path.startsWith(prefix));
  if (match) prefetchRoute(match[1]);
}

/** Precarga todas las secciones de la app autenticada cuando el navegador está ocioso. */
export function prefetchAppRoutes(): () => void {
  const run = () => PATH_TO_ROUTE.forEach(([, key]) => prefetchRoute(key));
  // Safari no implementa requestIdleCallback: se usa un retardo fijo.
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(run, 2000);
  return () => globalThis.clearTimeout(id);
}
