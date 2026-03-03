import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import CruxBloom from '@/components/brand/CruxBloom';
import { Button } from '@/components/ui';
import { APP_NAME } from '@/lib/constants';

export default function Landing() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="relative z-10 flex flex-col items-center bg-surface-solid border border-border rounded-[var(--radius)] px-12 py-10">
        <CruxBloom size={64} className="text-accent mb-6" />

        <h1 className="font-display text-4xl font-medium text-text">{APP_NAME}</h1>

        <p className="text-text-muted text-lg mt-1">where ideas grow</p>

        <Link to={isAuthenticated ? '/home' : '/login'} className="mt-6">
          <Button size="sm">Enter</Button>
        </Link>
      </div>
    </div>
  );
}
