"use client";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export type FormResult = { error?: string; success?: string };
export function ActionForm({
  action,
  children,
  submit = "Save",
  className = "space-y-4",
  onSuccess,
}: {
  action: (data: FormData) => Promise<FormResult>;
  children?: React.ReactNode;
  submit?: string;
  className?: string;
  onSuccess?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  const [state, dispatch, pending] = useActionState(
    async (_previous: FormResult, data: FormData) => {
      submitted.current = data;
      try {
        const result = await action(data);
        if (result.success) onSuccess?.();
        return result;
      } catch {
        return { error: "Could not save. Please try again." };
      }
    },
    {},
  );
  // React resets uncontrolled forms when an action resolves, including when
  // validation returns an error. Keep the user's text available for correction.
  useEffect(() => {
    if (!state.error || !submitted.current || !formRef.current) return;
    for (const control of Array.from(formRef.current.elements)) {
      if (
        !(
          control instanceof HTMLInputElement ||
          control instanceof HTMLTextAreaElement ||
          control instanceof HTMLSelectElement
        ) ||
        !control.name
      )
        continue;
      if (control instanceof HTMLInputElement && control.type === "file")
        continue;
      const values = submitted.current.getAll(control.name);
      if (
        control instanceof HTMLInputElement &&
        (control.type === "checkbox" || control.type === "radio")
      )
        control.checked = values.includes(control.value);
      else control.value = String(values[0] ?? "");
    }
  }, [state]);
  return (
    <form ref={formRef} action={dispatch} className={className}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.success}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submit}
      </Button>
    </form>
  );
}
