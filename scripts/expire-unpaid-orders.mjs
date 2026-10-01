import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

const SCAN_INTERVAL_MS = 30_000;
const MAX_ORDERS_PER_SCAN = 50;

/** Do not expire an order when Midtrans cannot be reached or authenticated. */
export async function getGatewayState(orderCode, serverKey, fetchImpl = fetch) {
  const base = process.env.MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://api.midtrans.com/v2'
    : 'https://api.sandbox.midtrans.com/v2';
  const authorization = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
  const headers = { Accept: 'application/json', Authorization: authorization };
  const orderPath = encodeURIComponent(orderCode);

  try {
    const statusResponse = await fetchImpl(`${base}/${orderPath}/status`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (statusResponse.status !== 404 && !statusResponse.ok) {
      return { safeToExpire: false, reason: `Status API HTTP ${statusResponse.status}` };
    }

    const statusWasFound = statusResponse.ok;
    if (statusWasFound) {
      const status = await statusResponse.json();
      if (status.order_id !== orderCode) {
        return { safeToExpire: false, reason: 'Midtrans order ID mismatch' };
      }
      if (['settlement', 'capture'].includes(status.transaction_status)) {
        return { safeToExpire: false, reason: 'Payment received; wait for verified webhook' };
      }
      if (['expire', 'cancel', 'deny'].includes(status.transaction_status)) {
        return { safeToExpire: true, reason: status.transaction_status };
      }
      if (status.transaction_status !== 'pending') {
        return { safeToExpire: false, reason: `Unexpected status: ${status.transaction_status}` };
      }
    }

    // Close any still-pending gateway transaction before changing local state.
    const cancelResponse = await fetchImpl(`${base}/${orderPath}/cancel`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (cancelResponse.status === 404) {
      return statusWasFound
        ? { safeToExpire: false, reason: 'Gateway transaction vanished before cancellation' }
        : { safeToExpire: true, reason: 'No provider transaction' };
    }
    if (!cancelResponse.ok) {
      return { safeToExpire: false, reason: `Cancel API HTTP ${cancelResponse.status}` };
    }
    const cancelled = await cancelResponse.json();
    return cancelled.transaction_status === 'cancel'
      ? { safeToExpire: true, reason: 'Gateway transaction cancelled' }
      : { safeToExpire: false, reason: `Unexpected cancel response: ${cancelled.transaction_status}` };
  } catch (error) {
    return { safeToExpire: false, reason: `Gateway unavailable: ${error.message}` };
  }
}

export async function expireUnpaidOrders(prisma, serverKey, now = new Date(), gateway = getGatewayState) {
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY is required for safe expiry');

  const dueOrders = await prisma.order.findMany({
    where: { paymentStatus: 'pending', paidAt: null, expiredAt: { lte: now } },
    select: { id: true, orderCode: true },
    // Prioritize newly expired checkouts even if an older paid order is still
    // awaiting its webhook and must remain pending locally.
    orderBy: { expiredAt: 'desc' },
    take: MAX_ORDERS_PER_SCAN,
  });

  let expired = 0;
  for (const order of dueOrders) {
    const provider = await gateway(order.orderCode, serverKey);
    if (!provider.safeToExpire) {
      console.warn(`[Order expiry] ${order.orderCode}: ${provider.reason}`);
      continue;
    }

    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: 'pending', paidAt: null, expiredAt: { lte: now } },
        data: { paymentStatus: 'expired', orderStatus: 'cancelled', deliveryStatus: 'cancelled' },
      });
      if (result.count !== 1) return false;
      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id, status: 'pending' },
        data: { status: 'expired' },
      });
      return true;
    });
    if (changed) {
      expired += 1;
      console.log(`[Order expiry] ${order.orderCode} expired (${provider.reason})`);
    }
  }
  return { scanned: dueOrders.length, expired };
}

async function main() {
  if (!process.env.MIDTRANS_SERVER_KEY) {
    throw new Error('MIDTRANS_SERVER_KEY is required for safe expiry');
  }
  const prisma = new PrismaClient();
  let running = false;
  let stopping = false;

  const scan = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await expireUnpaidOrders(prisma, process.env.MIDTRANS_SERVER_KEY);
    } catch (error) {
      console.error('[Order expiry] Scan failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(scan, SCAN_INTERVAL_MS);
  const stop = async () => {
    stopping = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await scan();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[Order expiry] Startup failed:', error);
    process.exitCode = 1;
  });
}
