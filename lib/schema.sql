-- ─────────────────────────────────────────────────────────────────────────────
-- RateMap — Supabase schema
-- Paste this into the Supabase SQL editor and run once to initialise the table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists submissions (
  -- identity
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),

  -- location
  fsa          text        not null,                     -- 3-char Ontario postal prefix, e.g. "M5V"
  neighbourhood text,                                    -- populated server-side from FSA lookup

  -- policy
  insurance_type text not null check (insurance_type in ('auto', 'home')),
  provider       text not null,

  -- rate change (one of the two will be populated depending on mode)
  rate_change_pct    numeric,                            -- increase as a percentage
  rate_change_dollar numeric,                            -- increase in dollars (nullable)
  mode               text not null default 'pct'
                       check (mode in ('pct', 'dollar')),

  -- auto-specific risk factors
  years_licensed  integer,                               -- null for home submissions
  at_fault_claims integer not null default 0,
  convictions     integer not null default 0,            -- null-equivalent: 0 for home

  -- home-specific risk factors
  home_claims     integer not null default 0,            -- null-equivalent: 0 for auto

  -- sentiment
  sentiment integer not null check (sentiment between 1 and 5),

  -- freeform comment fields (all nullable — parsed from a single textarea server-side)
  comment_raw         text,
  comment_explanation text,
  comment_loyalty     text,
  comment_shopping    text,
  comment_tone        text,

  -- moderation
  verified boolean not null default false
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

alter table submissions enable row level security;

-- Anyone can read submissions (public map data)
create policy "public select"
  on submissions for select
  using (true);

-- Anyone can submit a renewal (anonymous contribution)
create policy "public insert"
  on submissions for insert
  with check (true);

-- ── Explicit grants required from May 30, 2025 ──
-- Supabase no longer auto-grants public schema access.

-- submissions
GRANT SELECT, INSERT
  ON public.submissions
  TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.submissions
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.submissions
  TO service_role;

-- feature_requests
GRANT INSERT
  ON public.feature_requests
  TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.feature_requests
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.feature_requests
  TO service_role;
