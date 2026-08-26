export interface CreateInvoiceParams {
  externalId: string; // orderCode
  payerEmail: string;
  description: string;
  amount: number;
  customerName: string;
  customerPhone?: string;
  paymentMethods?: string[]; // e.g. ['MANDIRI'], ['QRIS'], ['DANA'], ['OVO'], ['SHOPEEPAY'], ['ALFAMART']
}

export interface XenditInvoiceResponse {
  invoiceId: string;
  invoiceUrl: string;
  status: string;
  expiryDate: string;
}

/**
 * Creates an invoice in Xendit API with specific payment methods filter.
 * The invoice URL redirects the user to Xendit's hosted payment page
 * showing only the selected payment method(s).
 */
export async function createXenditInvoice(
  params: CreateInvoiceParams
): Promise<XenditInvoiceResponse> {
  const secretKey = process.env.XENDIT_SECRET_KEY;
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  // If secret key is not configured or in sandbox mock mode, provide simulation
  if (!secretKey || secretKey.includes('sample_key') || secretKey.startsWith('mock_')) {
    return {
      invoiceId: `mock-inv-${Date.now()}`,
      invoiceUrl: `${baseUrl}/check-order?order_code=${params.externalId}&status=mock`,
      status: 'PENDING',
      expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
    const payload: any = {
      external_id: params.externalId,
      amount: params.amount,
      payer_email: params.payerEmail,
      description: params.description,
      invoice_duration: 86400, // 24 hours
      customer: {
        given_names: params.customerName,
        email: params.payerEmail,
        mobile_number: params.customerPhone,
      },
      success_redirect_url: `${baseUrl}/order/success/${params.externalId}`,
      failure_redirect_url: `${baseUrl}/order/success/${params.externalId}?status=failed`,
    };

    if (params.paymentMethods && params.paymentMethods.length > 0) {
      payload.payment_methods = params.paymentMethods;
    }

    const res = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Xendit Invoice Creation Failed:', res.status, errBody);
      return {
        invoiceId: `inv-fallback-${Date.now()}`,
        invoiceUrl: `${baseUrl}/check-order?order_code=${params.externalId}&status=error`,
        status: 'PENDING',
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    const data = await res.json();
    return {
      invoiceId: data.id,
      invoiceUrl: data.invoice_url,
      status: data.status,
      expiryDate: data.expiry_date,
    };
  } catch (error) {
    console.error('Error contacting Xendit API:', error);
    return {
      invoiceId: `inv-local-${Date.now()}`,
      invoiceUrl: `${baseUrl}/check-order?order_code=${params.externalId}&status=error`,
      status: 'PENDING',
      expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}

/**
 * Validates Xendit Webhook Callback Token
 */
export function verifyXenditWebhookToken(tokenHeader: string | null): boolean {
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expectedToken) return false;
  if (!tokenHeader) return false;
  // Constant time comparison to prevent timing attacks
  if (tokenHeader.length !== expectedToken.length) return false;
  let result = 0;
  for (let i = 0; i < tokenHeader.length; i++) {
    result |= tokenHeader.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return result === 0;
}
