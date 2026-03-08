import { useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/ui';
import { APP_NAME } from '@/lib/constants';

function PlusCircleIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="relative z-10 flex flex-col items-center bg-surface-solid border border-border rounded-[var(--radius)] px-12 py-10">
        <h1 className="font-display text-4xl font-medium text-text">{APP_NAME}</h1>

        <p className="text-text-muted text-lg mt-1">where ideas grow</p>

        <div className="mt-6">
          <IconButton
            label="Enter"
            size="lg"
            onClick={() => navigate('/home')}
            className="!w-14 !h-14 bg-surface !text-accent hover:bg-accent-muted"
          >
            <PlusCircleIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
