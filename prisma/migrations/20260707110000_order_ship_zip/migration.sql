-- F053: checkout collects the shipping destination — activate the dormant ship* columns and
-- add the postal code. (ALTER on an existing RLS-enabled table — R10 governs CREATE TABLE only.)
ALTER TABLE "Order" ADD COLUMN "shipZip" TEXT;
