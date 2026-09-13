-- Persist the display and delivery fields managed from the admin product form.
-- The columns remain nullable so products imported from older databases keep
-- the storefront's existing inferred discount/category behaviour.
ALTER TABLE "products"
  ADD COLUMN "original_price" INTEGER,
  ADD COLUMN "discount_percent" INTEGER,
  ADD COLUMN "delivery_category" TEXT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_original_price_positive"
    CHECK ("original_price" IS NULL OR "original_price" > 0),
  ADD CONSTRAINT "products_discount_percent_range"
    CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 99)),
  ADD CONSTRAINT "products_delivery_category_allowed"
    CHECK ("delivery_category" IS NULL OR "delivery_category" IN ('account', 'redeem_code', 'roblox'));
