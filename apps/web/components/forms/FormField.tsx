import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { cn } from "@balm/ui";

interface BaseProps {
  label: string;
  id: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

const inputBase =
  "block w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3.5 py-2.5 text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 transition-colors";

const Label = ({
  id,
  children,
  required,
}: {
  id: string;
  children: ReactNode;
  required?: boolean;
}) => (
  <label
    htmlFor={id}
    className="block text-sm font-medium text-[var(--color-text-primary)] mb-2"
  >
    {children}
    {required ? <span className="text-[var(--color-danger)] ms-0.5">*</span> : null}
  </label>
);

const Helper = ({ id, hint, error }: { id: string; hint?: string; error?: string }) =>
  error ? (
    <p id={`${id}-error`} className="mt-1.5 text-sm text-[var(--color-danger)]">
      {error}
    </p>
  ) : hint ? (
    <p id={`${id}-hint`} className="mt-1.5 text-sm text-[var(--color-text-muted)]">
      {hint}
    </p>
  ) : null;

export function TextField({
  label,
  id,
  required,
  error,
  hint,
  className,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label id={id} required={required}>
        {label}
      </Label>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, error && "border-[var(--color-danger)]", className)}
        {...rest}
      />
      <Helper id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  id,
  required,
  error,
  hint,
  className,
  rows = 5,
  ...rest
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <Label id={id} required={required}>
        {label}
      </Label>
      <textarea
        id={id}
        required={required}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputBase, "resize-y", error && "border-[var(--color-danger)]", className)}
        {...rest}
      />
      <Helper id={id} hint={hint} error={error} />
    </div>
  );
}
