ALTER TABLE "orders" ADD COLUMN "checkout_ip_address" TEXT;

CREATE INDEX "orders_checkout_ip_address_payment_status_expired_at_idx"
ON "orders"("checkout_ip_address", "payment_status", "expired_at");
