# RateShock

RateShock is a crowdsourced map of Canadian insurance renewal shocks. Canadians submit their auto and home insurance renewal details — FSA, provider, and rate change — and see how their experience compares to thousands of others across the country. No accounts, no personal information, just postal-code-level data on who is getting hit hardest and where.

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router, `'use client'`)
- [React-Leaflet v4](https://react-leaflet.js.org) + [CartoDB Positron](https://carto.com/basemaps/) tiles
- [Supabase](https://supabase.com) (Postgres + Row-Level Security)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com)

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Supabase schema

Before running locally you need a Supabase project with the schema applied. Follow **steps a–c** in [DEPLOYMENT.md](DEPLOYMENT.md) to create the project and run [`lib/schema.sql`](lib/schema.sql) in the SQL Editor.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full Vercel + Supabase deployment guide. Total cost: $0/month.
