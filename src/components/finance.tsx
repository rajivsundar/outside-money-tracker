import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { CYCLES, cycleLabel } from "@/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const categoryMeta = [
  { key: "inState", label: "In-state", className: "bg-in-state" },
  { key: "outOfState", label: "Out-of-state", className: "bg-out-state" },
  { key: "unknown", label: "Unknown small donors", className: "bg-unknown" },
  { key: "pacs", label: "PACs", className: "bg-pac" },
  { key: "party", label: "Party", className: "bg-party" },
  { key: "other", label: "Self & other", className: "bg-other" },
] as const;

export type Categories = Record<(typeof categoryMeta)[number]["key"], number>;

export function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function CategoryLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Receipt categories">
      {categoryMeta.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`size-2.5 rounded-sm ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ReceiptBar({ categories, label }: { categories: Categories; label: string }) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-sm" role="img" aria-label={label}>
        {categoryMeta.map((item) => (
          <div
            key={item.key}
            className={`${item.className} min-w-0`}
            style={{ width: `${categories[item.key]}%` }}
            title={`${item.label}: ${categories[item.key].toFixed(1)}% of receipts`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {categoryMeta.map((item) => (
          <div key={item.key} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-mono font-semibold tabular-nums">{categories[item.key].toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Each percentage is of total receipts.</p>
    </div>
  );
}

export function RaceLink({ code, cycle, children }: { code: string; cycle: number; children: ReactNode }) {
  return (
    <Link
      to="/race/$state"
      params={{ state: code.toLowerCase() }}
      search={{ cycle }}
      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
    >
      {children}<ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

export function CycleSelect({ value, onChange, dark = false }: { value: number; onChange: (c: number) => void; dark?: boolean }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor="cycle-picker">Cycle</label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id="cycle-picker" className={dark ? "h-12 border-primary-line bg-primary-surface px-4 text-primary-foreground shadow-none" : "h-11 px-4"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CYCLES.map((c) => <SelectItem key={c} value={String(c)}>{cycleLabel(c)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
