"use client";

/**
 * Formulare mit Server Actions: einheitliche Fehleranzeige, Toasts, Schutz vor
 * Doppelübermittlung (Button während der Übermittlung deaktiviert).
 */
import { createContext, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { buttonClasses } from "./primitives";
import { toast } from "./toaster";
import type { ActionState } from "@/server/actions";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(null);

export function useFormState() {
  return useContext(FormStateContext);
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  toastOnSuccess = true,
  onSuccess,
  ...rest
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  toastOnSuccess?: boolean;
  onSuccess?: (state: NonNullable<ActionState>) => void;
} & Omit<ComponentProps<"form">, "action" | "children" | "onSubmit">) {
  // Meldungen werden direkt nach der Server-Antwort angezeigt – auch wenn das Formular
  // dadurch verschwindet (z. B. „Stornieren“ entfernt den eigenen Button).
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok && toastOnSuccess && result.message) toast(result.message);
    if (result && !result.ok && result.message && !result.fieldErrors) toast(result.message, "error");
    return result;
  }, null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state?.at || handled.current === state.at) return;
    handled.current = state.at;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <FormStateContext value={state}>
      <form ref={formRef} action={formAction} className={className} noValidate {...rest}>
        {state && !state.ok && state.fieldErrors && state.message && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-fg">
            {state.message}
          </p>
        )}
        {children}
      </form>
    </FormStateContext>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"button">, "type"> & {
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Felder
// ---------------------------------------------------------------------------

const controlClasses =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg shadow-soft placeholder:text-subtle " +
  "transition-colors focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 " +
  "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted";

export function Field({
  label,
  name,
  hint,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  name: string;
  hint?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; name: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const state = useFormState();
  const error = state?.fieldErrors?.[name];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-subtle">optional</span>}
      </label>
      {children({ id, name, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(controlClasses, "h-10", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(controlClasses, "h-10 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx(controlClasses, "min-h-24 py-2", className)} {...props} />;
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className={clsx("flex cursor-pointer items-start gap-3 text-sm", className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--accent)]"
        {...props}
      />
      <span>
        <span className="font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function FormError({ name }: { name: string }) {
  const state = useFormState();
  const error = state?.fieldErrors?.[name];
  if (!error) return null;
  return <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>;
}

/** Wochentagsauswahl (Checkboxen "weekday" mit Werten 0–6). */
export function WeekdayPicker({ name = "weekday", mask, label = "Arbeitstage" }: { name?: string; mask: number; label?: string }) {
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {days.map((d, i) => (
          <label key={d} className="cursor-pointer">
            <input type="checkbox" name={name} value={i} defaultChecked={((mask >> i) & 1) === 1} className="peer sr-only" />
            <span className="grid h-9 w-11 place-items-center rounded-lg border border-line-strong bg-surface text-sm text-muted transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-fg peer-focus-visible:ring-2 peer-focus-visible:ring-focus">
              {d}
            </span>
          </label>
        ))}
      </div>
      <FormError name="weekdays" />
    </fieldset>
  );
}
