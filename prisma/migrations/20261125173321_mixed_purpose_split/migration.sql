-- Allow mixed complimentary/purchase splits within a single inventory pool.
ALTER TABLE "InventoryPool"
  ADD COLUMN IF NOT EXISTS "complimentaryQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchaseQuantity" INTEGER NOT NULL DEFAULT 0;
