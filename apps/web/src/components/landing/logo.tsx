// Kept free of imports so the app shell can draw the mark without pulling in the landing page's CSS and fonts.

/** The WACheap mark: a chat bubble with three lines cut out of it in the page colour. */
export function Logo({ className = "wc-logo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="currentColor" />
      <path
        d="M8.5 12.2h7M8.5 9.2h7M8.5 15.2h4"
        stroke="var(--wc-bg, var(--background))"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
