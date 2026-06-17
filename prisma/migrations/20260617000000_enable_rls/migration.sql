-- Enable Row Level Security (RLS) on every public table.
--
-- WHY (Supabase linter 0013_rls_disabled_in_public, ERROR/EXTERNAL):
--   Supabase exposes the `public` schema through its auto-generated PostgREST
--   "Data API", reachable from the internet with the publishable `anon` key.
--   With RLS OFF, anyone holding that key could read/write these tables directly
--   (https://<ref>.supabase.co/rest/v1/Order ...) — including PII tables
--   (Order, Personalization, CustomRequest, Consultation, Asset, OtpCode).
--
-- WHY THIS IS SAFE FOR THIS APP (no policies needed = deny-all):
--   All runtime + migration DB access is via Prisma over the direct Postgres
--   protocol as the `postgres` role, which OWNS these tables and therefore
--   BYPASSES RLS. (We deliberately do NOT use FORCE ROW LEVEL SECURITY, which
--   would also block the owner.) Supabase Storage uses the service_role key,
--   which likewise bypasses RLS. The app never uses the @supabase/supabase-js
--   client or the Data API, so anon/authenticated need ZERO access: RLS enabled
--   with no policies denies them everything while Prisma keeps full access.
--
-- Idempotent: ENABLE ROW LEVEL SECURITY on an already-enabled table is a no-op.
-- Reversible: `ALTER TABLE "<t>" DISABLE ROW LEVEL SECURITY;` (forward-fix only,
-- migrations don't auto-rollback).

ALTER TABLE "Template"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Personalization"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomRequest"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consultation"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedWebhook"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtpCode"            ENABLE ROW LEVEL SECURITY;

-- Prisma's own migration ledger. Supabase flags it too; the owner (postgres)
-- still bypasses RLS, so `prisma migrate` keeps writing to it normally.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
