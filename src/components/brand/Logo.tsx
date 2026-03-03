import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

export default function Logo({ size = 'md', className }: LogoProps) {
  return (
    <span className={cn('font-display font-medium text-text', sizes[size], className)}>
      {APP_NAME}
    </span>
  );
}
