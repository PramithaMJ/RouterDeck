"use client";

import { Check, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export { cn };

// ------------------------------------------------------------------ Button

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft-danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-ink hover:opacity-90 active:opacity-80",
  secondary: "surface border border-subtle text-[var(--text)] hover:bg-[var(--surface-2)] shadow-card",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  "soft-danger": "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-lg",
  icon: "h-9 w-9 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.005em] transition-[background,box-shadow,opacity,color] disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Card

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface rounded-2xl border border-subtle shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      {icon}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ Badge

type Tone = "neutral" | "green" | "amber" | "red" | "brand" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-muted",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  red: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  brand: "bg-[var(--surface-2)] text-[var(--text)] ring-1 ring-inset ring-[var(--border)]",
  blue: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tracking-wide", tones[tone], className)}>{children}</span>;
}

export function StatusDot({ tone = "green", pulse }: { tone?: "green" | "amber" | "red" | "neutral"; pulse?: boolean }) {
  const c = { green: "bg-emerald-500 text-emerald-500", amber: "bg-amber-500 text-amber-500", red: "bg-rose-500 text-rose-500", neutral: "bg-zinc-400 text-zinc-400" }[tone];
  return (
    <span className="relative inline-flex size-2.5">
      {pulse && <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", c)} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", c)} />
    </span>
  );
}

// ------------------------------------------------------------------ Switch

export function Switch({ checked, onChange, disabled, label, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        size === "lg" ? "h-7 w-12" : "h-6 w-10",
        checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow transition-transform",
          size === "lg" ? "size-6" : "size-5",
          checked ? (size === "lg" ? "translate-x-[22px]" : "translate-x-[18px]") : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ------------------------------------------------------------------ Inputs

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-subtle surface px-3.5 text-[15px] outline-none transition placeholder:text-[var(--muted)] placeholder:opacity-70 focus:border-[var(--text)] focus:ring-2 focus:ring-[var(--text)]/10 disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-rose-600 dark:text-rose-400">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { revealable?: boolean }>(function PasswordInput(
  { className, revealable = true, ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-11", show && "font-mono text-[14px]", className)} {...rest} />
      {revealable && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-[var(--text)]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      )}
    </div>
  );
});

// ------------------------------------------------------------------ Feedback

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-[var(--surface-2)]", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-muted">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "brand", icon, children, className }: { tone?: "brand" | "amber" | "red" | "green"; icon?: ReactNode; children: ReactNode; className?: string }) {
  const t = {
    brand: "bg-[var(--surface-2)] text-[var(--text)] border-subtle",
    amber: "bg-amber-50 text-amber-900 border-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/20",
    red: "bg-rose-50 text-rose-900 border-rose-100 dark:bg-rose-500/10 dark:text-rose-100 dark:border-rose-500/20",
    green: "bg-emerald-50 text-emerald-900 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/20",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed", t, className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Dialog

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "surface m-auto w-[calc(100%-2rem)] rounded-3xl border border-subtle p-0 text-[var(--text)] shadow-pop open:animate-slide-up backdrop:animate-fade-in",
        { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[size],
      )}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {description && <div className="mt-1.5 text-sm text-muted">{description}</div>}
            </div>
            <button onClick={onClose} className="-mr-2 -mt-1 rounded-lg p-1.5 text-muted hover:bg-[var(--surface-2)]" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = "primary",
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

// ------------------------------------------------------------------ Misc

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
      className={cn("inline-flex items-center justify-center rounded-lg p-1.5 text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]", className)}
      aria-label={label}
      title={label}
    >
      {done ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
    </button>
  );
}

export function Meter({ value, tone }: { value: number; tone?: "auto" | "brand" }) {
  const v = Math.max(0, Math.min(100, value));
  const color = tone === "brand" ? "bg-brand-500" : v > 85 ? "bg-rose-500" : v > 65 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-[var(--surface-2)] p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition",
            value === o.value ? "surface text-[var(--text)] shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-[var(--border)]" : "text-muted hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
