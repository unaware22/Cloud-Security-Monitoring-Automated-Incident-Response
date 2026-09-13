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
  });

  return <HomePageClient initialProducts={initialProducts} />;
}
