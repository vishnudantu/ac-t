-- These columns were already present in the Prisma model and may have been
-- provisioned independently on existing installations.
ALTER TABLE "InventoryPool"
  ADD COLUMN IF NOT EXISTS "pricingUnit" TEXT NOT NULL DEFAULT 'PER_SEAT',
  ADD COLUMN IF NOT EXISTS "ticketPurpose" TEXT NOT NULL DEFAULT 'COMPLIMENTARY';
