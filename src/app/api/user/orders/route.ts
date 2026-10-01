import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { customerOrderWhere, customerOrderSummarySelect } from '@/lib/customer-order';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestStartedAt = performance.now();
  const session = await getCustomerSession(req);
  const authDuration = performance.now() - requestStartedAt;
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Silakan login terlebih dahulu untuk melihat riwayat pesanan.' },
      { status: 401 }
    );
  }

  try {
    const queryStartedAt = performance.now();
    const orders = await prisma.order.findMany({
      where: customerOrderWhere(session),
      orderBy: { createdAt: 'desc' },
      select: customerOrderSummarySelect,
    });
    const queryDuration = performance.now() - queryStartedAt;
    const formatStartedAt = performance.now();

    const formattedOrders = orders.map((order) => {
      // Only the expiry worker may change payment state after checking Midtrans.
      const isPaid = ['paid', 'paid_manual', 'settlement', 'capture'].includes(order.paymentStatus);

      // Map individual items with their snapshots and product relations
      const items = order.orderItems.map((item) => {
        const productName = item.productNameSnapshot || item.product?.name || 'Produk Digital';
        const price = item.priceSnapshot || 0;
        const quantity = item.quantity || 1;
        const subtotal = item.subtotal || price * quantity;
        const imageUrl = item.product?.imageUrl || '/images/products/default.png';

        return {
          id: item.id,
          productId: item.productId,
          productName,
          price,
          quantity,
          subtotal,
          imageUrl,
          slug: item.product?.slug || '',
          game: item.product?.game || 'minecraft',
          deliveryType: item.product?.deliveryType || 'automatic',
          serviceTag: item.product?.serviceTag || 'proses-instant',
        };
      });

      // Calculate totals
      const productSubtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
      const discountAmount = order.discountAmount || 0;
      const totalAmount = order.totalAmount || 0;
      const adminFee = Math.max(0, totalAmount - Math.max(0, productSubtotal - discountAmount));

      // Primary product info for fast card display
      const primaryItem = items[0];
      const otherCount = items.length - 1;
      const primaryProductName = primaryItem
        ? otherCount > 0
          ? `${primaryItem.productName} (+${otherCount} produk lainnya)`
          : primaryItem.productName
        : 'Produk Digital';
      const primaryProductImage = primaryItem?.imageUrl || '/images/products/default.png';

      const latestTx = order.paymentTransactions[0];
      const snapToken = order.paymentStatus === 'pending' ? latestTx?.providerInvoiceId || null : null;
      const paymentUrl = order.paymentStatus === 'pending' ? latestTx?.paymentUrl || null : null;

      return {
        id: order.id,
        orderCode: order.orderCode,
        order_code: order.orderCode,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        totalAmount,
        totalPrice: totalAmount, // for full backward-compat
        productSubtotal,
        discountAmount,
        adminFee,
        voucherCode: order.voucherCode,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveryStatus: order.deliveryStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        items,
        orderItems: items,
        productName: primaryProductName,
        productImage: primaryProductImage,
        productSlug: primaryItem?.slug || '',
        isPaid,
        snapToken,
        paymentUrl,
      };
    });
    const formatDuration = performance.now() - formatStartedAt;

    return NextResponse.json({
      success: true,
      data: formattedOrders,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Server-Timing': `auth;dur=${authDuration.toFixed(1)}, db;dur=${queryDuration.toFixed(1)}, format;dur=${formatDuration.toFixed(1)}`,
      },
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memuat riwayat pesanan.' },
      { status: 500 }
    );
  }
}
