import {
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from 'react';
import { cn } from '@/lib/cn';
import { fieldClass } from './field-class';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  size?: never;
  fieldSize?: 'sm' | 'md';
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, fieldSize = 'md', ...props }, ref) => {
    const errorId = useId();
    return (
      <div className="flex flex-col gap-1.5">
        <input
          ref={ref}
          className={fieldClass(error, className, fieldSize)}
          {...props}
          data-autofocus={props.autoFocus ? '' : undefined}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], error && errorId].filter(Boolean).join(' ') || undefined
          }
        />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
export default Input;

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  fieldSize?: 'sm' | 'md';
}

/** A multi-line field in the Input style; height comes from `rows` or a className. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, fieldSize = 'md', ...props }, ref) => {
    const errorId = useId();
    return (
      <div className="flex flex-col gap-1.5">
        <textarea
          ref={ref}
          className={cn(fieldClass(error, className, fieldSize), 'h-auto py-2 resize-y')}
          {...props}
          data-autofocus={props.autoFocus ? '' : undefined}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], error && errorId].filter(Boolean).join(' ') || undefined
          }
        />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  fieldSize?: 'sm' | 'md';
}

/** A native select in the Input style. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className, fieldSize = 'md', children, ...props }, ref) => (
    <select ref={ref} className={fieldClass(error, className, fieldSize)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
