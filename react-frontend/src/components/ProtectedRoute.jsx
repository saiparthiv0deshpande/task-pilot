import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute() {
  const { accessToken, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="full-screen-state">Loading your workspace…</div>;
  return accessToken ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
