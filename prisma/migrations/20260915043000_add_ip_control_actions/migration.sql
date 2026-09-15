CREATE TABLE "ip_control_actions" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "rule_id" TEXT,
    "detail" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_control_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ip_control_actions_external_id_key"
ON "ip_control_actions"("external_id");

CREATE INDEX "ip_control_actions_ip_address_created_at_idx"
ON "ip_control_actions"("ip_address", "created_at");

CREATE INDEX "ip_control_actions_status_created_at_idx"
ON "ip_control_actions"("status", "created_at");

CREATE INDEX "ip_control_actions_created_at_idx"
ON "ip_control_actions"("created_at");
