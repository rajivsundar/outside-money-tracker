import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";

const navClass =
  "border-b-2 border-transparent py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-foreground" aria-label="Outside Money home">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Landmark className="size-4" aria-hidden="true" />
          </span>
          <span className="font-serif text-xl font-bold">Outside Money</span>
        </Link>
        <nav aria-label="Primary navigation" className="flex items-center gap-5">
          <Link to="/" className={navClass} activeProps={{ className: "border-primary text-foreground" }} activeOptions={{ exact: true }}>
            Races
          </Link>
          <Link to="/methodology" className={navClass} activeProps={{ className: "border-primary text-foreground" }}>
            Methodology
          </Link>
        </nav>
      </div>
    </header>
  );
}
