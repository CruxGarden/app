import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginForm from '@/components/auth/LoginForm';

export default function Login() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    const redirect = sessionStorage.getItem('cruxgarden:publishRedirect');
    if (redirect) {
      sessionStorage.removeItem('cruxgarden:publishRedirect');
      return <Navigate to={redirect} replace />;
    }
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="relative z-10">
        <LoginForm />
      </div>
    </div>
  );
}
