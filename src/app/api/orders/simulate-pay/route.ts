import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';
import { decrementProductStock } from '@/lib/products-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { order_code } = body;

    if (!order_code) {
      return NextResponse.json({ error: 'order_code is required' }, { status: 400 });
    }

    const upperCode = order_code.toUpperCase().trim();
    const dbOnline = await isDatabaseOnline();

    if (dbOnline) {
      try {
        const order = await prisma.order.findUnique({
          where: { orderCode: upperCode },
          include: { orderItems: true },
        });

        if (order) {
          const now = new Date();
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'paid_manual',
              orderStatus: 'completed',
              deliveryStatus: 'delivered',
              paidAt: now,
            },
          });

          const item = order.orderItems[0];
          if (item?.productId) {
            await prisma.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity || 1 } },
            }).catch(() => {});
          }

          return NextResponse.json({
            success: true,
            message: 'Simulasi pembayaran berhasil! Stok telah terpotong & produk digital aktif.',
          });
        }
      } catch {}
    }

    // In-Memory fallback
    const memoryOrder = inMemoryOrders.find((o) => o.orderCode === upperCode);
    if (!memoryOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    memoryOrder.paymentStatus = 'paid_manual';
    memoryOrder.orderStatus = 'completed';
    memoryOrder.deliveryStatus = 'delivered';
    memoryOrder.paidAt = new Date().toISOString();

    const prodId = memoryOrder.productId || (memoryOrder as any).product_id;
    if (prodId) {
      decrementProductStock(prodId, memoryOrder.quantity || 1);
    }

    return NextResponse.json({
      success: true,
      message: 'Simulasi pembayaran berhasil! Stok telah terpotong & data akun telah aktif.',
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
