import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SignupForm } from '../components/auth/SignupForm';

export function Signup() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return <SignupForm />;
}
