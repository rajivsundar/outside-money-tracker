<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All data is fetched from the public OpenFEC API directly in the browser via src/lib/fec.ts (localStorage cache, throttled), because the project intentionally has no backend.
- Keep campaign-finance category metadata and formatting in shared presentation utilities so every route labels denominators consistently.
- FEC responses are cached in the user's external Supabase table fec_cache (browser client in src/lib/supabase.ts, 3s timeout, silent fallback) before localStorage, because Lovable Cloud must stay disabled.
- Senate and House share one results layer (src/lib/results.ts) parameterized by chamber, so tables differ only by name (senate_* vs house_*) and compute_status tracks per-state progress.
- The landing map uses pre-projected us-atlas topology rendered as inline SVG (no tiles/keys); missing data is always hatched, never coloured as 0%.
- Top out-of-state organizations per race live in src/lib/orgs.ts (FEC Schedule A lines 11B/11C, saved to race_top_orgs; Senate uses district '00'), computed on demand or by /admin/prefill, because they cost several FEC calls per candidate.
- Candidate figures come from the principal campaign committee only (calc_version in results tables; rows below the current version count as not computed), with donor-state dollars used unscaled and a 5% reconciliation check against itemized individual totals, because mixing committee pools distorted shares.
- Results for every Senate race and House district, 2026 first and then 2024 → 2016, are filled in the cloud by scripts/backfill.ts, which reuses src/lib (calc_version 2) in Node and writes to the same Supabase tables; .github/workflows/backfill.yml runs it hourly (cron "5 * * * *", one run at a time) with secrets FEC_API_KEY, SUPABASE_URL and SUPABASE_KEY. Order is 2026 Senate, 2026 House, 2024 Senate, … 2016 House, state by state (compute_status), skipping candidates already saved with calc_version ≥ 2. Each run stops cleanly after 850 FEC calls or 55 minutes (or X-RateLimit-Remaining < 30 or HTTP 429) and prints "mode: backfill" or "mode: refresh". When nothing is missing it switches to refresh mode: it recomputes 2026 results whose computed_at is older than 7 days, oldest first, using the app's 24-hour fec_cache lifetime for 2026 (2016–2024 are never recomputed), and prints "UP TO DATE" when none are due; "BACKFILL COMPLETE" is printed by the run that finishes the backfill. Top organizations are skipped unless --with-orgs; --refresh-only and --refresh-after-days exist for manual refreshes. To stop it, disable the workflow in the GitHub Actions tab (Actions → "Backfill FEC results" → … → Disable workflow). It shares the FEC key's 1,000 calls/hour with the browser app and /admin/prefill, so do not run prefill at the same time.
