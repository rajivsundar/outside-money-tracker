import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { CYCLES, cycleLabel, type Chamber } from "@/config";
import { scaleLinear } from "d3-scale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATA_UNAVAILABLE, type BarRow } from "@/lib/share";

/** Stored per-candidate percentages of receipts (the shape saved in the results tables). */
export type Categories = Record<"inState" | "outOfState" | "unknown" | "pacs" | "party" | "self" | "transfers", number>;

/** Bar A: where the money came from, as shares of total receipts by type. No geography. */
export const receiptMeta = [
  { key: "itemized", label: "Itemized individual donors", className: "bg-itemized" },
  { key: "small", label: "Small donors (location not reported)", className: "bg-unknown" },
  { key: "pacs", label: "PACs", className: "bg-pac" },
  { key: "party", label: "Party", className: "bg-party" },
  { key: "self", label: "Self-funding", className: "bg-other" },
  { key: "other", label: "Transfers & other", className: "bg-transfers" },
] as const;

/** Bar B: where located donors live, as shares of located donor dollars. Row labels name the race state. */
export const locationMeta = [
  { key: "inState", label: "In this state", className: "bg-in-state" },
  { key: "outOfState", label: "Outside this state", className: "bg-out-state" },
] as const;
const classFor = (key: string) => [...receiptMeta, ...locationMeta].find((m) => m.key === key)?.className ?? "bg-muted";

export function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function LegendList({ items, label }: { items: readonly { key: string; label: string; className: string }[]; label: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`size-2.5 rounded-sm ${item.className}`} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function CategoryLegend() {
  return (
    <div className="grid gap-3">
      <div><p className="mb-1.5 text-xs font-semibold">Where the money came from <span className="font-normal text-muted-foreground">(share of all receipts)</span></p><LegendList items={receiptMeta} label="Receipt categories" /></div>
      <div><p className="mb-1.5 text-xs font-semibold">Where located donors live <span className="font-normal text-muted-foreground">(share of located donor dollars)</span></p><LegendList items={locationMeta} label="Donor locations" /></div>
    </div>
  );
}

export const JFC_NOTE = "Money raised through joint fundraising committees arrives as transfers; its donors' locations are not counted here.";

function StackedBar({ rows, label }: { rows: BarRow[]; label: string }) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-sm" role="img" aria-label={label}>
        {rows.map((r) => (
          <div key={r.key} className={`${classFor(r.key)} min-w-0`} style={{ width: `${r.value}%` }} title={`${r.label}: ${r.text}`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right font-mono font-semibold tabular-nums">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bar A: where the money came from. Shares of total receipts by type only; always sums to 100%. */
export function ReceiptBar({ rows, label }: { rows: BarRow[]; label: string }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold">Where the money came from</h4>
      <StackedBar rows={rows} label={label} />
      <p className="mt-2 text-xs text-muted-foreground">Types of money, as a share of all receipts; the categories add to 100%. Small donors' locations are not reported, so this bar has no geography. {JFC_NOTE}</p>
    </section>
  );
}

/** Bar B: where located donors live. In-state vs out-of-state share of located donor dollars. */
export function DonorLocationBar({ rows, donorDollars, label }: { rows: BarRow[] | null; donorDollars: number; label: string }) {
  return (
    <section className="mt-8">
      <h4 className="mb-2 text-sm font-bold">Where located donors live</h4>
      {rows === null ? <p className="text-sm text-muted-foreground">{DATA_UNAVAILABLE}</p> : <>
        <StackedBar rows={rows} label={label} />
        <p className="mt-2 text-xs text-muted-foreground">Located donor dollars: the {formatMoney(donorDollars)} that this campaign's FEC donor-state totals assign to a state. The two shares add to 100%.</p>
      </>}
    </section>
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


/** Map/tile colour scale for the median out-of-state share of located donor dollars. */
export const SHARE_STOPS = ["#EAF4F6", "#1F7A8C", "#E07A1F"] as const;
export const shareColor = scaleLinear<string>().domain([0, 50, 100]).range([...SHARE_STOPS]).clamp(true);

export function ShareLegend({ noRaceLabel }: { noRaceLabel?: string | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
      <div>
        <div className="h-2.5 w-48 rounded-sm" style={{ background: `linear-gradient(to right, ${SHARE_STOPS.join(",")})` }} aria-hidden="true" />
        <div className="mt-1 flex w-48 justify-between font-mono"><span>0%</span><span>50%</span><span>100%</span></div>
        <p>Median out-of-state share of located donor dollars</p>
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
