import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import { geoPath } from "d3-geo";
import us from "us-atlas/states-albers-10m.json";
import { STATES } from "@/config";
import { shareColor } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StateStatus =
  | { kind: "value"; median: number | null; count: number }
  | { kind: "pending" }
  | { kind: "none" };

type Props = { statuses: Record<string, StateStatus>; noneLabel: string; onSelect: (postal: string) => void };

const path = geoPath();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shapes = (feature(us as any, (us as any).objects.states) as any).features as { id: string; properties: { name: string } }[];

export function describe(s: StateStatus | undefined, noneLabel: string) {
  if (!s || s.kind === "pending") return "Not computed yet — click to load";
  if (s.kind === "none") return noneLabel;
  return s.median === null
    ? `Data unavailable · ${s.count} candidate${s.count === 1 ? "" : "s"} computed`
    : `Median ${s.median.toFixed(1)}% of located donor dollars from out of state · ${s.count} candidate${s.count === 1 ? "" : "s"} computed`;
}

export function UsMap({ statuses, noneLabel, onSelect }: Props) {
  const [hover, setHover] = useState<{ postal: string; name: string; x: number; y: number } | null>(null);
  const [sheet, setSheet] = useState<{ postal: string; name: string } | null>(null);
  const [asTable, setAsTable] = useState(false);
  const items = useMemo(() => shapes.map((f) => {
    const [postal, name] = STATES[f.id] ?? [f.id, f.properties.name];
    return { postal, name, d: path(f as never) ?? "", c: path.centroid(f as never) };
  }), []);

  const activate = (postal: string, name: string) => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) setSheet({ postal, name });
    else onSelect(postal);
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>{asTable ? "View as map" : "View as table"}</Button>
      </div>
      {asTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>State</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <TableRow key={s.postal}>
                <TableCell><button className="font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onSelect(s.postal)}>{s.name}</button></TableCell>
                <TableCell className="text-sm text-muted-foreground">{describe(statuses[s.postal], noneLabel)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="relative">
          <svg viewBox="0 0 975 610" className="h-auto w-full" role="group" aria-label="U.S. map of states">
            <defs>
              <pattern id="hatch-pending" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--muted)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeWidth="1.2" opacity="0.5" />
              </pattern>
              <pattern id="hatch-none" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width="4" height="4" fill="var(--background)" /><line x1="0" y1="0" x2="0" y2="4" stroke="var(--muted-foreground)" strokeWidth="1" />
              </pattern>
            </defs>
            {items.map((s) => {
              const st = statuses[s.postal];
              const fill = st?.kind === "value" ? (st.median === null ? "url(#hatch-pending)" : shareColor(st.median)) : st?.kind === "none" ? "url(#hatch-none)" : "url(#hatch-pending)";
              const label = `${s.name}: ${describe(st, noneLabel)}`;
              return (
                <path key={s.postal} d={s.d} fill={fill} stroke="var(--background)" strokeWidth={1}
                  tabIndex={0} role="link" aria-label={label}
                  className="cursor-pointer outline-none hover:opacity-80 focus-visible:stroke-foreground focus-visible:[stroke-width:3]"
                  onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ postal: s.postal, name: s.name, x: e.clientX - r.left, y: e.clientY - r.top }); }}
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) => { const svg = e.currentTarget.ownerSVGElement as SVGSVGElement; const k = svg.getBoundingClientRect().width / 975; setHover({ postal: s.postal, name: s.name, x: s.c[0] * k, y: s.c[1] * k }); }}
                  onBlur={() => setHover(null)}
                  onClick={() => activate(s.postal, s.name)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.postal); } }}
                />
              );
            })}
            {items.map((s) => Number.isFinite(s.c[0]) && (
              <text key={`l-${s.postal}`} x={s.c[0]} y={s.c[1]} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-foreground font-mono text-[11px] font-semibold" style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}>{s.postal}</text>
            ))}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute z-10 hidden max-w-64 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md sm:block" style={{ left: hover.x, top: hover.y - 10 }}>
              <p className="font-semibold">{hover.name}</p>
              <p className="mt-0.5 text-muted-foreground">{describe(statuses[hover.postal], noneLabel)}</p>
            </div>
          )}
        </div>
      )}
      <Sheet open={!!sheet} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom">
          {sheet && <>
            <SheetHeader><SheetTitle>{sheet.name}</SheetTitle><SheetDescription>{describe(statuses[sheet.postal], noneLabel)}</SheetDescription></SheetHeader>
            <Button className="mt-4 w-full" onClick={() => onSelect(sheet.postal)}>View state</Button>
          </>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
