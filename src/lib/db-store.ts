import { prisma } from '@/lib/prisma';
import { fallbackStore, FallbackProduct } from '@/lib/products-store';

// In-memory collections for zero-latency offline execution
export interface MemoryOrder {
  id: string;
  orderCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  paymentMethod: string;
  paymentUrl?: string | null;
  expiredAt: string;
  createdAt: string;
  paidAt?: string | null;
  items: Array<{
    product_id?: string;
    product_name: string;
    game: string;
    price: number;
    quantity: number;
    image_url?: string | null;
  }>;
  orderItems: Array<{
    productId?: string;
    productNameSnapshot: string;
    priceSnapshot: number;
    quantity: number;
    subtotal: number;
    product?: any;
  }>;
  manualPaymentSubmissions?: Array<{
    senderName: string;
    senderBank: string;
    amount: number;
    note?: string;
    createdAt: string;
  }>;
  digital_delivery?: {
    content: string;
    delivered_at?: string;
  };
}

const globalForMemory = globalThis as unknown as {
  inMemoryOrders: MemoryOrder[];
  inMemoryAudits: any[];
  inMemorySecurityEvents: any[];
  isDbReachable: boolean | null;
  lastDbCheck: number;
};

if (!globalForMemory.inMemoryOrders) {
  globalForMemory.inMemoryOrders = [];
}
if (!globalForMemory.inMemoryAudits) {
  globalForMemory.inMemoryAudits = [];
}
if (!globalForMemory.inMemorySecurityEvents) {
  globalForMemory.inMemorySecurityEvents = [];
}

export const inMemoryOrders = globalForMemory.inMemoryOrders;
export const inMemoryAudits = globalForMemory.inMemoryAudits;
export const inMemorySecurityEvents = globalForMemory.inMemorySecurityEvents;

/**
 * Super-fast database reachability check with 600ms timeout
 */
export async function isDatabaseOnline(): Promise<boolean> {
  const now = Date.now();
  // Cache connection state for 15 seconds to prevent repeated network timeout delays
  if (
    globalForMemory.isDbReachable !== null &&
    now - globalForMemory.lastDbCheck < 15000
  ) {
    return globalForMemory.isDbReachable;
  }

  try {
    const checkPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB_TIMEOUT')), 600)
    );

    await Promise.race([checkPromise, timeoutPromise]);
    globalForMemory.isDbReachable = true;
    globalForMemory.lastDbCheck = now;
    return true;
  } catch {
    globalForMemory.isDbReachable = false;
    globalForMemory.lastDbCheck = now;
    return false;
  }
}

/**
 * Force reset cache (called when user starts DB)
 */
export function resetDbCheck() {
  globalForMemory.isDbReachable = null;
  globalForMemory.lastDbCheck = 0;
}
