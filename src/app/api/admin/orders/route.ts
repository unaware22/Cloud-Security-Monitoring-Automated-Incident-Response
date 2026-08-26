import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const paymentStatus = searchParams.get('payment_status');
  const deliveryStatus = searchParams.get('delivery_status');
  const search = searchParams.get('search');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20));
  const skip = (page - 1) * limit;

  const dbOnline = await isDatabaseOnline();

  if (dbOnline) {
    try {
      const where: any = {};

      if (paymentStatus && paymentStatus !== 'all') {
        where.paymentStatus = paymentStatus;
      }

      if (deliveryStatus && deliveryStatus !== 'all') {
        where.deliveryStatus = deliveryStatus;
      }

      if (search && search.trim()) {
        where.OR = [
          { orderCode: { contains: search.trim().toUpperCase() } },
          { customerEmail: { contains: search.trim(), mode: 'insensitive' } },
          { customerName: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            orderItems: {
              include: {
                product: {
                  select: { id: true, name: true, game: true, imageUrl: true },
                },
              },
            },
            paymentTransactions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            manualPaymentSubmissions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            digitalDeliveries: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.order.count({ where }),
      ]);

      if (orders && orders.length > 0) {
        const mappedOrders = orders.map((ord: any) => {
          let customerNotes: string | null = null;
          let customSkinDetails: any = null;
          try {
            const raw = ord.paymentTransactions?.[0]?.rawPayload;
            if (raw) {
              const parsed = JSON.parse(raw);
              customerNotes = parsed.customer_notes || parsed.notes || null;
              customSkinDetails = parsed.custom_skin_details || null;
            }
          } catch {}
          return {
            ...ord,
            customerNotes,
            notes: customerNotes,
            customSkinDetails,
          };
        });

        return NextResponse.json({
          success: true,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          data: mappedOrders,
        });
      }
    } catch {
      // Fallback below
    }
  }

  // Instant In-Memory Fallback
  let filtered = [...inMemoryOrders];

  if (paymentStatus && paymentStatus !== 'all') {
    filtered = filtered.filter((o) => o.paymentStatus === paymentStatus);
  }

  if (deliveryStatus && deliveryStatus !== 'all') {
    filtered = filtered.filter((o) => o.deliveryStatus === deliveryStatus);
  }

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    filtered = filtered.filter(
      (o) =>
        o.orderCode.toLowerCase().includes(s) ||
        o.customerEmail.toLowerCase().includes(s) ||
        o.customerName.toLowerCase().includes(s)
    );
  }

  return NextResponse.json({
    success: true,
    pagination: {
      page: 1,
      limit,
      total: filtered.length,
      totalPages: 1,
    },
    data: filtered,
  });
}
