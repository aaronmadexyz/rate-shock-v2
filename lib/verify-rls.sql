-- ─────────────────────────────────────────────────────────────────────────────
-- RateShock — Row Level Security verification script
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- EXPECTED OUTPUT:
--
-- Query 1 (RLS enabled):
--   tablename         | rowsecurity
--   ──────────────────┼────────────
--   submissions       | true
--   feature_requests  | true
--
-- Query 2 (policies):
--   tablename         | policyname              | cmd    | qual
--   ──────────────────┼─────────────────────────┼────────┼──────────────
--   submissions       | allow_anon_insert        | INSERT | null
--   submissions       | allow_anon_select        | SELECT | true  (or similar)
--   feature_requests  | allow_anon_insert        | INSERT | null
--
-- IMPORTANT: anonymous users (role: anon) should ONLY have INSERT on
-- feature_requests and INSERT + SELECT on submissions. There must be NO
-- UPDATE or DELETE policies for the anon role on any table.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Verify RLS is enabled on all public tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Verify policies exist and cover the right commands
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 3. Verify anon role does NOT have UPDATE or DELETE privileges
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
ORDER BY table_name, privilege_type;
-- Expected: only INSERT and SELECT for anon — no UPDATE, no DELETE

-- 4. Verify explicit grants exist (required from May 30 2025)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- Expected for submissions:
--   anon → SELECT, INSERT
--   authenticated → SELECT, INSERT, UPDATE, DELETE
--   service_role → SELECT, INSERT, UPDATE, DELETE
-- Expected for feature_requests:
--   anon → INSERT only
--   authenticated → SELECT, INSERT, UPDATE, DELETE
--   service_role → SELECT, INSERT, UPDATE, DELETE
