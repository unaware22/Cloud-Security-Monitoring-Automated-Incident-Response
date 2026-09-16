-- Allow 'jasa' in products.delivery_category check constraint
ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_delivery_category_allowed";

ALTER TABLE "products"
  ADD CONSTRAINT "products_delivery_category_allowed"
    CHECK ("delivery_category" IS NULL OR "delivery_category" IN ('account', 'redeem_code', 'roblox', 'jasa'));
