import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { CYCLES, cycleLabel, type Chamber } from "@/config";
import { scaleLinear } from "d3-scale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const categoryMeta = [
  { key: "inState", label: "In-state", className: "bg-in-state" },
  { key: "outOfState", label: "Out-of-state", className: "bg-out-state" },
  { key: "unknown", label: "Unknown small donors", className: "bg-unknown" },
  { key: "pacs", label: "PACs", className: "bg-pac" },
  { key: "party", label: "Party", className: "bg-party" },
  { key: "self", label: "Self-funding", className: "bg-other" },
  { key: "transfers", label: "Transfers & other", className: "bg-transfers" },
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

export const JFC_NOTE = "Money raised through joint fundraising committees arrives as transfers; its donors' locations are not counted here.";

export function ReceiptBar({ categories, label }: { categories: Categories; label: string }) {
  const total = categoryMeta.reduce((s, i) => s + categories[i.key], 0);
  const scale = total > 100 ? 100 / total : 1;
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-sm" role="img" aria-label={label}>
        {categoryMeta.map((item) => (
          <div
            key={item.key}
            className={`${item.className} min-w-0`}
            style={{ width: `${categories[item.key] * scale}%` }}
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
      <p className="mt-2 text-xs text-muted-foreground">Each percentage is of total receipts.{total > 100.5 && ` These categories add to ${total.toFixed(1)}% of receipts because the donor-state rows don't reconcile with the itemized total; the bar is drawn to fit.`} {JFC_NOTE}</p>
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


/** Map/tile scale for median out-of-state share (% of itemized individual dollars). */
export const SHARE_STOPS = ["#EAF4F6", "#1F7A8C", "#E07A1F"] as const;
export const shareColor = scaleLinear<string>().domain([0, 50, 100]).range([...SHARE_STOPS]).clamp(true);

export function ShareLegend({ noRaceLabel }: { noRaceLabel?: string | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
      <div>
        <div className="h-2.5 w-48 rounded-sm" style={{ background: `linear-gradient(to right, ${SHARE_STOPS.join(",")})` }} aria-hidden="true" />
        <div className="mt-1 flex w-48 justify-between font-mono"><span>0%</span><span>50%</span><span>100%</span></div>
        <p>Median out-of-state share of itemized individual dollars</p>
      </div>
      <span className="inline-flex items-center gap-2"><span className="hatch size-4 rounded-sm border border-border" aria-hidden="true" />Not computed yet — click to load</span>
      {noRaceLabel && <span className="inline-flex items-center gap-2"><span className="hatch-dense size-4 rounded-sm border border-border" aria-hidden="true" />{noRaceLabel}</span>}
    </div>
  );
}

export function ChamberToggle({ value, onChange, dark = false }: { value: Chamber; onChange: (c: Chamber) => void; dark?: boolean }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold" id="chamber-label">Chamber</span>
      <div role="radiogroup" aria-labelledby="chamber-label" className={`inline-flex h-11 rounded-md border p-1 ${dark ? "border-primary-line bg-primary-surface" : "border-border"}`}>
        {(["senate", "house"] as const).map((c) => (
          <button key={c} role="radio" aria-checked={value === c} onClick={() => onChange(c)}
            className={`rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${value === c ? (dark ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground") : dark ? "text-primary-foreground" : "text-muted-foreground"}`}>
            {c === "senate" ? "Senate" : "House"}
          </button>
        ))}
      </div>
    </div>
  );
}
