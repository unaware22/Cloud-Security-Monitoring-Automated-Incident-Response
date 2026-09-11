-- A paid order may have only one automatic digital delivery record. This makes
-- Midtrans webhook retries safe to process without duplicating delivery data.
CREATE UNIQUE INDEX "digital_deliveries_order_id_key" ON "digital_deliveries"("order_id");
