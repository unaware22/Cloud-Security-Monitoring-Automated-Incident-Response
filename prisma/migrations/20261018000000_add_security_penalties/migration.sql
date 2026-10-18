CREATE TABLE "security_penalties" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subject_ref" TEXT NOT NULL,
    "label" TEXT,
    "event_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "strike" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "lifted_at" TIMESTAMP(3),
    "lifted_by" TEXT,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMP(3),
    "last_hit_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_penalties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_penalties_kind_subject_expires_at_idx"
ON "security_penalties"("kind", "subject", "expires_at");

CREATE INDEX "security_penalties_created_at_idx"
ON "security_penalties"("created_at");
