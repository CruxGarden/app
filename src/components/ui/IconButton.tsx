import { useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
  /** Override accent color when active (hex string) */
  activeColor?: string;
}

const sizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
};

export default function IconButton({
  label,
  size = 'md',
  active,
  activeColor,
  className,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: IconButtonProps) {
  const [hovered, setHovered] = useState(false);

  const useCustomColor = !!activeColor;
  const showColor = useCustomColor && (active || hovered);

  const colorStyle = showColor
    ? { color: activeColor, backgroundColor: `${activeColor}${active ? '18' : '10'}`, ...style }
    : style;

  return (
    <button
      aria-label={label}
      style={colorStyle}
      onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e); }}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-sm)]',
        'transition-colors duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active && !useCustomColor && 'text-accent bg-accent-muted',
        !active && !useCustomColor && 'text-text-muted hover:text-text hover:bg-accent-muted',
        !showColor && useCustomColor && 'text-accent',
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
