import nodemailer from 'nodemailer';
import { prisma } from './prisma';

interface SendDeliveryParams {
  orderId: string;
  recipientEmail: string;
  orderCode: string;
  productName: string;
  deliveryContent: string;
}

export async function sendDigitalDelivery(params: SendDeliveryParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { orderId, recipientEmail, orderCode, productName, deliveryContent } = params;

  try {
    const isSmtpConfigured =
      process.env.SMTP_HOST &&
      !process.env.SMTP_HOST.includes('placeholder') &&
      process.env.SMTP_USER &&
      !process.env.SMTP_USER.includes('placeholder');

    let messageId = `mock-msg-${Date.now()}`;

    if (isSmtpConfigured) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@gamestore.local',
        to: recipientEmail,
        subject: `[GameStore] Pengiriman Produk Digital - Pesanan #${orderCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; padding: 24px; border-radius: 8px;">
            <h2 style="color: #10b981; margin-top: 0;">Pembayaran Berhasil!</h2>
            <p>Terima kasih telah berbelanja di GameStore. Berikut adalah rincian produk digital pesanan Anda:</p>
            <div style="background: #1e293b; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 4px 0;"><strong>Kode Pesanan:</strong> ${orderCode}</p>
              <p style="margin: 4px 0;"><strong>Produk:</strong> ${productName}</p>
            </div>
            <div style="background: #064e3b; border-left: 4px solid #10b981; padding: 16px; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #34d399;">Informasi Produk / Akun / Kode Redeem:</h3>
              <pre style="background: #022c22; color: #a7f3d0; padding: 12px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${deliveryContent}</pre>
            </div>
            <p style="font-size: 13px; color: #94a3b8;">Anda juga dapat melihat status dan data produk ini kapan saja di menu <a href="${process.env.APP_BASE_URL || 'http://localhost:3000'}/check-order" style="color: #38bdf8;">Cek Pesanan</a> dengan memasukkan Kode Pesanan dan Email Anda.</p>
          </div>
        `,
      });
      messageId = info.messageId;
    } else {
      console.log(`[SIMULATED EMAIL DELIVERY] Sent digital product to ${recipientEmail} for order ${orderCode}`);
    }

    // Record DigitalDelivery in database
    await prisma.digitalDelivery.create({
      data: {
        orderId,
        deliveryEmail: recipientEmail,
        deliveryStatus: 'delivered',
        deliveryData: deliveryContent,
        deliveredAt: new Date(),
      },
    });

    // Update order delivery status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: 'delivered',
        orderStatus: 'completed',
      },
    });

    return { success: true, messageId };
  } catch (error: any) {
    console.error('Failed to send digital delivery:', error);

    await prisma.digitalDelivery.create({
      data: {
        orderId,
        deliveryEmail: recipientEmail,
        deliveryStatus: 'failed',
        errorMessage: error?.message || 'Unknown delivery failure',
      },
    });

    return { success: false, error: error?.message || 'Delivery error' };
  }
}
