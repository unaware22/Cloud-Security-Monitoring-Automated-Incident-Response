-- Index the read paths used by the storefront, admin dashboard, and security
-- event views. These are non-unique indexes and do not change existing data.
CREATE INDEX "products_is_active_game_sub_category_1_sort_order_idx"
ON "products"("is_active", "game", "sub_category_1", "sort_order");

CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");
CREATE INDEX "orders_delivery_status_idx" ON "orders"("delivery_status");

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");
CREATE INDEX "payment_transactions_order_id_created_at_idx"
ON "payment_transactions"("order_id", "created_at");
CREATE INDEX "manual_payment_submissions_order_id_created_at_idx"
ON "manual_payment_submissions"("order_id", "created_at");
CREATE INDEX "manual_payment_submissions_status_idx"
ON "manual_payment_submissions"("status");

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_action_entity_type_idx"
ON "audit_logs"("action", "entity_type");

CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");
CREATE INDEX "security_events_severity_created_at_idx"
ON "security_events"("severity", "created_at");
CREATE INDEX "security_events_event_type_created_at_idx"
ON "security_events"("event_type", "created_at");
