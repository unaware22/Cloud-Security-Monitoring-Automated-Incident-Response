import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { isInMemoryFallbackEnabled } from '@/lib/db-store';
import { invalidatePublicProductCatalog } from '@/lib/public-product-catalog';
import { firstValidationMessage, ProductWriteSchema } from '@/lib/product-validation';
import { withProductImageUrl } from '@/lib/product-image';
import {
  deleteFallbackProduct,
  getFallbackProductById,
  updateFallbackProduct,
} from '@/lib/products-store';

export const dynamic = 'force-dynamic';

function databaseError(operation: string, error: unknown) {
  console.error(`[Admin Products] RDS ${operation} failed:`, error);
  return NextResponse.json(
    {
      error: 'Database Error',
      message: `Produk gagal ${operation} di RDS. Periksa migration dan log aplikasi.`,
    },
    { status: 500 }
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: params.id } });
    if (product) {
      return NextResponse.json({
        success: true,
        data: withProductImageUrl(product),
        source: 'rds',
      });
    }
    return NextResponse.json({ error: 'Not Found', message: 'Produk tidak ditemukan' }, { status: 404 });
  } catch (error) {
    if (!isInMemoryFallbackEnabled()) return databaseError('dibaca', error);
  }

  const fallback = getFallbackProductById(params.id);
  if (fallback) {
    return NextResponse.json({
      success: true,
      data: withProductImageUrl(fallback),
      source: 'development-fallback',
    });
  }
  return NextResponse.json({ error: 'Not Found', message: 'Produk tidak ditemukan' }, { status: 404 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => null);
  const parseResult = ProductWriteSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: firstValidationMessage(parseResult.error),
        details: parseResult.error.errors,
      },
      { status: 422 }
    );
  }

  const body = parseResult.data;
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  try {
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Produk tidak ditemukan di RDS' },
        { status: 404 }
      );
    }

    const updated = await prisma.product.update({
      where: { id: params.id },
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        price: body.price,
        originalPrice: body.original_price,
        discountPercent: body.discount_percent,
        stock: body.stock,
        sortOrder: body.sort_order ?? existing.sortOrder,
        serviceTag: body.service_tag,
        soldCount: body.sold_count,
        productType: body.product_type,
        game: body.game,
        subCategory1: body.sub_category_1,
        subCategory2: body.sub_category_2,
        deliveryType: body.delivery_type,
        deliveryCategory: body.delivery_category,
        deliveryContent: body.delivery_content,
        imageUrl:
          body.image_url !== undefined ? body.image_url || null : existing.imageUrl,
        isActive: body.is_active,
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
    } catch (auditError) {
      console.warn('[Admin Products] Audit log write failed:', auditError);
    }

    invalidatePublicProductCatalog();
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil diperbarui di RDS',
      data: withProductImageUrl(updated),
      source: 'rds',
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Slug sudah digunakan produk lain' },
        { status: 409 }
      );
    }
    if (!isInMemoryFallbackEnabled()) return databaseError('diperbarui', error);
  }

  const updatedFallback = updateFallbackProduct(params.id, {
    name: body.name,
    slug: body.slug,
    description: body.description,
    price: body.price,
    originalPrice: body.original_price,
    discountPercent: body.discount_percent,
    stock: body.stock,
    sortOrder: body.sort_order,
    serviceTag: body.service_tag,
    soldCount: body.sold_count,
    productType: body.product_type,
    game: body.game,
    subCategory1: body.sub_category_1,
    subCategory2: body.sub_category_2,
    deliveryType: body.delivery_type,
    deliveryCategory: body.delivery_category ?? undefined,
    deliveryContent: body.delivery_content,
    imageUrl: body.image_url,
    isActive: body.is_active,
  });

  if (updatedFallback) {
    return NextResponse.json({
      success: true,
      data: withProductImageUrl(updatedFallback),
      source: 'development-fallback',
    });
  }
  return NextResponse.json({ error: 'Not Found', message: 'Produk tidak ditemukan' }, { status: 404 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';

  try {
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Produk tidak ditemukan di RDS' },
        { status: 404 }
      );
    }

    const dataToUpdate: any = {};
    if (body.is_active !== undefined) dataToUpdate.isActive = Boolean(body.is_active);
    if (body.sort_order !== undefined || body.sortOrder !== undefined) {
      const sortOrder = Number(body.sort_order ?? body.sortOrder);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return NextResponse.json(
          { error: 'Validation Error', message: 'Urutan produk tidak valid' },
          { status: 422 }
        );
      }
      dataToUpdate.sortOrder = sortOrder;
    }
    if (body.service_tag !== undefined || body.serviceTag !== undefined) {
      dataToUpdate.serviceTag = body.service_tag ?? body.serviceTag;
    }
    if (body.sold_count !== undefined || body.soldCount !== undefined) {
      dataToUpdate.soldCount = body.sold_count ?? body.soldCount;
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
    } catch (auditError) {
      console.warn('[Admin Products] Audit log write failed:', auditError);
    }

    invalidatePublicProductCatalog();
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil diperbarui di RDS',
      data: withProductImageUrl(updated),
      source: 'rds',
    });
  } catch (error) {
    if (!isInMemoryFallbackEnabled()) return databaseError('diperbarui', error);
  }

  const fallback = getFallbackProductById(params.id);
  if (!fallback) {
    return NextResponse.json({ error: 'Not Found', message: 'Produk tidak ditemukan' }, { status: 404 });
  }

  const updatedData: any = {};
  if (body.is_active !== undefined) updatedData.isActive = Boolean(body.is_active);
  if (body.sort_order !== undefined || body.sortOrder !== undefined) {
    updatedData.sortOrder = Number(body.sort_order ?? body.sortOrder);
  }
  if (body.service_tag !== undefined || body.serviceTag !== undefined) {
    updatedData.serviceTag = body.service_tag ?? body.serviceTag;
  }
  if (body.sold_count !== undefined || body.soldCount !== undefined) {
    updatedData.soldCount = body.sold_count ?? body.soldCount;
  }
  if (Object.keys(updatedData).length === 0) updatedData.isActive = !fallback.isActive;

  const updated = updateFallbackProduct(params.id, updatedData);
  return NextResponse.json({
    success: true,
    message: 'Produk berhasil diperbarui',
    data: updated,
    source: 'development-fallback',
  });
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
    const existing = await prisma.product.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Produk tidak ditemukan di RDS' },
        { status: 404 }
      );
    }

    await prisma.orderItem.deleteMany({ where: { productId: params.id } });
    await prisma.product.delete({ where: { id: params.id } });

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
    } catch (auditError) {
      console.warn('[Admin Products] Audit log write failed:', auditError);
    }

    const remaining = await prisma.product.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    await prisma.$transaction(
      remaining.map((product, index) =>
        prisma.product.update({ where: { id: product.id }, data: { sortOrder: index + 1 } })
      )
    );

    invalidatePublicProductCatalog();
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus dari RDS',
      source: 'rds',
    });
  } catch (error) {
    if (!isInMemoryFallbackEnabled()) return databaseError('dihapus', error);
  }

  const deletedFallback = deleteFallbackProduct(params.id);
  if (deletedFallback) {
    return NextResponse.json({
      success: true,
      message: 'Produk berhasil dihapus',
      source: 'development-fallback',
    });
  }
  return NextResponse.json({ error: 'Not Found', message: 'Produk tidak ditemukan' }, { status: 404 });
}
