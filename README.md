# Outside Money Tracker

Outside Money. 

HARD RULES — follow for this entire project:
1. Do NOT enable Lovable Cloud. Do NOT create, provision, or connect any Supabase project or database. Do NOT add authentication, edge functions, storage, or any backend.
2. If any feature seems to need a backend, stop and ask me instead of enabling one.
3. Do not create a supabase/ folder or src/integrations/supabase. Do not install @supabase/supabase-js or any Lovable SDK.
4. All data comes ONLY from the static file src/data/senate2024.json bundled with the app.

BUILD: A React + TypeScript + Tailwind app "Outside Money" — tagline "Where your senators' money comes from (2024)". Create src/data/senate2024.json with 3 placeholder states.
Pages: Home (state picker, 3 headline cards, list of races sorted by out-of-state share), Race (/race/:state — each candidate's 100% stacked bar of receipts: in-state, out-of-state, unknown small donors, PACs, party, self & other; plus top donor states table), Methodology.
Colours: in-state #1F7A8C, out-of-state #E07A1F, unknown #B8BDC7, PAC #6C5B9E, party #8A9A5B, other #9C6644, navy #14213D. Every percentage names its denominator ("of receipts" or "of itemized individual dollars"). Neutral language. Mobile-first.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a899787b-a85a-4a76-82b3-5b8d9186cc87).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
