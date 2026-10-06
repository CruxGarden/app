import { cn } from '@/lib/cn';

/**
 * The app's controls, written down once (Daniel, 2026-09-27: "buttons should
 * be consistent, we have too many button styles"). Every clickable thing is
 * one of these, and each answers the pointer the same way — a hover fill, a
 * press, a focus ring — through the Mood's own tokens:
 *
 *   buttonClass   a labelled action: primary · secondary · ghost · danger
 *   IconButton    an icon-only action (its own component)
 *   linkClass     a link inside a sentence
 *   segment*      one choice among a few (views, sorts, tabs)
 *   chipClass     a tag or a filter you can toggle
 *   menuItemClass a row in a menu
 *   rowClass      a row in a list you pick from (switchers, results, pickers)
 *
 * They are class helpers rather than components so a <Link>, a <label> or a
 * role="tab" can wear them without changing what it is.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // A soft top light and a hairline shadow give the fill some body in every Mood.
  primary:
    'bg-primary-button text-primary-button-text border border-primary-button-border hover:bg-primary-button-hover hover:border-primary-button-border-hover react-accent [background-image:var(--button-fill-overlay)] [box-shadow:var(--elevation-primary-button)]',
  secondary:
    'bg-action-button text-action-button-text border border-action-button-border hover:bg-action-button-hover hover:text-action-button-text-hover hover:border-action-button-border-hover',
  // The quiet action: only words until the pointer arrives, then the same fill as the others.
  ghost:
    'bg-transparent text-action-button-text border border-transparent hover:bg-action-button-hover hover:text-action-button-text-hover',
  danger:
    'bg-danger-button text-danger-button-text border border-danger-button-border hover:bg-danger-button-hover',
};

// A minimum height, not a fixed one: in a cramped pane or at a large text size
// a label wraps and the button grows rather than pushing its row sideways.
const SIZES: Record<ButtonSize, string> = {
  xs: 'min-h-7 px-2.5 py-1 text-xs gap-1.5',
  sm: 'min-h-8 px-3 py-1 text-sm gap-1.5',
  md: 'min-h-10 px-4 py-1.5 text-sm gap-2',
  lg: 'min-h-12 px-6 py-2 text-base gap-2.5',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'sm',
  className?: string | false | null,
) {
  return cn(
    'inline-flex items-center justify-center text-center leading-tight select-none',
    'font-body font-medium rounded-button cursor-pointer',
    'transition-[color,background-color,border-color,box-shadow,transform] motion-press active-dim',
    // Recolours through the button-disabled tokens; opts out of the global
    // `button:disabled { opacity }` dim so the two do not stack.
    'disabled:bg-button-disabled disabled:text-button-disabled-text disabled:border-transparent disabled:bg-none disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed',
    'aria-disabled:cursor-not-allowed',
    VARIANTS[variant],
    variant !== 'ghost' && '[border-width:var(--button-border-width)]',
    (variant === 'secondary' || variant === 'danger') && '[box-shadow:var(--elevation-button)]',
    SIZES[size],
    className,
  );
}

/**
 * A small icon-only control inside something else — a close ×, a pin, a
 * clear-field, a row's delete. IconButton is the same look with a tooltip; this
 * is for the places that need only the class.
 */
export function iconButtonClass(
  size: 'xs' | 'sm' = 'sm',
  active = false,
  className?: string | false | null,
) {
  return cn(
    'inline-flex items-center justify-center shrink-0 rounded-[var(--radius-sm)] cursor-pointer',
    'transition-[color,background-color,transform] motion-press active-dim',
    'disabled:cursor-not-allowed disabled:hover:bg-transparent',
    size === 'xs' ? 'w-6 h-6' : 'w-7 h-7',
    active
      ? 'text-icon-button-icon-hover bg-icon-button-hover'
      : 'text-text-muted hover:text-text hover:bg-action-button-hover',
    className,
  );
}

/** A link inside running text: the accent, underlined as the pointer arrives. */
export function linkClass(className?: string | false | null) {
  return cn(
    'text-accent underline decoration-transparent underline-offset-[3px] decoration-1',
    'hover:decoration-current focus-visible:decoration-current cursor-pointer',
    'transition-[color,text-decoration-color]',
    className,
  );
}

/** The track a set of segments sits in. */
export function segmentGroupClass(className?: string | false | null) {
  return cn(
    'relative inline-flex flex-wrap max-w-full items-center p-0.5 gap-0.5 rounded-[var(--radius-sm)] bg-surface border border-border',
    className,
  );
}

/** One choice in a segmented control or a tab strip. */
export function segmentClass(
  active: boolean,
  size: 'xs' | 'sm' = 'sm',
  className?: string | false | null,
) {
  return cn(
    'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer select-none',
    'rounded-[calc(var(--radius-sm)-2px)] font-body transition-[color,background-color,box-shadow]',
    size === 'xs' ? 'h-6 px-2 text-xxs' : 'h-7 px-2.5 text-xs',
    active
      ? 'bg-accent-muted text-accent font-medium shadow-[0_1px_2px_rgb(0_0_0/0.18)]'
      : 'text-text-muted hover:text-text hover:bg-action-button-hover',
    className,
  );
}

/** A tag or a filter: quiet until chosen, then the accent. */
export function chipClass(active = false, className?: string | false | null) {
  return cn(
    'inline-flex items-center gap-1 h-6 px-2 rounded-chip text-xxs font-mono whitespace-nowrap cursor-pointer select-none border',
    'transition-[color,background-color,border-color] active-dim',
    active
      ? 'bg-accent-muted text-accent border-accent/(--tint-quiet) hover:border-accent/(--tint-medium)'
      : 'bg-surface text-text-muted border-border hover:text-text hover:border-action-button-border-hover hover:bg-action-button-hover',
    className,
  );
}

/** A row in a menu. Menus pad themselves by 4px so the fill sits inset, rounded. */
export function menuItemClass(
  tone: 'default' | 'danger' = 'default',
  className?: string | false | null,
) {
  return cn(
    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-left text-sm cursor-pointer',
    'transition-[color,background-color] outline-none',
    tone === 'danger'
      ? 'text-error hover:bg-error-muted focus-visible:bg-error-muted'
      : 'text-text hover:bg-action-button-hover focus-visible:bg-action-button-hover',
    'disabled:cursor-not-allowed disabled:hover:bg-transparent',
    className,
  );
}

/** A row you pick from a list: a switcher, a result, a picker. */
export function rowClass(selected = false, className?: string | false | null) {
  return cn(
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-left cursor-pointer',
    'transition-[color,background-color]',
    selected
      ? 'bg-accent-muted text-text'
      : 'text-text hover:bg-action-button-hover focus-visible:bg-action-button-hover',
    className,
  );
}
