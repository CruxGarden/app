import { useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  /** Override accent color when active (hex string) */
  activeColor?: string;
  /** Tooltip text + optional shortcut, shown on hover */
  tooltip?: { label: string; shortcut?: string };
}

const sizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '\u2318' : 'Ctrl+';

export default function IconButton({
  label,
  size = 'md',
  active,
  activeColor,
  tooltip,
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
    ? {
        color: activeColor,
        backgroundColor: `color-mix(in srgb, ${activeColor} ${active ? '15%' : '10%'}, transparent)`,
        ...style,
      }
    : style;

  return (
    <div className="relative group/btn">
      <button
        aria-label={label}
        style={colorStyle}
        onMouseEnter={(e) => {
          setHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setHovered(false);
          onMouseLeave?.(e);
        }}
        className={cn(
          'inline-flex items-center justify-center rounded-[var(--radius-sm)]',
          'transition-colors duration-150 cursor-pointer',
          'disabled:cursor-not-allowed',
          active && !useCustomColor && 'text-icon-button-icon-hover bg-icon-button-hover',
          !active &&
            !useCustomColor &&
            'text-icon-button-icon hover:text-icon-button-icon-hover hover:bg-icon-button-hover',
          !showColor && useCustomColor && 'text-icon-button-icon',
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
      {tooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 pointer-events-none hidden group-hover/btn:block">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-tooltip bg-tooltip border border-tooltip-border shadow-tooltip whitespace-nowrap">
            <span className="text-xs font-medium text-tooltip-text">{tooltip.label}</span>
            {tooltip.shortcut && (
              <kbd className="text-xxs font-mono text-tooltip-text px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-bg border border-tooltip-border min-w-[1.5rem] text-center">
                {modKey}
                {tooltip.shortcut}
              </kbd>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
