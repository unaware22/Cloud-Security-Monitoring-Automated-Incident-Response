import { prisma } from '@/lib/prisma';
import { fallbackStore } from '@/lib/products-store';
import { ProductItem } from '@/lib/types';
import { getProductImageUrl } from '@/lib/product-image';

type CatalogState = {
  items: ProductItem[] | null;
  expiresAt: number;
  loadPromise: Promise<ProductItem[] | null> | null;
};

const globalForCatalog = globalThis as unknown as {
  publicProductCatalog?: CatalogState;
};

if (!globalForCatalog.publicProductCatalog) {
  globalForCatalog.publicProductCatalog = {
    items: null,
    expiresAt: 0,
    loadPromise: null,
  };
}

const catalogState = globalForCatalog.publicProductCatalog;
const CATALOG_TTL_MS = 60_000;

function toPublicProduct(product: any): ProductItem {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? null,
    price: product.price,
    originalPrice: product.originalPrice ?? null,
    discountPercent: product.discountPercent ?? null,
    stock: product.stock,
    sortOrder: product.sortOrder ?? 0,
    productType: product.productType,
    imageUrl: getProductImageUrl(product.id, product.updatedAt),
    game: product.game,
    subCategory1: product.subCategory1,
    subCategory2: product.subCategory2 ?? null,
    deliveryType: product.deliveryType,
    serviceTag: product.serviceTag,
    soldCount: product.soldCount,
    isActive: product.isActive,
    createdAt:
      product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt:
      product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  };
}

function safeFallbackCatalog(): ProductItem[] {
  // Explicit projection is important: deliveryContent may contain digital
  // credentials and must never be serialized into a public/client payload.
  return fallbackStore
    .getProducts({ isActive: true })
    .map(toPublicProduct)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

function startDatabaseLoad(): Promise<ProductItem[] | null> {
  if (catalogState.loadPromise) return catalogState.loadPromise;

  catalogState.loadPromise = prisma.product
    .findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        originalPrice: true,
        discountPercent: true,
        stock: true,
        sortOrder: true,
        productType: true,
        game: true,
        subCategory1: true,
        subCategory2: true,
        deliveryType: true,
        serviceTag: true,
        soldCount: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    .then((rows) => {
      const items = rows.map(toPublicProduct);
      catalogState.items = items;
      catalogState.expiresAt = Date.now() + CATALOG_TTL_MS;
      return items;
    })
    .catch((error) => {
      console.error('[Product Catalog] RDS query failed:', error);
      return null;
    })
    .finally(() => {
      catalogState.loadPromise = null;
    });

  return catalogState.loadPromise;
}

/**
 * Returns a cached catalog quickly. On a cold/slow RDS connection, callers
 * receive a safe public fallback while the database query continues warming
 * the cache for the next request.
 */
export async function getPublicProductCatalog(maxWaitMs = 700): Promise<ProductItem[]> {
  if (catalogState.items && Date.now() < catalogState.expiresAt) {
    return catalogState.items;
  }

  const staleItems = catalogState.items;
  const databaseLoad = startDatabaseLoad();
  const result = await Promise.race([
    databaseLoad,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), maxWaitMs)),
  ]);

  if (result !== null) return result;
  if (staleItems !== null) return staleItems;
  return safeFallbackCatalog();
}

export function invalidatePublicProductCatalog(): void {
  catalogState.expiresAt = 0;
}

function normalizeSubCategory1(value: string): string[] {
  if (value === 'fish-it' || value === 'fisch') return ['fish-it', 'fisch', 'fishit'];
  if (value === 'blox-fruit' || value === 'bloxfruits') {
    return ['blox-fruit', 'bloxfruits', 'bloxfruit'];
  }
  if (value === 'grow-a-garden-2' || value === 'growagirl' || value === 'grow-a-garden') {
    return ['grow-a-garden-2', 'growagirl', 'grow-a-garden', 'growagarden2'];
  }
  return [value];
}

export function filterPublicProductCatalog(
  catalog: ProductItem[],
  filters: {
    game?: string | null;
    subCategory1?: string | null;
    subCategory2?: string | null;
    search?: string | null;
    sort?: string | null;
  }
): ProductItem[] {
  let products = catalog.filter((product) => product.isActive);

  if (filters.game && filters.game !== 'all') {
    const game = filters.game.toLowerCase();
    products = products.filter((product) => product.game.toLowerCase() === game);
  }

  if (filters.subCategory1 && filters.subCategory1 !== 'all') {
    const allowed = normalizeSubCategory1(filters.subCategory1.toLowerCase());
    products = products.filter((product) =>
      allowed.includes((product.subCategory1 || '').toLowerCase())
    );
  }

  if (filters.subCategory2 && filters.subCategory2 !== 'all') {
    const requested = filters.subCategory2.toLowerCase();
    const allowed = requested === 'item' || requested === 'items' ? ['item', 'items'] : [requested];
    products = products.filter((product) =>
      allowed.includes((product.subCategory2 || '').toLowerCase())
    );
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase();
    products = products.filter(
      (product) =>
        product.name.toLowerCase().includes(search) ||
        (product.description || '').toLowerCase().includes(search)
    );
  }

  return [...products].sort((a, b) => {
    if (filters.sort === 'price_asc') return a.price - b.price;
    if (filters.sort === 'price_desc') return b.price - a.price;
    if (filters.sort === 'popular') {
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || b.stock - a.stock;
    }
    return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
  });
}
