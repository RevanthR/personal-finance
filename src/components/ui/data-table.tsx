import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Hidden in the mobile stacked-row fallback (e.g. secondary NAV columns
   * that don't matter as much once the row is scanned top-to-bottom). */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered as the first column — the row's identity (icon, name, tags),
   * matching the "Fund" column in Coin's holdings table. */
  leading: (row: T) => ReactNode;
  /** Header label for the leading column, e.g. "Fund" or "User". */
  leadingHeader?: string;
  trailing?: (row: T) => ReactNode;
  className?: string;
}

// Aligned-column table for dense data at desktop width (Coin's fund
// holdings table: Fund | Avg NAV | Curr NAV | Invested | Current | P&L |
// Day Chg), falling back to a stacked hairline-divider row per record on
// mobile, where columns wouldn't fit.
export function DataTable<T>({ columns, rows, rowKey, leading, leadingHeader = "", trailing, className }: DataTableProps<T>) {
  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      {/* Desktop: real table */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-muted-foreground text-xs px-4 py-3">{leadingHeader}</th>
            {columns.map(c => (
              <th key={c.key} className={cn("font-medium text-muted-foreground text-xs px-3 py-3", c.align === "right" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
            {trailing && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
              <td className="px-4 py-3">{leading(row)}</td>
              {columns.map(c => (
                <td key={c.key} className={cn("px-3 py-3 tabular-nums", c.align === "right" ? "text-right" : "text-left")}>
                  {c.render(row)}
                </td>
              ))}
              {trailing && <td className="px-3 py-3 text-right">{trailing(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked rows, hairline dividers */}
      <div className="md:hidden divide-y divide-border">
        {rows.map(row => (
          <div key={rowKey(row)} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">{leading(row)}</div>
            <div className="flex items-center gap-4 shrink-0">
              {columns.filter(c => !c.hideOnMobile).map(c => (
                <div key={c.key} className="text-right tabular-nums text-sm">{c.render(row)}</div>
              ))}
              {trailing?.(row)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
