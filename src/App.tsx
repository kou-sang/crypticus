// Enrutado con carga diferida por sección: el bundle inicial solo trae la landing.
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { AppShell } from './components/AppShell';
import { GuestOnly, RequireAuth } from './components/RequireAuth';
import { PageLoader } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './features/landing/LandingPage';

const AuthPage = lazy(() => import('./features/auth/AuthPage'));
const OnboardingPage = lazy(() => import('./features/auth/OnboardingPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const CompetitionsPage = lazy(() => import('./features/competitions/CompetitionsPage'));
const CreateCompetitionPage = lazy(() => import('./features/competitions/CreateCompetitionPage'));
const CompetitionRoom = lazy(() => import('./features/play/CompetitionRoom'));
const FriendsPage = lazy(() => import('./features/friends/FriendsPage'));
const ChatPage = lazy(() => import('./features/chat/ChatPage'));
const RankingsPage = lazy(() => import('./features/rankings/RankingsPage'));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage'));

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route element={<GuestOnly />}>
                <Route path="/entrar" element={<AuthPage />} />
              </Route>
              <Route path="/bienvenida" element={<OnboardingPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route path="/inicio" element={<DashboardPage />} />
                  <Route path="/competencias" element={<CompetitionsPage />} />
                  <Route path="/competencias/nueva" element={<CreateCompetitionPage />} />
                  <Route path="/c/:competitionId" element={<CompetitionRoom />} />
                  <Route path="/amigos" element={<FriendsPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/chat/:chatId" element={<ChatPage />} />
                  <Route path="/rankings" element={<RankingsPage />} />
                  <Route path="/u/:uid" element={<ProfilePage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
