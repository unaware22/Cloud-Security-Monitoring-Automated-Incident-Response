-- AlterTable
ALTER TABLE "ip_control_actions"
ADD COLUMN "block_mode" TEXT,
ADD COLUMN "timeout_seconds" INTEGER,
ADD COLUMN "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ip_control_actions_status_expires_at_idx"
ON "ip_control_actions"("status", "expires_at");
