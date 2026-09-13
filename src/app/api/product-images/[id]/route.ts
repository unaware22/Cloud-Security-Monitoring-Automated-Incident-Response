import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { getFallbackProductById } from '@/lib/products-store';

export const dynamic = 'force-dynamic';

type CachedImage = {
  body: ArrayBuffer;
  contentType: string;
};

const globalForImages = globalThis as unknown as {
  optimizedProductImages?: Map<string, CachedImage>;
};

if (!globalForImages.optimizedProductImages) {
  globalForImages.optimizedProductImages = new Map();
}

const imageCache = globalForImages.optimizedProductImages;
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
  'X-Content-Type-Options': 'nosniff',
};

function placeholderResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720"><rect width="720" height="720" fill="#0c1220"/><text x="360" y="360" fill="#737373" font-family="monospace" font-size="34" text-anchor="middle" dominant-baseline="middle">SALADINSHOP</text></svg>`;
  return new Response(svg, {
    headers: { ...CACHE_HEADERS, 'Content-Type': 'image/svg+xml; charset=utf-8' },
  });
}

function dataUrlParts(value: string): { mime: string; buffer: Buffer } | null {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
}

function rememberImage(key: string, image: CachedImage) {
  imageCache.set(key, image);
  if (imageCache.size > 100) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const version = req.nextUrl.searchParams.get('v') || 'current';
  const cacheKey = `${params.id}:${version}`;
  const cached = imageCache.get(cacheKey);
  if (cached) {
    return new Response(cached.body, {
      headers: { ...CACHE_HEADERS, 'Content-Type': cached.contentType },
    });
  }

  // Fallback snapshot IDs are known locally, so their images should not wait
  // for an unavailable/cold RDS connection.
  let imageUrl: string | null | undefined = getFallbackProductById(params.id)?.imageUrl;
  if (!imageUrl) {
    try {
      const product = await prisma.product.findUnique({
        where: { id: params.id },
        select: { imageUrl: true },
      });
      imageUrl = product?.imageUrl;
    } catch (error) {
      console.warn('[Product Image] RDS lookup failed:', error);
    }
  }
  if (!imageUrl) return placeholderResponse();

  if (imageUrl.startsWith('/') || /^https?:\/\//i.test(imageUrl)) {
    // Keep local asset redirects relative. An absolute URL generated behind
    // Nginx can accidentally expose the container host (localhost:3000).
    return new Response(null, {
      status: 307,
      headers: { ...CACHE_HEADERS, Location: imageUrl },
    });
  }

  const source = dataUrlParts(imageUrl);
  if (!source) return placeholderResponse();

  try {
    let body: Buffer;
    let contentType: string;

    if (source.mime === 'image/webp' && source.buffer.length <= 250 * 1024) {
      body = source.buffer;
      contentType = 'image/webp';
    } else {
      body = await sharp(source.buffer, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 720,
          height: 720,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 76, effort: 4 })
        .toBuffer();
      contentType = 'image/webp';
    }

    const result = { body: Uint8Array.from(body).buffer, contentType };
    rememberImage(cacheKey, result);
    return new Response(result.body, {
      headers: { ...CACHE_HEADERS, 'Content-Type': result.contentType },
    });
  } catch (error) {
    console.error('[Product Image] Optimization failed:', error);
    return placeholderResponse();
  }
}
