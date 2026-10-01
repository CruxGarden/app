import { type ButtonHTMLAttributes } from 'react';
import Spinner from './Spinner';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-class';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

/** A labelled action. The look lives in buttonClass, so anything can wear it. */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      // React's autofocus runs before a parent modal registers its focus scope.
      // Preserve the intent when a lower dialog temporarily intercepts that focus.
      data-autofocus={props.autoFocus ? '' : undefined}
      className={buttonClass(
        variant,
        size,
        [fullWidth && 'w-full', className].filter(Boolean).join(' '),
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' || size === 'xs' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}
