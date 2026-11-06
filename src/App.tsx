// Enrutado con carga diferida por sección: el bundle inicial solo trae la landing.
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { AppShell } from './components/AppShell';
import { GuestOnly, OwnProfileRedirect, RequireAuth } from './components/RequireAuth';
import { PageLoader } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './features/landing/LandingPage';
import { loaders } from './routes';

const AuthPage = lazy(loaders.auth);
const OnboardingPage = lazy(loaders.onboarding);
const DashboardPage = lazy(loaders.dashboard);
const CompetitionsPage = lazy(loaders.competitions);
const CreateCompetitionPage = lazy(loaders.createCompetition);
const CompetitionRoom = lazy(loaders.room);
const FriendsPage = lazy(loaders.friends);
const RankingsPage = lazy(loaders.rankings);
const ProfilePage = lazy(loaders.profile);
const SettingsPage = lazy(loaders.settings);

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
                  <Route path="/jugar" element={<CompetitionsPage />} />
                  <Route path="/jugar/nueva" element={<CreateCompetitionPage />} />
                  <Route path="/competencias/*" element={<Navigate to="/jugar" replace />} />
                  <Route path="/c/:competitionId" element={<CompetitionRoom />} />
                  <Route path="/amigos" element={<FriendsPage />} />
                  <Route path="/chat/*" element={<Navigate to="/amigos" replace />} />
                  <Route path="/rankings" element={<RankingsPage />} />
                  <Route path="/u/:uid" element={<ProfilePage />} />
                  <Route path="/historial" element={<OwnProfileRedirect />} />
                  <Route path="/ajustes" element={<SettingsPage />} />
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
