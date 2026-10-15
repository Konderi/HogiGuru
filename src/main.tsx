import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, isAdminRole, useAuth } from './auth';
import Layout from './Layout';
import { Spinner } from './ui';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Gurukierros from './pages/Gurukierros';
import Standings from './pages/Standings';
import Stats from './pages/Stats';
import Privacy from './pages/Privacy';
import HallOfFame from './pages/HallOfFame';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import MyTeam from './pages/MyTeam';
import DraftBoard from './pages/DraftBoard';
import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/Dashboard';
import AdminUsers from './admin/Users';
import AdminGurus from './admin/Gurus';
import AdminScoring from './admin/Scoring';
import AdminSwaps from './admin/Swaps';
import AdminDraft from './admin/Draft';
import AdminCoaches from './admin/Coaches';
import AdminHof from './admin/HallOfFame';
import AdminRegistrations from './admin/Registrations';
import Register from './pages/Register';
import Results from './pages/Results';
import AdminResults from './admin/Results';
import AdminMaintenance from './admin/Maintenance';
import './index.css';

function Protected({ admin, children }: { admin?: boolean; children: React.ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Spinner />;
  if (!me.user) return <Navigate to="/kirjaudu" replace />;
  if (admin && !isAdminRole(me.user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="gurukierros" element={<Gurukierros />} />
            <Route path="sarjataulukko" element={<Standings />} />
            <Route path="tilastot" element={<Stats />} />
            <Route path="tietosuoja" element={<Privacy />} />
            <Route path="hall-of-fame" element={<HallOfFame />} />
            <Route path="kokonaistulokset" element={<Results />} />
            <Route path="kirjaudu" element={<Login />} />
            <Route path="unohtunut" element={<ForgotPassword />} />
            <Route path="salasana" element={<ResetPassword />} />
            <Route path="ilmoittaudu" element={<Register />} />
            <Route path="oma-joukkue" element={<Protected><MyTeam /></Protected>} />
            <Route path="draft" element={<Protected><DraftBoard /></Protected>} />
            <Route path="admin" element={<Protected admin><AdminLayout /></Protected>}>
              <Route index element={<AdminDashboard />} />
              <Route path="kayttajat" element={<AdminUsers />} />
              <Route path="gurut" element={<AdminGurus />} />
              <Route path="pisteytys" element={<AdminScoring />} />
              <Route path="vaihdot" element={<AdminSwaps />} />
              <Route path="draft" element={<AdminDraft />} />
              <Route path="valmentajat" element={<AdminCoaches />} />
              <Route path="hall-of-fame" element={<AdminHof />} />
              <Route path="ilmoittautuminen" element={<AdminRegistrations />} />
              <Route path="tulokset" element={<AdminResults />} />
              <Route path="yllapito" element={<AdminMaintenance />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
