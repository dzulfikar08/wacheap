import type { ReactNode } from "react";

/** The title block at the top of every page inside the app. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="font-display text-[1.875rem] leading-tight font-medium tracking-tight text-balance sm:text-[2.25rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-[15px] text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
