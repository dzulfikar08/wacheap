/** Validation messages under a form field. TanStack Form hands over zod issues (or undefined). */
export function FieldErrors({
  id,
  errors,
}: {
  /** Referenced by the input's aria-describedby, so the error is read again when the field gets focus. */
  id: string;
  errors: ReadonlyArray<{ message?: string } | undefined>;
}) {
  const messages = [...new Set(errors.map((e) => e?.message).filter(Boolean))];
  if (messages.length === 0) return null;
  return (
    <div id={id} role="alert" className="grid gap-1">
      {messages.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
