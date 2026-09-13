import HomePageClient from '@/components/HomePageClient';
import {
  filterPublicProductCatalog,
  getPublicProductCatalog,
} from '@/lib/public-product-catalog';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Keep the cold-start budget below one second. If RDS is still opening its
  // first connection, the catalog service returns a public-only snapshot and
  // continues warming its cache in the background.
  const catalog = await getPublicProductCatalog(450);
  const initialProducts = filterPublicProductCatalog(catalog, {
    game: 'minecraft',
    sort: 'popular',
  }).map((product) => ({
    ...product,
    // Oversized legacy base64 images must not delay the first HTML response.
    // The background API refresh can replace these after cards are visible.
    imageUrl:
      product.imageUrl?.startsWith('data:') && product.imageUrl.length > 200_000
        ? null
        : product.imageUrl,
  }));

  return <HomePageClient initialProducts={initialProducts} />;
}
