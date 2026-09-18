import crypto from 'crypto';

export interface CreateSnapTransactionParams {
  orderId: string;
  grossAmount: number;
  productPrice?: number;
  feeAmount?: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  productName: string;
  productId?: string;
  quantity?: number;
  paymentMethod?: string;
}

export interface SnapTransactionResponse {
  token: string;
  redirectUrl: string;
  orderId: string;
}

export interface MidtransCancelResult {
  cancelled: boolean;
  notFound: boolean;
  statusCode: number;
  message: string;
  transactionStatus?: string;
}

export interface MidtransStatusResponse {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  payment_type: string;
  transaction_time: string;
  transaction_status:
    | 'capture'
    | 'settlement'
    | 'pending'
    | 'deny'
    | 'cancel'
    | 'expire'
    | 'refund'
    | 'chargeback';
  fraud_status?: 'accept' | 'challenge' | 'deny';
  signature_key?: string;
}

/**
 * Calculates admin/gateway payment fee: Rp 750 + 0.7% of product subtotal.
 */
export function calculatePaymentFee(productPrice: number): {
  fixedFee: number;
  percentFee: number;
  totalFee: number;
  totalWithFee: number;
} {
  const fixedFee = 750;
  const percentFee = Math.round(productPrice * 0.007); // 0.7%
  const totalFee = fixedFee + percentFee;
  const totalWithFee = productPrice + totalFee;

  return {
    fixedFee,
    percentFee,
    totalFee,
    totalWithFee,
  };
}

/**
 * Returns Midtrans base URLs according to environment.
 */
function getMidtransUrls(serverKey?: string) {
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  return {
    isProduction,
    snapUrl: isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
    apiUrl: isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2',
  };
}

/**
 * Map our checkout payment method to Midtrans Snap enabled_payments
 */
export function getMidtransEnabledPayments(method?: string): string[] | undefined {
  if (!method) return undefined;
  const m = method.toLowerCase();

  const methodMap: Record<string, string[]> = {
    // QRIS (Midtrans Sandbox uses 'other_qris', 'gopay', 'shopeepay' with QRIS acquirer)
    qris: ['other_qris', 'gopay'],
    // E-Wallets
    gopay: ['gopay', 'other_qris'],
    shopeepay: ['shopeepay', 'other_qris'],
    dana: ['dana', 'other_qris', 'gopay'],
    ovo: ['ovo', 'other_qris', 'gopay'],
    // Virtual Accounts
    va_bca: ['bca_va'],
    bca: ['bca_va'],
    va_bri: ['bri_va'],
    bri: ['bri_va'],
    va_mandiri: ['echannel'],
    mandiri: ['echannel'],
    va_bni: ['bni_va'],
    bni: ['bni_va'],
    va_permata: ['permata_va'],
    permata: ['permata_va'],
    va_bsi: ['bsi_va', 'other_va'],
    bsi: ['bsi_va', 'other_va'],
    va_cimb: ['cimb_va'],
    cimb: ['cimb_va'],
    // Retail
    alfamart: ['alfamart'],
    indomaret: ['indomaret'],
  };

  return methodMap[m] || undefined;
}

/**
 * Creates a Snap transaction token and hosted payment URL in Midtrans Sandbox / Production.
 */
export async function createMidtransSnapTransaction(
  params: CreateSnapTransactionParams
): Promise<SnapTransactionResponse> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
  const { snapUrl } = getMidtransUrls(serverKey);

  if (!serverKey || serverKey.includes('REPLACE_ME')) {
    throw new Error('MIDTRANS_SERVER_KEY is not configured');
  }

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

  const quantity = params.quantity || 1;
  const prodPrice = params.productPrice ?? (params.feeAmount ? params.grossAmount - params.feeAmount : params.grossAmount);

  const itemDetails: any[] = [
    {
      id: params.productId || 'prod-item',
      price: Math.round(prodPrice / quantity),
      quantity,
      name: params.productName.substring(0, 50),
    },
  ];

  if (params.feeAmount && params.feeAmount > 0) {
    itemDetails.push({
      id: 'admin-fee',
      price: Math.round(params.feeAmount),
      quantity: 1,
      name: 'Biaya Layanan (Rp 750 + 0.7%)',
    });
  }

  const enabledPayments = getMidtransEnabledPayments(params.paymentMethod);

  const payload: any = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.grossAmount),
    },
    customer_details: {
      first_name: params.customerName,
      email: params.customerEmail,
      phone: params.customerPhone || undefined,
    },
    item_details: itemDetails,
    expiry: {
      unit: 'minute',
      duration: 15,
    },
    callbacks: {
      finish: `${baseUrl}/order/success/${params.orderId}`,
      unfinish: `${baseUrl}/order/success/${params.orderId}`,
      error: `${baseUrl}/check-order?order_code=${params.orderId}&status=error`,
    },
  };

  if (enabledPayments && enabledPayments.length > 0) {
    payload.enabled_payments = enabledPayments;
  }

  if (!enabledPayments || enabledPayments.includes('gopay')) {
    payload.gopay = {
      enable_callback: true,
      callback_url: `${baseUrl}/order/success/${params.orderId}`,
    };
  }

  if (!enabledPayments || enabledPayments.includes('shopeepay')) {
    payload.shopeepay = {
      callback_url: `${baseUrl}/order/success/${params.orderId}`,
    };
  }

  const res = await fetch(snapUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[Midtrans Snap Error]:', res.status, errorText);
    throw new Error(`Midtrans API responded with status ${res.status}`);
  }

  const data = await res.json();
  if (!data.token || !data.redirect_url) {
    throw new Error('Midtrans API returned an incomplete Snap response');
  }

  return {
    token: data.token,
    redirectUrl: data.redirect_url,
    orderId: params.orderId,
  };
}

/**
 * Cancels an unsettled Midtrans transaction. A missing transaction is safe for
 * a locally-created order whose Snap token has never been used by the buyer.
 */
export async function cancelMidtransTransaction(
  orderId: string
): Promise<MidtransCancelResult> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const { apiUrl } = getMidtransUrls(serverKey);

  if (!serverKey || serverKey.includes('REPLACE_ME')) {
    throw new Error('MIDTRANS_SERVER_KEY is not configured');
  }

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
  const res = await fetch(`${apiUrl}/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    cache: 'no-store',
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  const providerStatusCode = Number(data.status_code || res.status);
  const message = String(data.status_message || 'Midtrans cancellation request failed');

  return {
    cancelled:
      res.ok &&
      (data.transaction_status === 'cancel' || providerStatusCode === 200),
    notFound: res.status === 404 || providerStatusCode === 404,
    statusCode: providerStatusCode,
    message,
    transactionStatus: data.transaction_status,
  };
}

/**
 * Checks transaction status directly from Midtrans Status API.
 */
export async function checkMidtransTransactionStatus(
  orderId: string
): Promise<MidtransStatusResponse | null> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const { apiUrl } = getMidtransUrls(serverKey);

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

  try {
    const res = await fetch(`${apiUrl}/${encodeURIComponent(orderId)}/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      const errText = await res.text();
      console.warn(`[Midtrans Status Check] HTTP ${res.status}: ${errText}`);
      return null;
    }

    const data: MidtransStatusResponse = await res.json();
    return data;
  } catch (err) {
    console.error('[Midtrans checkTransactionStatus Error]:', err);
    return null;
  }
}

/**
 * Checks Snap transaction token status directly from Midtrans Snap API.
 * In Midtrans Snap, a completed/settled transaction returns 409 {"error_messages":["transaction has been succeed"]}.
 */
export async function checkMidtransSnapTokenStatus(
  token: string
): Promise<{ isPaid: boolean; rawStatus?: string }> {
  if (!token) return { isPaid: false };
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const snapHost = isProduction
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';

  try {
    const res = await fetch(`${snapHost}/snap/v1/transactions/${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const text = await res.text();
    if (
      text.includes('transaction has been succeed') ||
      text.includes('settlement') ||
      text.includes('capture')
    ) {
      return { isPaid: true, rawStatus: 'settlement' };
    }

    return { isPaid: false };
  } catch (err) {
    console.warn('[Midtrans checkMidtransSnapTokenStatus Error]:', err);
    return { isPaid: false };
  }
}

/**
 * Validates Midtrans Webhook SHA-512 Signature Key.
 * Formula: SHA512(order_id + status_code + gross_amount + ServerKey)
 */
export function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const rawPayload = `${params.orderId}${params.statusCode}${params.grossAmount}${serverKey}`;
  const expectedHash = crypto.createHash('sha512').update(rawPayload).digest('hex');

  return expectedHash.toLowerCase() === params.signatureKey.toLowerCase();
}
