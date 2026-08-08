import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// One Tailwind step larger than the old sans sizes: Cormorant's x-height is
// low, so at equal px it reads a size smaller.
const sizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
};

export default function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cn('font-wordmark font-semibold text-text', sizes[size], className)}>
      {APP_NAME}
    </span>
  );
}
