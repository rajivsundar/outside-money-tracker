# Outside Money

## Build
- Replace the placeholder with a mobile-first public-data dashboard using the requested navy and categorical palette.
- Add shared site navigation and three routes: Home, Race detail, and Methodology.
- Create a bundled JSON dataset with three clearly labeled placeholder states and candidate finance breakdowns.
- On Home, provide a state picker, three headline summaries, and races ranked by out-of-state share.
- On Race pages, show each candidate’s 100% receipt composition, explicit percentage denominators, and top donor-state tables.
- On Methodology, define all categories, calculations, rounding, and placeholder-data limitations in neutral language.

## Technical details
- Keep all data in `src/data/senate2024.json`; no database, authentication, storage, SDK, or server feature.
- Use TanStack Router routes `/`, `/race/$state`, and `/methodology`, each with unique metadata.
- Use semantic design tokens in the global stylesheet and reusable React components for navigation, legends, and finance visuals.
- Verify the live pages at desktop and mobile widths, route navigation, sorting, and empty/invalid state handling.
