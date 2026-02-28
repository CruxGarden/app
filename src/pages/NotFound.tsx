import { Link } from 'react-router-dom';
import CruxBloom from '@/components/brand/CruxBloom';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
      <div className="relative z-10 text-center">
        <CruxBloom size={64} className="mx-auto mb-6 opacity-30" />
        <h1 className="font-display text-6xl font-bold text-text mb-2">404</h1>
        <p className="text-text-muted mb-8">This path leads nowhere</p>
        <Link to="/">
          <Button variant="secondary">Return to Garden</Button>
        </Link>
      </div>
    </div>
  );
}
