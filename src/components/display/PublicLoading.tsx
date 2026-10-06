import { Link } from 'react-router-dom';
import PublicTopBar from './PublicTopBar';
import { LoadingPanel, buttonClass } from '@/components/ui';

/** Keep a useful public shell visible during requests, including slow connections. */
export default function PublicLoading({
  label,
  username = '',
}: {
  label: string;
  username?: string;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <PublicTopBar username={username} />
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <div role="status" aria-live="polite">
          <LoadingPanel label={label} />
        </div>
        <Link to="/explore" className={buttonClass('ghost', 'sm')}>
          Browse Explore
        </Link>
      </main>
    </div>
  );
}
