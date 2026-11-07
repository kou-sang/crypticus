// Primitivas de UI. Estética editorial: bordes de tinta, sin sombras difusas.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from '../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-accent border-ink hover:border-accent',
  secondary: 'bg-transparent text-ink border-ink hover:bg-ink hover:text-paper',
  ghost: 'bg-transparent text-ink border-transparent hover:border-line',
  danger: 'bg-transparent text-accent border-accent hover:bg-accent hover:text-paper',
};

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      data-variant={variant}
      className={cx(
        'btn inline-flex h-10 items-center justify-center gap-2 border px-4 text-sm font-semibold tracking-wide transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
        buttonStyles[variant],
        className,
      )}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Input({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>}
      <input
        {...props}
        className={cx(
          'h-11 w-full border border-line bg-paper px-3 text-base outline-none transition-colors placeholder:text-muted focus:border-ink',
          className,
        )}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">{label}</span>
      <select {...props} className="h-11 w-full border border-line bg-paper px-3 text-base outline-none focus:border-ink">
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('surface border border-line bg-paper-2/40 p-5', className)}>{children}</div>;
}

export function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cx('inline-block animate-spin border-2 border-current border-r-transparent', small ? 'size-3.5' : 'size-6')}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-muted">
      <Spinner />
    </div>
  );
}

export function PageHeader({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
      <div>
        {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">{kicker}</p>}
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight md:text-5xl">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="border-l-4 border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
      {error}
    </p>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' }) {
  const tones = { neutral: 'border-line text-muted', accent: 'border-accent text-accent', ok: 'border-ok text-ok' };
  return (
    <span className={cx('inline-flex items-center border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest', tones[tone])}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-16 text-xl' };
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center border border-ink font-mono font-semibold', sizes[size])}>
      {initials || '?'}
    </span>
  );
}
