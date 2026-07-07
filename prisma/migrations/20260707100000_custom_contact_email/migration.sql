-- F052: WRITTEN 맞춤 결제 영속화 — the settled payment persists an Order(kind=CUSTOM) whose
-- buyerEmail comes from the request's contact email. Nullable: PHONE-path + pre-F052 rows have none.
-- (ALTER on an existing RLS-enabled table — R10 governs CREATE TABLE only.)
ALTER TABLE "CustomRequest" ADD COLUMN "contactEmail" TEXT;
