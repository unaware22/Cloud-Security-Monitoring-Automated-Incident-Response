-- Keep the deployed PostgreSQL schema aligned with the Product model used by
-- the storefront. These fields were added to the Prisma model after the
-- initial baseline migration.
ALTER TABLE "products"
    ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "service_tag" TEXT NOT NULL DEFAULT 'proses-instant',
    ADD COLUMN "sold_count" TEXT NOT NULL DEFAULT '19rb+ Terjual';
