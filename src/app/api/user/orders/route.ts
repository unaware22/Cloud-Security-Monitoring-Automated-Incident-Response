import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/user-auth';
import { customerOrderWhere, customerOrderSelect, deliveredContent } from '@/lib/customer-order';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Silakan login terlebih dahulu untuk melihat riwayat pesanan.' },
      { status: 401 }
    );
  }

  try {
    const orders = await prisma.order.findMany({
      where: customerOrderWhere(session),
      orderBy: { createdAt: 'desc' },
      select: customerOrderSelect,
    });

    const formattedOrders = orders.map((order) => {
      let paymentStatus = order.paymentStatus;
      let orderStatus = order.orderStatus;

      // Auto-cancel if unpaid after 15 minutes (expiredAt)
      if (paymentStatus === 'pending' && order.expiredAt && new Date() > order.expiredAt) {
        paymentStatus = 'expired';
        orderStatus = 'cancelled';
        prisma.order
          .updateMany({
            where: { id: order.id, paymentStatus: 'pending', paidAt: null },
            data: { paymentStatus: 'expired', orderStatus: 'cancelled' },
          })
          .catch(() => {});
      }

      const isPaid = ['paid', 'paid_manual', 'settlement', 'capture'].includes(paymentStatus);

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

      // Digital delivery content
      const deliveryContent = deliveredContent({ ...order, paymentStatus });

      // Check payment transaction payload for custom skin details or customer notes
      let customSkinDetails: any = null;
      let customerNotes: string | null = null;
      const latestTx = order.paymentTransactions[0];
      let snapToken: string | null = latestTx?.providerInvoiceId || null;
      let paymentUrl: string | null = latestTx?.paymentUrl || null;

      if (latestTx?.rawPayload) {
        try {
          const parsedPayload = JSON.parse(latestTx.rawPayload);
          if (!snapToken) {
            snapToken = parsedPayload.token || parsedPayload.snap_token || parsedPayload.snapToken || null;
          }
          if (!paymentUrl) {
            paymentUrl = parsedPayload.redirect_url || parsedPayload.payment_url || null;
          }
          if (parsedPayload.custom_skin_details) {
            customSkinDetails = parsedPayload.custom_skin_details;
          }
          if (parsedPayload.customer_notes) {
            customerNotes = parsedPayload.customer_notes;
          }
        } catch {}
      }

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
        orderStatus,
        paymentStatus,
        deliveryStatus: order.deliveryStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        items,
        orderItems: items,
        productName: primaryProductName,
        productImage: primaryProductImage,
        productSlug: primaryItem?.slug || '',
        deliveryContent,
        rawDelivery: deliveryContent,
        isPaid,
        customSkinDetails,
        customerNotes,
        snapToken,
        paymentUrl,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedOrders,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Gagal memuat riwayat pesanan.' },
      { status: 500 }
    );
  }
}
