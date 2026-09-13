export function getProductImageUrl(
  productId: string,
  updatedAt?: string | Date | null
): string {
  const version = updatedAt
    ? updatedAt instanceof Date
      ? updatedAt.getTime().toString()
      : new Date(updatedAt).getTime().toString()
    : 'current';

  return `/api/product-images/${encodeURIComponent(productId)}?v=${encodeURIComponent(version)}`;
}

export function withProductImageUrl<T extends { id: string; updatedAt?: string | Date | null }>(
  product: T
): T & { imageUrl: string } {
  return {
    ...product,
    imageUrl: getProductImageUrl(product.id, product.updatedAt),
  };
}
