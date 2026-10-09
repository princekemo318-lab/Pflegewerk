"use client";

/**
 * Dialoge auf Basis des nativen <dialog>-Elements (Fokusfalle, Escape und
 * Hintergrund-Sperre liefert der Browser).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { buttonClasses } from "./primitives";
import { ActionForm, Field, SubmitButton, Textarea } from "./form";
import type { ActionState } from "@/server/actions";

export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  triggerSize?: "sm" | "md" | "lg";
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {trigger && (
        <button type="button" onClick={() => setOpen(true)} className={buttonClasses(triggerVariant, triggerSize, triggerClassName)}>
          {trigger}
        </button>
      )}
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-surface p-0 text-fg shadow-card backdrop:bg-[#0a1322]/50 backdrop:backdrop-blur-[2px]"
      >
        {open && (
          <div className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {description && <div className="mt-1 text-sm text-muted">{description}</div>}
              </div>
              <button type="button" onClick={close} className="-m-1 rounded-md p-1 text-subtle hover:text-fg" aria-label="Schließen">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {typeof children === "function" ? children(close) : children}
          </div>
        )}
      </dialog>
    </>
  );
}

/** Bestätigung für kritische Aktionen, optional mit Begründungsfeld. */
export function ConfirmAction({
  action,
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
  hidden,
  reason,
  triggerVariant,
  triggerSize = "md",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary" | "accent";
  hidden?: Record<string, string>;
  reason?: { label: string; required?: boolean; placeholder?: string };
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  triggerSize?: "sm" | "md" | "lg";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      trigger={trigger}
      triggerVariant={triggerVariant ?? (tone === "danger" ? "secondary" : tone)}
      triggerSize={triggerSize}
      title={title}
      description={description}
      open={open}
      onOpenChange={setOpen}
    >
      <ActionForm action={action} onSuccess={() => setOpen(false)}>
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {reason && <ReasonField {...reason} />}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={buttonClasses("secondary")} onClick={() => setOpen(false)}>
            Abbrechen
          </button>
          <SubmitButton variant={tone}>{confirmLabel}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}


function ReasonField({ label, required, placeholder }: { label: string; required?: boolean; placeholder?: string }) {
  return (
    <Field label={label} name="note" optional={!required}>
      {(p) => <Textarea {...p} placeholder={placeholder} maxLength={1000} required={required} />}
    </Field>
  );
}
