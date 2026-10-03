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
