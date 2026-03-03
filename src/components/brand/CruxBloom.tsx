import { APP_NAME } from '@/lib/constants';

export interface CruxBloomProps {
  size?: number;
  className?: string;
}

export default function CruxBloom({ size = 48, className }: CruxBloomProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label={APP_NAME}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}
