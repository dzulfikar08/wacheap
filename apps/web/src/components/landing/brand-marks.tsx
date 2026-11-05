import type { CSSProperties } from "react";

/**
 * Logos of products WACheap works with, as local files in /public/logos (see NOTICE, "Brand marks"). They only
 * identify the product; each sits on a tile in that product's own app-icon colours.
 */
export interface BrandMark {
  name: string;
  src: string;
  /** Tile colour behind the mark. */
  tile: string;
  /** Mark size as a share of the tile. */
  scale?: number;
}

export const AGENT_MARKS = {
  chatgpt: { name: "ChatGPT", src: "/logos/chatgpt.svg", tile: "#ffffff", scale: 0.6 },
  claude: { name: "Claude", src: "/logos/claude.svg", tile: "#f4f0e8", scale: 0.62 },
  cursor: { name: "Cursor", src: "/logos/cursor.svg", tile: "#14120b", scale: 0.6 },
  codex: { name: "Codex", src: "/logos/codex.svg", tile: "#ffffff", scale: 0.7 },
  grok: { name: "Grok", src: "/logos/grok.svg", tile: "#1f1f1f", scale: 0.6 },
} as const satisfies Record<string, BrandMark>;

/**
 * Spreadsheets a seller keeps opted-in buyers in; WACheap takes them as an uploaded CSV/XLSX file.
 * Marketplaces are left out on purpose: they mask buyer numbers and there is no integration with them.
 */
export const SOURCE_MARKS = [
  { name: "Google Sheets", src: "/logos/google-sheets.svg", tile: "#ffffff", scale: 0.62 },
] as const satisfies readonly BrandMark[];

/** A product logo on its tile. Decorative by default: the product's name is always in the text next to it. */
export function BrandTile({
  mark,
  size = "2.25rem",
  className,
  style,
}: {
  mark: BrandMark;
  size?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className ? `wc-tile ${className}` : "wc-tile"}
      style={
        {
          ...style,
          "--tile": mark.tile,
          "--size": size,
          "--scale": mark.scale ?? 0.6,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <img src={mark.src} alt="" width={32} height={32} loading="lazy" decoding="async" />
    </span>
  );
}

/** A plain spreadsheet file, for CSV and XLSX uploads (no vendor mark). */
export function FileTile({ size = "2.25rem", label }: { size?: string; label: string }) {
  return (
    <span
      className="wc-tile wc-tile-file"
      style={{ "--tile": "#ffffff", "--size": size } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
        <path d="M14 3v5h5" />
      </svg>
      <span>{label}</span>
    </span>
  );
}
