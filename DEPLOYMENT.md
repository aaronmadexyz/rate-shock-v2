# Deployment

RateShock deploys to Vercel (Hobby, free) backed by Supabase (free tier).
No paid services. No API keys beyond the two listed below.

---

## One-time setup

### a. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, choose a name and region closest to your users (Canada East recommended).
3. Wait for the project to provision (~1 minute).

### b. Initialise the database schema

1. In your Supabase project, go to **SQL Editor**.
2. Paste the entire contents of [`/lib/schema.sql`](lib/schema.sql) into the editor.
3. Click **Run**. You should see `Success. No rows returned`.

This creates the `submissions` table and enables row-level security with public
read and anonymous insert policies.

### c. Copy your project credentials

In your Supabase project go to **Settings → API** and copy:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |

### d. Connect to Vercel

1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Vercel will detect Next.js automatically (confirmed by `vercel.json`).
4. Under **Environment Variables**, add both keys from step c.
5. Click **Deploy**.

### e. Verify

- The map loads with CartoDB Positron tiles.
- Clicking the Nav CTA opens the renewal modal.
- A test submission appears as a marker on the map without a page reload.

---

## Environment variables summary

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Both are public (prefixed `NEXT_PUBLIC_`) — they are embedded in the client
bundle and visible in the browser. This is intentional and safe: Supabase's
row-level security policies control what operations are allowed with the anon key.

---

## External services — cost summary

| Service | Plan | Cost |
|---|---|---|
| Supabase | Free tier (500 MB, 50k MAU) | $0 |
| CartoDB Positron tiles | Free, no API key | $0 |
| Google Fonts (Inter + IBM Plex Mono) | Free | $0 |
| Vercel | Hobby | $0 |

**Total: $0/month.**
