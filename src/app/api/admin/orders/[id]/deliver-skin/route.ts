import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { getClientIp } from '@/lib/security';
import { sendCustomSkinDeliveredEmail } from '@/lib/email';
import { isDatabaseOnline, inMemoryOrders } from '@/lib/db-store';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Admin session expired or invalid' }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const userAgent = req.headers.get('user-agent') || 'Unknown';
  const cleanId = decodeURIComponent(params.id || '').trim();

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const skinDownloadUrl = body.skin_download_url?.trim() || '';
  const deliveryNotes = body.delivery_notes?.trim() || '';

  if (!skinDownloadUrl && !deliveryNotes) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Harap masukkan link download file skin atau catatan pengiriman' },
      { status: 400 }
    );
  }

  const dbOnline = await isDatabaseOnline();
  const now = new Date();

  // 1. Try DB update
  if (dbOnline) {
    try {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { id: cleanId },
            { orderCode: cleanId },
            { orderCode: cleanId.toUpperCase() },
          ],
        },
        include: {
          orderItems: {
            include: { product: true },
          },
        },
      });

      if (order) {
        let validAdminId: string | null = null;
        try {
          const matchedAdmin = await prisma.adminUser.findFirst({
            where: {
              OR: [
                { id: session.userId },
                { email: session.email?.toLowerCase() },
              ],
            },
          });
          if (matchedAdmin) {
            validAdminId = matchedAdmin.id;
          } else {
            const anyAdmin = await prisma.adminUser.findFirst();
            validAdminId = anyAdmin?.id || null;
          }
        } catch {
          validAdminId = null;
        }

        const formattedDeliveryContent = `Skin File Download: ${skinDownloadUrl}${deliveryNotes ? ` | Catatan Desainer: ${deliveryNotes}` : ''} | Format: PNG (Ready for Java & Bedrock)`;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            orderStatus: 'completed',
            deliveryStatus: 'delivered',
            paymentStatus: order.paymentStatus === 'pending' || order.paymentStatus === 'pending_manual' ? 'paid_manual' : order.paymentStatus,
          },
        });

        await prisma.digitalDelivery
          .create({
            data: {
              orderId: order.id,
              deliveryEmail: order.customerEmail,
              deliveryStatus: 'delivered',
              deliveryData: formattedDeliveryContent,
              deliveredAt: now,
            },
          })
          .catch(() => {});

        // Send Email to Customer
        try {
          await sendCustomSkinDeliveredEmail({
            recipientEmail: order.customerEmail,
            orderCode: order.orderCode,
            productName: order.orderItems?.[0]?.productNameSnapshot || 'Custom Skin Minecraft',
            customerName: order.customerName,
            skinDownloadUrl,
            deliveryNotes,
          });
        } catch (emailErr) {
          console.warn('Failed sending skin delivery email:', emailErr);
        }

        // Audit log
        await prisma.auditLog
          .create({
            data: {
              adminId: validAdminId,
              action: 'CUSTOM_SKIN_DELIVERED',
              entityType: 'orders',
              entityId: order.id,
              newValue: JSON.stringify({
                skinDownloadUrl,
                deliveryNotes,
                deliveredAt: now.toISOString(),
              }),
              ipAddress: ip,
              userAgent,
            },
          })
          .catch(() => {});

        // Sync memory store
        const memOrder = inMemoryOrders.find(
          (o) => o.id === order.id || o.orderCode.toUpperCase() === order.orderCode.toUpperCase()
        );
        if (memOrder) {
          memOrder.orderStatus = 'completed';
          memOrder.deliveryStatus = 'delivered';
          memOrder.deliveryContent = formattedDeliveryContent;
          memOrder.delivery_content = formattedDeliveryContent;
        }

        return NextResponse.json({
          success: true,
          message: 'File skin custom berhasil dikirimkan ke email dan akun pembeli!',
        });
      }
    } catch (err) {
      console.warn('DB deliver-skin failed:', err);
    }
  }

  // 2. In-Memory fallback
  const memOrder = inMemoryOrders.find(
    (o) =>
      o.id === cleanId ||
      o.orderCode.toUpperCase() === cleanId.toUpperCase() ||
      o.orderCode.toLowerCase() === cleanId.toLowerCase()
  );

  if (memOrder) {
    const formattedDeliveryContent = `Skin File Download: ${skinDownloadUrl}${deliveryNotes ? ` | Catatan Desainer: ${deliveryNotes}` : ''} | Format: PNG (Ready for Java & Bedrock)`;

    memOrder.orderStatus = 'completed';
    memOrder.deliveryStatus = 'delivered';
    if (memOrder.paymentStatus === 'pending' || memOrder.paymentStatus === 'pending_manual') {
      memOrder.paymentStatus = 'paid_manual';
    }
    memOrder.deliveryContent = formattedDeliveryContent;
    memOrder.delivery_content = formattedDeliveryContent;
    memOrder.digital_delivery = {
      content: formattedDeliveryContent,
      delivered_at: now.toISOString(),
    };

    try {
      await sendCustomSkinDeliveredEmail({
        recipientEmail: memOrder.customerEmail,
        orderCode: memOrder.orderCode,
        productName: memOrder.orderItems?.[0]?.productNameSnapshot || 'Custom Skin Minecraft',
        customerName: memOrder.customerName,
        skinDownloadUrl,
        deliveryNotes,
      });
    } catch (emailErr) {
      console.warn('Failed sending skin delivery email in fallback:', emailErr);
    }

    return NextResponse.json({
      success: true,
      message: 'File skin custom berhasil dikirimkan ke email dan akun pembeli!',
    });
  }

  return NextResponse.json({ error: 'Not Found', message: `Pesanan (${cleanId}) tidak ditemukan` }, { status: 404 });
}
