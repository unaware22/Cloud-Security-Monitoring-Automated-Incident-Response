import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const prisma = new PrismaClient();
const TARGET_BYTES = 180 * 1024;

function parseDataUrl(value) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase(),
    input: Buffer.from(match[2], 'base64'),
  };
}

async function optimizeImage(input) {
  const attempts = [
    { width: 1000, quality: 80 },
    { width: 900, quality: 74 },
    { width: 800, quality: 68 },
    { width: 720, quality: 62 },
    { width: 640, quality: 58 },
  ];
  let smallest = input;

  for (const attempt of attempts) {
    const output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: attempt.width,
        height: attempt.width,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: attempt.quality, effort: 4 })
      .toBuffer();

    if (output.length < smallest.length) smallest = output;
    if (output.length <= TARGET_BYTES) return output;
  }

  return smallest;
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, imageUrl: true },
  });
  let optimizedCount = 0;

  for (const product of products) {
    if (!product.imageUrl?.startsWith('data:image/')) continue;
    const source = parseDataUrl(product.imageUrl);
    if (!source) continue;
    if (source.mime === 'image/webp' && source.input.length <= TARGET_BYTES) continue;

    try {
      const output = await optimizeImage(source.input);
      if (output.length >= source.input.length) continue;

      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: `data:image/webp;base64,${output.toString('base64')}` },
      });
      optimizedCount += 1;
      console.log(
        `[Product Image] ${product.name}: ${Math.round(source.input.length / 1024)}KB -> ${Math.round(output.length / 1024)}KB`
      );
    } catch (error) {
      console.warn(`[Product Image] Skipped ${product.name}:`, error.message);
    }
  }

  console.log(`[Product Image] Optimization complete. Updated ${optimizedCount} product(s).`);
}

main()
  .catch((error) => {
    // Image cleanup must never prevent the storefront from starting.
    console.error('[Product Image] Startup optimization failed:', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
