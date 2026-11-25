-- Inventory pools now record how tickets are provided and how they are priced.
-- ticketPurpose: COMPLIMENTARY (GST set-off applies) or PURCHASE.
-- pricingUnit: PER_SEAT (default) or PER_SUITE (a whole suite box is priced as one).
ALTER TABLE "InventoryPool"
  ADD COLUMN IF NOT EXISTS "ticketPurpose" TEXT NOT NULL DEFAULT 'COMPLIMENTARY',
  ADD COLUMN IF NOT EXISTS "pricingUnit" TEXT NOT NULL DEFAULT 'PER_SEAT';
