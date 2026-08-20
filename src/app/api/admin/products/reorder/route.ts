import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { isDatabaseOnline } from '@/lib/db-store';
import {
  reorderFallbackProduct,
  setFallbackProductOrder,
  getAllFallbackProducts,
} from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { product_id, direction, sort_order, items } = body;

    const dbOnline = await isDatabaseOnline();

    // 1. Bulk reorder items
    if (Array.isArray(items) && items.length > 0) {
      if (dbOnline) {
        try {
          await prisma.$transaction(
            items.map((item: { id: string; sort_order: number }) =>
              prisma.product.update({
                where: { id: item.id },
                data: { sortOrder: Number(item.sort_order) },
              })
            )
          );
          const updatedDbProducts = await prisma.product.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          });
          return NextResponse.json({
            success: true,
            message: 'Urutan produk berhasil diperbarui',
            data: updatedDbProducts,
          });
        } catch (err) {
          console.warn('[Reorder API] DB error during bulk reorder:', err);
        }
      }

      items.forEach((item: { id: string; sort_order: number }) => {
        setFallbackProductOrder(item.id, Number(item.sort_order));
      });

      return NextResponse.json({
        success: true,
        message: 'Urutan produk berhasil diperbarui',
        data: getAllFallbackProducts(),
      });
    }

    // 2. Direct Move Up or Move Down
    if (product_id && (direction === 'up' || direction === 'down')) {
      if (dbOnline) {
        try {
          const allProds = await prisma.product.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          });

          const currentIndex = allProds.findIndex(
            (p) => p.id === product_id || p.slug === product_id
          );

          if (currentIndex !== -1) {
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex >= 0 && targetIndex < allProds.length) {
              // Move item in array
              const [movedItem] = allProds.splice(currentIndex, 1);
              allProds.splice(targetIndex, 0, movedItem);

              // Normalize and persist sortOrder 1..N
              await prisma.$transaction(
                allProds.map((prod, idx) =>
                  prisma.product.update({
                    where: { id: prod.id },
                    data: { sortOrder: idx + 1 },
                  })
                )
              );

              const updatedDbProducts = await prisma.product.findMany({
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
              });

              return NextResponse.json({
                success: true,
                message: `Produk berhasil dipindahkan ke ${direction === 'up' ? 'atas' : 'bawah'}`,
                data: updatedDbProducts,
              });
            }
          }
        } catch (dbErr) {
          console.warn('[Reorder API] DB swap error, fallback in-memory:', dbErr);
        }
      }

      const updatedList = reorderFallbackProduct(product_id, direction);

      return NextResponse.json({
        success: true,
        message: `Produk berhasil dipindahkan ke ${direction === 'up' ? 'atas' : 'bawah'}`,
        data: updatedList,
      });
    }

    // 3. Set specific sort_order for single product
    if (product_id && sort_order !== undefined) {
      const newOrder = Number(sort_order);

      if (dbOnline) {
        try {
          const allProds = await prisma.product.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
          });
          const currentIndex = allProds.findIndex(
            (p) => p.id === product_id || p.slug === product_id
          );
          if (currentIndex !== -1) {
            const [movedItem] = allProds.splice(currentIndex, 1);
            const insertIdx = Math.max(0, Math.min(newOrder - 1, allProds.length));
            allProds.splice(insertIdx, 0, movedItem);

            await prisma.$transaction(
              allProds.map((prod, idx) =>
                prisma.product.update({
                  where: { id: prod.id },
                  data: { sortOrder: idx + 1 },
                })
              )
            );

            const updatedDbProducts = await prisma.product.findMany({
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            });

            return NextResponse.json({
              success: true,
              message: 'Nomor urutan produk berhasil diubah',
              data: updatedDbProducts,
            });
          }
        } catch (err) {
          console.warn('[Reorder API] DB error updating single product order:', err);
        }
      }

      const updatedList = setFallbackProductOrder(product_id, newOrder);

      return NextResponse.json({
        success: true,
        message: 'Nomor urutan produk berhasil diubah',
        data: updatedList,
      });
    }

    return NextResponse.json(
      { error: 'Bad Request', message: 'Parameter tidak valid' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Reorder API Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
