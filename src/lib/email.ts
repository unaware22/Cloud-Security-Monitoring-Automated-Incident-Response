import nodemailer from 'nodemailer';
import { prisma } from './prisma';
import { parseDeliveryContent } from './delivery-parser';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

function formatEmailDeliveryHtml(deliveryContent: string): string {
  const items = parseDeliveryContent(deliveryContent);
  if (items.length === 0) {
    return `<pre style="margin: 0; white-space: pre-wrap; font-family: inherit; color: #38bdf8; font-weight: 600;">${deliveryContent}</pre>`;
  }

  return items
    .map((item, idx) => {
      const unitHeader =
        items.length > 1
          ? `<div style="font-size: 11px; color: #94a3b8; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 4px;">UNIT #${idx + 1}</div>`
          : '';

      if (item.category === 'account') {
        return `
          <div style="margin-bottom: ${idx < items.length - 1 ? '16px' : '0'}; padding-bottom: ${idx < items.length - 1 ? '16px' : '0'}; ${idx < items.length - 1 ? 'border-bottom: 1px dashed #334155;' : ''}">
            ${unitHeader}
            <div style="margin-bottom: 8px;">
              <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: bold;">Email / Username Akun:</span><br/>
              <strong style="color: #38bdf8; font-size: 14px; font-family: monospace;">${item.email || '-'}</strong>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: bold;">Password Akun:</span><br/>
              <strong style="color: #f59e0b; font-size: 14px; font-family: monospace;">${item.password || '-'}</strong>
            </div>
            ${
              item.notes
                ? `<div style="font-size: 12px; color: #cbd5e1; margin-top: 6px; background-color: #1e293b; padding: 8px; border-radius: 4px;"><strong style="color: #4ade80;">Catatan:</strong> ${item.notes}</div>`
                : ''
            }
          </div>
        `;
      }

      if (item.category === 'redeem_code') {
        return `
          <div style="margin-bottom: ${idx < items.length - 1 ? '16px' : '0'}; padding-bottom: ${idx < items.length - 1 ? '16px' : '0'}; ${idx < items.length - 1 ? 'border-bottom: 1px dashed #334155;' : ''}">
            ${unitHeader}
            <div style="margin-bottom: 8px;">
              <span style="color: #fbbf24; font-size: 11px; text-transform: uppercase; font-weight: bold;">Kode Redeem / Lisensi:</span><br/>
              <strong style="color: #fbbf24; font-size: 15px; font-family: monospace; letter-spacing: 1px; background-color: #451a03; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 4px;">${item.code || '-'}</strong>
            </div>
            ${
              item.notes
                ? `<div style="font-size: 12px; color: #cbd5e1; margin-top: 6px; background-color: #1e293b; padding: 8px; border-radius: 4px;"><strong style="color: #38bdf8;">Catatan / Panduan:</strong> ${item.notes}</div>`
                : ''
            }
          </div>
        `;
      }

      // Category: Roblox
      return `
        <div style="margin-bottom: ${idx < items.length - 1 ? '16px' : '0'}; padding-bottom: ${idx < items.length - 1 ? '16px' : '0'}; ${idx < items.length - 1 ? 'border-bottom: 1px dashed #334155;' : ''}">
          ${unitHeader}
          <div style="margin-bottom: 10px;">
            <span style="color: #fbbf24; font-size: 11px; text-transform: uppercase; font-weight: bold;">1. Username Roblox Penjual (Wajib Di-Add):</span><br/>
            <strong style="color: #fbbf24; font-size: 14px; font-family: monospace; background-color: #451a03; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 4px;">${item.robloxUsername || '-'}</strong>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">*Silakan add friend username di atas di Roblox.</div>
          </div>
          ${
            item.privateServerUrl
              ? `
            <div style="margin-bottom: 10px;">
              <span style="color: #38bdf8; font-size: 11px; text-transform: uppercase; font-weight: bold;">2. Link World Private Server:</span><br/>
              <a href="${item.privateServerUrl}" target="_blank" style="color: #38bdf8; font-size: 12px; word-break: break-all; text-decoration: underline;">${item.privateServerUrl}</a>
            </div>
          `
              : ''
          }
          ${
            item.notes
              ? `<div style="font-size: 12px; color: #cbd5e1; margin-top: 6px; background-color: #1e293b; padding: 8px; border-radius: 4px;"><strong style="color: #4ade80;">3. Catatan / Petunjuk Trade:</strong> ${item.notes}</div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

/**
 * Universal email dispatcher via Gmail SMTP with fallback
 */
async function dispatchEmail(payload: EmailPayload): Promise<{
  success: boolean;
  messageId?: string;
  provider: 'smtp' | 'mock';
  error?: string;
}> {
  const defaultFrom =
    process.env.SMTP_FROM ||
    `SALADINSHOP <${process.env.SMTP_USER || 'official@saladinshop.com'}>`;
  const from = payload.from || defaultFrom;

  const isSmtpConfigured =
    process.env.SMTP_USER &&
    !process.env.SMTP_USER.includes('placeholder') &&
    process.env.SMTP_PASS &&
    !process.env.SMTP_PASS.includes('placeholder');

  if (isSmtpConfigured) {
    try {
      const isGmail =
        process.env.SMTP_HOST?.includes('gmail') ||
        process.env.SMTP_USER?.includes('@gmail.com');

      const transporter = isGmail
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 465,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });

      const info = await transporter.sendMail({
        from,
        to: payload.to,
        replyTo: process.env.SMTP_USER || from,
        subject: payload.subject,
        html: payload.html,
        headers: {
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          'Precedence': 'bulk',
        },
      });

      console.log(`[GMAIL SMTP SUCCESS] Sent email to ${payload.to} | Message ID: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp',
      };
    } catch (smtpErr: any) {
      console.error('Gmail SMTP email error:', smtpErr);
    }
  }

  // Fallback: Simulated mock delivery
  const mockId = `mock-msg-${Date.now()}`;
  console.log(`[SIMULATED EMAIL DISPATCH] Sent to ${payload.to} | Subject: "${payload.subject}"`);
  return {
    success: true,
    messageId: mockId,
    provider: 'mock',
  };
}

// Social Media Icons HTML for TikTok & Instagram
const SOCIAL_MEDIA_FOOTER_HTML = `
  <div style="text-align: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid #222222;">
    <p style="color: #666666; font-size: 11px; margin-bottom: 12px; font-family: Arial, sans-serif;">Ikuti Kami di Media Sosial:</p>
    <div style="display: inline-block;">
      <!-- TikTok -->
      <a href="https://www.tiktok.com/@saladinshop" target="_blank" style="display: inline-block; width: 34px; height: 34px; line-height: 34px; text-align: center; background: #1c1c1e; border-radius: 50%; margin: 0 8px; text-decoration: none; border: 1px solid #333333;">
        <img src="https://cdn.simpleicons.org/tiktok/ffffff" alt="TikTok" width="16" height="16" style="vertical-align: middle; margin-top: -2px;" />
      </a>
      <!-- Instagram -->
      <a href="https://www.instagram.com/saladinshop" target="_blank" style="display: inline-block; width: 34px; height: 34px; line-height: 34px; text-align: center; background: #1c1c1e; border-radius: 50%; margin: 0 8px; text-decoration: none; border: 1px solid #333333;">
        <img src="https://cdn.simpleicons.org/instagram/ffffff" alt="Instagram" width="16" height="16" style="vertical-align: middle; margin-top: -2px;" />
      </a>
    </div>
    <p style="color: #555555; font-size: 11px; margin-top: 16px; font-family: Arial, sans-serif;">
      &copy; 2026 SALADINSHOP. All rights reserved.
    </p>
  </div>
`;

interface SendDeliveryParams {
  orderId: string;
  recipientEmail: string;
  orderCode: string;
  productName: string;
  deliveryContent: string;
}

/**
 * 1. Sends instant delivery credentials email for digital products (Matches Screenshot exactly).
 */
export async function sendDigitalDelivery(params: SendDeliveryParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { orderId, recipientEmail, orderCode, productName, deliveryContent } = params;
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  try {
    const emailResult = await dispatchEmail({
      to: recipientEmail,
      subject: `[SALADINSHOP] Pengiriman Akun Digital - Pesanan #${orderCode}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>SALADINSHOP - Pembayaran Berhasil</title>
        </head>
        <body style="margin: 0; padding: 24px 12px; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
          
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #121214; border-radius: 12px; border: 1px solid #222226; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
            
            <!-- Body Container -->
            <tr>
              <td style="padding: 32px 28px 24px 28px; text-align: center;">
                
                <!-- SALADINSHOP Header -->
                <h1 style="color: #ffc825; font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 16px 0; font-family: Arial, sans-serif;">
                  SALADINSHOP
                </h1>

                <!-- Pembayaran Berhasil Title -->
                <h2 style="color: #22c55e; font-size: 22px; font-weight: 800; margin: 0 0 10px 0;">
                  Pembayaran Berhasil! 🎉
                </h2>

                <!-- Subtitle Description -->
                <p style="color: #cccccc; font-size: 13px; line-height: 1.6; margin: 0 0 24px 0;">
                  Terima kasih telah berbelanja di <strong style="color: #ffffff;">SALADINSHOP</strong>. Berikut adalah rincian produk digital pesanan Anda:
                </p>

                <!-- Box 1: Order Details (Dark Gray Card) -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #1f2227; border-radius: 8px; border: 1px solid #2e3238; margin-bottom: 20px; text-align: left;">
                  <tr>
                    <td style="padding: 16px 18px;">
                      <p style="margin: 0 0 6px 0; font-size: 13px; color: #ffffff;">
                        <strong style="color: #ffffff;">Kode Pesanan:</strong> <span style="font-family: monospace; color: #e2e8f0; font-weight: bold;">${orderCode}</span>
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #ffffff;">
                        <strong style="color: #ffffff;">Produk:</strong> <span style="color: #cbd5e1;">${productName}</span>
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Box 2: Digital Delivery Data (Navy Header + Formatted Content) -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-radius: 8px; overflow: hidden; border: 1px solid #1e3a6a; margin-bottom: 24px; text-align: left;">
                  <!-- Header -->
                  <tr>
                    <td style="background-color: #14284b; padding: 12px 18px; border-bottom: 1px solid #1e3a6a;">
                      <span style="color: #ffffff; font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">
                        Data Pengiriman Produk Digital:
                      </span>
                    </td>
                  </tr>
                  <!-- Content Body -->
                  <tr>
                    <td style="background-color: #0a0d14; padding: 18px; color: #e2e8f0; font-size: 13px; line-height: 1.6;">
                      ${formatEmailDeliveryHtml(deliveryContent)}
                    </td>
                  </tr>
                </table>

                <!-- Login Now Button -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                  <tr>
                    <td>
                      <a href="https://www.minecraft.net/login" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #22c55e; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 8px; font-weight: 800; font-size: 14px; text-decoration: none; text-transform: none; letter-spacing: 0.5px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35);">
                        Login Now
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Cek Pesanan Link -->
                <p style="margin: 0 0 8px 0; text-align: center;">
                  <a href="${baseUrl}/check-order?order_code=${orderCode}&email=${encodeURIComponent(recipientEmail)}" target="_blank" style="color: #ffc825; font-size: 13px; font-weight: bold; text-decoration: underline;">
                    Cek Pesanan
                  </a>
                </p>

                <!-- Social Media Footer (TikTok & Instagram Only) -->
                ${SOCIAL_MEDIA_FOOTER_HTML}

              </td>
            </tr>
          </table>

        </body>
        </html>
      `,
    });

    // Record DigitalDelivery in database if online
    await prisma.digitalDelivery.create({
      data: {
        orderId,
        deliveryEmail: recipientEmail,
        deliveryStatus: 'delivered',
        deliveryData: deliveryContent,
        deliveredAt: new Date(),
      },
    }).catch(() => {});

    // Update order delivery status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryStatus: 'delivered',
        orderStatus: 'completed',
      },
    }).catch(() => {});

    return { success: true, messageId: emailResult.messageId };
  } catch (error: any) {
    console.error('Failed to send digital delivery:', error);

    await prisma.digitalDelivery.create({
      data: {
        orderId,
        deliveryEmail: recipientEmail,
        deliveryStatus: 'failed',
        errorMessage: error?.message || 'Unknown delivery failure',
      },
    }).catch(() => {});

    return { success: false, error: error?.message || 'Delivery error' };
  }
}

interface CustomSkinEmailParams {
  recipientEmail: string;
  orderCode: string;
  productName: string;
  customerName: string;
  customerPhone?: string;
  skinDetails?: {
    description?: string;
    skinSize?: string;
    skinModel?: string;
    referenceImageUrl?: string | null;
  };
}

/**
 * 2. Sends notification immediately after payment is confirmed for Custom Skin (Pembuatan Cepat) orders.
 * Informs customer that payment was received and skin is being crafted (~5 mins estimate).
 */
export async function sendCustomSkinProcessingEmail(params: CustomSkinEmailParams): Promise<{
  success: boolean;
  messageId?: string;
}> {
  const { recipientEmail, orderCode, productName, customerName, customerPhone, skinDetails } = params;
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  try {
    const emailResult = await dispatchEmail({
      to: recipientEmail,
      subject: `[SALADINSHOP] Pembayaran Berhasil - Pembuatan Skin Custom Sedang Diproses (#${orderCode})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>SALADINSHOP - Pembuatan Skin Sedang Diproses</title>
        </head>
        <body style="margin: 0; padding: 24px 12px; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
          
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #121214; border-radius: 12px; border: 1px solid #222226; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
            
            <tr>
              <td style="padding: 32px 28px 24px 28px; text-align: center;">
                
                <!-- Header -->
                <h1 style="color: #ffc825; font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 16px 0; font-family: Arial, sans-serif;">
                  SALADINSHOP
                </h1>

                <h2 style="color: #22c55e; font-size: 22px; font-weight: 800; margin: 0 0 10px 0;">
                  Pembayaran Berhasil! 🎉
                </h2>

                <p style="color: #cccccc; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
                  Halo <strong style="color: #ffffff;">${customerName}</strong>, terima kasih telah berbelanja di <strong style="color: #ffffff;">SALADINSHOP</strong>. Spesifikasi skin impian Anda telah kami terima dan saat ini <strong>sedang dalam proses pembuatan oleh desainer kami</strong>.
                </p>

                <!-- Estimasi Box -->
                <div style="background-color: #241a06; border-left: 4px solid #ffc825; border-radius: 6px; padding: 14px 16px; margin-bottom: 20px; text-align: left;">
                  <h4 style="margin: 0 0 6px 0; color: #ffc825; font-size: 13px; font-weight: 800;">
                    ⏱️ ESTIMASI PENGERJAAN: ~5 MENIT
                  </h4>
                  <p style="margin: 0; color: #fde68a; font-size: 12px; line-height: 1.5;">
                    File skin custom (.PNG resolusi tinggi) akan segera dikirimkan ke Email ini dan nomor WhatsApp Anda <strong>(${customerPhone || '-'})</strong> setelah selesai.
                  </p>
                </div>

                <!-- Box 1: Order Details -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #1f2227; border-radius: 8px; border: 1px solid #2e3238; margin-bottom: 20px; text-align: left;">
                  <tr>
                    <td style="padding: 16px 18px;">
                      <p style="margin: 0 0 6px 0; font-size: 13px; color: #ffffff;">
                        <strong style="color: #ffffff;">Kode Pesanan:</strong> <span style="font-family: monospace; color: #e2e8f0; font-weight: bold;">${orderCode}</span>
                      </p>
                      <p style="margin: 0; font-size: 13px; color: #ffffff;">
                        <strong style="color: #ffffff;">Produk:</strong> <span style="color: #cbd5e1;">${productName}</span>
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Box 2: Skin Specifications -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-radius: 8px; overflow: hidden; border: 1px solid #1e3a6a; margin-bottom: 24px; text-align: left;">
                  <tr>
                    <td style="background-color: #14284b; padding: 12px 18px; border-bottom: 1px solid #1e3a6a;">
                      <span style="color: #ffffff; font-size: 13px; font-weight: 800; letter-spacing: 0.5px;">
                        📋 Rincian Permintaan Skin Custom:
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #0a0d14; padding: 16px 18px; color: #e2e8f0; font-size: 13px; line-height: 1.7;">
                      <p style="margin: 0 0 4px 0;"><strong style="color: #94a3b8;">Ukuran Skin:</strong> <span style="color: #38bdf8; font-weight: bold;">${skinDetails?.skinSize === '32x32' ? '32×32 px (Java & Bedrock)' : '64×64 px (Java & Bedrock)'}</span></p>
                      <p style="margin: 0 0 4px 0;"><strong style="color: #94a3b8;">Model Skin:</strong> <span style="color: #c084fc; font-weight: bold;">${skinDetails?.skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}</span></p>
                      <p style="margin: 0 0 8px 0;"><strong style="color: #94a3b8;">Gambar Referensi:</strong> <span style="color: #22c55e;">${skinDetails?.referenceImageUrl ? 'Tersedia (Uploaded)' : 'Tidak ada'}</span></p>
                      
                      ${skinDetails?.description ? `
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #1e293b;">
                          <span style="color: #94a3b8; font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">Deskripsi Permintaan:</span>
                          <pre style="background-color: #11141c; color: #cbd5e1; padding: 10px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; font-family: inherit; margin: 0; border: 1px solid #1e293b;">${skinDetails.description}</pre>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>

                <!-- Lacak Pesanan Button -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                  <tr>
                    <td>
                      <a href="${baseUrl}/order/success/${orderCode}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #22c55e; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 8px; font-weight: 800; font-size: 14px; text-decoration: none; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35);">
                        Lacak Status Pengerjaan &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Cek Pesanan Link -->
                <p style="margin: 0 0 8px 0; text-align: center;">
                  <a href="${baseUrl}/check-order?order_code=${orderCode}&email=${encodeURIComponent(recipientEmail)}" target="_blank" style="color: #ffc825; font-size: 13px; font-weight: bold; text-decoration: underline;">
                    Cek Pesanan
                  </a>
                </p>

                <!-- Social Media Footer (TikTok & Instagram Only) -->
                ${SOCIAL_MEDIA_FOOTER_HTML}

              </td>
            </tr>
          </table>

        </body>
        </html>
      `,
    });

    return { success: emailResult.success, messageId: emailResult.messageId };
  } catch (error: any) {
    console.error('Failed to send skin processing email:', error);
    return { success: false };
  }
}

/**
 * 3. Sends finished custom skin download link/content to customer when Admin completes manual delivery.
 */
export async function sendCustomSkinDeliveredEmail(params: {
  recipientEmail: string;
  orderCode: string;
  productName: string;
  customerName: string;
  skinDownloadUrl?: string;
  deliveryNotes?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const { recipientEmail, orderCode, productName, customerName, skinDownloadUrl, deliveryNotes } = params;
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  try {
    const emailResult = await dispatchEmail({
      to: recipientEmail,
      subject: `[SALADINSHOP] Skin Custom Kamu Sudah Jadi! - Pesanan #${orderCode}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>SALADINSHOP - Skin Custom Telah Selesai</title>
        </head>
        <body style="margin: 0; padding: 24px 12px; background-color: #0d0d0d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
          
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #121214; border-radius: 12px; border: 1px solid #222226; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
            
            <tr>
              <td style="padding: 32px 28px 24px 28px; text-align: center;">
                
                <!-- Header -->
                <h1 style="color: #ffc825; font-size: 22px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0 0 16px 0; font-family: Arial, sans-serif;">
                  SALADINSHOP
                </h1>

                <h2 style="color: #22c55e; font-size: 22px; font-weight: 800; margin: 0 0 10px 0;">
                  Skin Custom Kamu Sudah Jadi! 🚀
                </h2>

                <p style="color: #cccccc; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
                  Kabar gembira <strong style="color: #ffffff;">${customerName}</strong>! Skin Minecraft impian Anda untuk pesanan <strong>#${orderCode}</strong> telah selesai dirancang dengan teliti oleh tim desainer kami.
                </p>

                <!-- Box: Skin Result & Download -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-radius: 8px; overflow: hidden; border: 1px solid #1e3a6a; margin-bottom: 20px; text-align: left;">
                  <tr>
                    <td style="background-color: #14284b; padding: 12px 18px; border-bottom: 1px solid #1e3a6a;">
                      <span style="color: #ffffff; font-size: 13px; font-weight: 800;">
                        🎨 File Skin Minecraft (.PNG):
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #0a0d14; padding: 18px; color: #e2e8f0; font-size: 13px;">
                      <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 12px;">Format file PNG kualitas HD siap dipakai di Java & Bedrock Edition.</p>
                      
                      ${skinDownloadUrl ? `
                        <div style="background-color: #11141c; padding: 12px; border-radius: 6px; border: 1px solid #1e293b; margin-bottom: 12px;">
                          <a href="${skinDownloadUrl}" target="_blank" style="color: #38bdf8; font-family: monospace; font-size: 12px; word-break: break-all; text-decoration: underline;">${skinDownloadUrl}</a>
                        </div>
                      ` : ''}

                      ${deliveryNotes ? `
                        <div style="background-color: #181d26; padding: 12px; border-radius: 6px; border: 1px solid #1e293b;">
                          <strong style="color: #ffc825; font-size: 12px; display: block; margin-bottom: 4px;">Catatan Desainer:</strong>
                          <p style="margin: 0; color: #cbd5e1; font-size: 12px;">${deliveryNotes}</p>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>

                <!-- Download Action Button -->
                ${skinDownloadUrl ? `
                  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                    <tr>
                      <td>
                        <a href="${skinDownloadUrl}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #22c55e; color: #ffffff; text-align: center; padding: 14px 20px; border-radius: 8px; font-weight: 800; font-size: 14px; text-decoration: none; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35);">
                          Unduh File Skin (.PNG) &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                ` : ''}

                <!-- Cara Pasang di Minecraft -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #1f2227; border-radius: 8px; border: 1px solid #2e3238; margin-bottom: 20px; text-align: left;">
                  <tr>
                    <td style="padding: 14px 18px; font-size: 12px; color: #94a3b8;">
                      <strong style="color: #ffffff; display: block; margin-bottom: 6px;">Cara Pasang di Minecraft:</strong>
                      <ol style="margin: 0; padding-left: 18px; line-height: 1.6;">
                        <li>Buka Minecraft Launcher &rarr; Masuk ke menu <strong>Skins</strong>.</li>
                        <li>Klik <strong>New Skin</strong> &rarr; Pilih model (Classic / Slim).</li>
                        <li>Klik <strong>Browse</strong> dan pilih file .png yang sudah diunduh.</li>
                        <li>Klik <strong>Save & Use</strong>. Selesai!</li>
                      </ol>
                    </td>
                  </tr>
                </table>

                <!-- Cek Pesanan Link -->
                <p style="margin: 0 0 8px 0; text-align: center;">
                  <a href="${baseUrl}/check-order?order_code=${orderCode}&email=${encodeURIComponent(recipientEmail)}" target="_blank" style="color: #ffc825; font-size: 13px; font-weight: bold; text-decoration: underline;">
                    Cek Pesanan
                  </a>
                </p>

                <!-- Social Media Footer (TikTok & Instagram Only) -->
                ${SOCIAL_MEDIA_FOOTER_HTML}

              </td>
            </tr>
          </table>

        </body>
        </html>
      `,
    });

    return { success: emailResult.success, messageId: emailResult.messageId };
  } catch (error: any) {
    console.error('Failed to send skin delivered email:', error);
    return { success: false };
  }
}
