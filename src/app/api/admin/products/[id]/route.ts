import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import {
  getFallbackProductById,
  updateFallbackProduct,
  deleteFallbackProduct,
} from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: params.id },
    });

    if (product) {
      return NextResponse.json({ success: true, data: product });
    }
  } catch (error) {}

  const fallback = getFallbackProductById(params.id);
  if (fallback) {
    return NextResponse.json({ success: true, data: fallback });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const body = await req.json();

  try {
    const existing = await prisma.product.findUnique({
      where: { id: params.id },
    });

    if (existing) {
      const updated = await prisma.product.update({
        where: { id: params.id },
        data: {
          name: body.name ?? existing.name,
          slug: body.slug ?? existing.slug,
          description: body.description ?? existing.description,
          price: body.price !== undefined ? Number(body.price) : existing.price,
          stock: body.stock !== undefined ? Number(body.stock) : existing.stock,
          sortOrder: body.sort_order !== undefined ? Number(body.sort_order) : (body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder),
          game: body.game ?? existing.game,
          subCategory1: body.sub_category_1 ?? existing.subCategory1,
          subCategory2: body.sub_category_2 !== undefined ? body.sub_category_2 : existing.subCategory2,
          deliveryType: body.delivery_type ?? existing.deliveryType,
          deliveryContent: body.delivery_content ?? existing.deliveryContent,
          imageUrl: body.image_url !== undefined ? body.image_url : existing.imageUrl,
          isActive: body.is_active !== undefined ? Boolean(body.is_active) : existing.isActive,
        },
      });

      try {
        await prisma.auditLog.create({
          data: {
            adminId: session.userId,
            action: 'PRODUCT_UPDATE',
            entityType: 'products',
            entityId: updated.id,
            oldValue: JSON.stringify(existing),
            newValue: JSON.stringify(updated),
            ipAddress: ip,
            userAgent,
          },
        });
      } catch {}

      updateFallbackProduct(params.id, {
        name: updated.name,
        slug: updated.slug,
        description: updated.description || '',
        price: updated.price,
        stock: updated.stock,
        sortOrder: updated.sortOrder,
        game: updated.game as any,
        subCategory1: updated.subCategory1,
        subCategory2: updated.subCategory2,
        deliveryType: updated.deliveryType as any,
        deliveryContent: updated.deliveryContent || '',
        imageUrl: updated.imageUrl,
        isActive: updated.isActive,
      });

      return NextResponse.json({ success: true, data: updated });
    }
  } catch (error) {}

  // Fallback update
  const updatedFallback = updateFallbackProduct(params.id, {
    name: body.name,
    slug: body.slug,
    description: body.description,
    price: body.price !== undefined ? Number(body.price) : undefined,
    discountPercent: body.discount_percent !== undefined ? Number(body.discount_percent) : undefined,
    originalPrice: body.original_price !== undefined ? Number(body.original_price) : undefined,
    stock: body.stock !== undefined ? Number(body.stock) : undefined,
    sortOrder: body.sort_order !== undefined ? Number(body.sort_order) : (body.sortOrder !== undefined ? Number(body.sortOrder) : undefined),
    game: body.game,
    subCategory1: body.sub_category_1,
    subCategory2: body.sub_category_2,
    deliveryType: body.delivery_type,
    deliveryContent: body.delivery_content,
    imageUrl: body.image_url,
    isActive: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
  });

  if (updatedFallback) {
    return NextResponse.json({ success: true, data: updatedFallback });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const body = await req.json().catch(() => ({}));

  try {
    const existing = await prisma.product.findUnique({
      where: { id: params.id },
    });

    if (existing) {
      const dataToUpdate: any = {};
      if (body.is_active !== undefined) {
        dataToUpdate.isActive = Boolean(body.is_active);
      }
      if (body.sort_order !== undefined || body.sortOrder !== undefined) {
        dataToUpdate.sortOrder = Number(body.sort_order ?? body.sortOrder);
      }
      if (Object.keys(dataToUpdate).length === 0) {
        dataToUpdate.isActive = !existing.isActive;
      }

      const updated = await prisma.product.update({
        where: { id: params.id },
        data: dataToUpdate,
      });

      try {
        await prisma.auditLog.create({
          data: {
            adminId: session.userId,
            action: 'PRODUCT_PATCH',
            entityType: 'products',
            entityId: updated.id,
            oldValue: JSON.stringify(existing),
            newValue: JSON.stringify(updated),
            ipAddress: ip,
            userAgent,
          },
        });
      } catch {}

      updateFallbackProduct(params.id, {
        isActive: updated.isActive,
        sortOrder: updated.sortOrder,
      });

      return NextResponse.json({
        success: true,
        message: 'Produk berhasil diperbarui',
        data: updated,
      });
    }
  } catch (error) {}

  // Fallback patch
  const fallback = getFallbackProductById(params.id);
  if (fallback) {
    const updatedData: Partial<any> = {};
    if (body.is_active !== undefined) {
      updatedData.isActive = Boolean(body.is_active);
    }
    if (body.sort_order !== undefined || body.sortOrder !== undefined) {
      updatedData.sortOrder = Number(body.sort_order ?? body.sortOrder);
    }
    if (Object.keys(updatedData).length === 0) {
      updatedData.isActive = !fallback.isActive;
    }

    const updated = updateFallbackProduct(params.id, updatedData);
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil diperbarui',
      data: updated,
    });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  try {
    const existing = await prisma.product.findUnique({
      where: { id: params.id },
    });

    if (existing) {
      try {
        await prisma.orderItem.deleteMany({
          where: { productId: params.id },
        });
      } catch {}

      await prisma.product.delete({
        where: { id: params.id },
      });

      // Write Audit Log
      try {
        await prisma.auditLog.create({
          data: {
            adminId: session.userId,
            action: 'PRODUCT_DELETE',
            entityType: 'products',
            entityId: existing.id,
            oldValue: JSON.stringify(existing),
            ipAddress: ip,
            userAgent,
          },
        });
      } catch {}

      // Normalize sortOrder in DB
      try {
        const remaining = await prisma.product.findMany({
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
        await prisma.$transaction(
          remaining.map((prod, idx) =>
            prisma.product.update({
              where: { id: prod.id },
              data: { sortOrder: idx + 1 },
            })
          )
        );
      } catch {}

      deleteFallbackProduct(params.id);

      return NextResponse.json({
        success: true,
        message: 'Produk berhasil dihapus',
      });
    }
  } catch (error) {}

  const deletedFallback = deleteFallbackProduct(params.id);
  if (deletedFallback) {
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus',
    });
  }

  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}
