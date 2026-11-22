ALTER TABLE "vouchers" ADD COLUMN "max_redemptions" INTEGER;

-- The research voucher is limited to 100 redemptions in total.
UPDATE "vouchers" SET "max_redemptions" = 100 WHERE "code" = 'HEMAT5K';
