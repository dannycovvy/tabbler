import { useEffect, useState } from 'react';
import { Switch, Route, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadProfile } from '@/lib/profile';
import NotFound from '@/pages/not-found';
import AuthPage from './pages/auth';
import Lobby from './pages/lobby';
import Play from './pages/play';
import SpadesSetup from './pages/spades-setup';
import Room from './pages/room';
import Profile from './pages/profile';
import InvitePage from './pages/invite';

const queryClient = new QueryClient();

/**
 * RequireAuth wraps a page component.
 * On mount it reads from localStorage (the source of truth) and redirects to
 * /auth if the user hasn't completed the auth flow.
 * Reading directly from loadProfile() avoids prop-drilling and is fine here
 * because this is a gate, not interactive state.
 */
function RequireAuth({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  // Read auth state ONCE on mount via useState initializer.
  // Reading loadProfile() on every render caused a race where a re-render
  // (triggered by any parent state change) would re-read localStorage and
  // could redirect to /auth even when the user is legitimately authenticated.
  const [isAuthenticated] = useState(() => loadProfile().isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/auth');
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  return <Component />;
}

/**
 * RedirectIfAuthed wraps the auth page — if the user is already authenticated,
 * send them straight to the lobby.
 */
function RedirectIfAuthed({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const isAuthenticated = loadProfile().isAuthenticated;

  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated) return null;
  return <Component />;
}

// ── Stable route-wrapper components ────────────────────────────────────────
// IMPORTANT: these must be defined OUTSIDE the Router render function.
// Inline arrow functions as <Route component={...}> values create a new
// function reference on every Router render, causing React to unmount and
// remount the entire route tree — this destroys Socket.IO connections and
// causes the "instant disconnect" bug in production.
const AuthRoute    = () => <RedirectIfAuthed component={AuthPage} />;
const LobbyRoute   = () => <RequireAuth component={Lobby} />;
const PlayRoute    = () => <RequireAuth component={Play} />;
const SpadesRoute  = () => <RequireAuth component={SpadesSetup} />;
const RoomRoute    = () => <RequireAuth component={Room} />;
const ProfileRoute = () => <RequireAuth component={Profile} />;
const InviteRoute  = () => <InvitePage />;

function Router() {
  return (
    <Switch>
      <Route path="/auth"           component={AuthRoute} />
      <Route path="/"               component={LobbyRoute} />
      <Route path="/play"           component={PlayRoute} />
      <Route path="/play/spades"    component={SpadesRoute} />
      <Route path="/room/:code"     component={RoomRoute} />
      <Route path="/profile"        component={ProfileRoute} />
      <Route path="/invite/:code"   component={InviteRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
