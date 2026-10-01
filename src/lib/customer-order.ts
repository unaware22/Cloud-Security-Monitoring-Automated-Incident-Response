import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { CustomerSessionPayload } from './types';

/** Account-bound orders cannot be claimed by supplying someone else's email. */
export function customerOrderWhere(session: CustomerSessionPayload): Prisma.OrderWhereInput {
  return {
    OR: [
      { userId: session.userId },
      { userId: null, customerEmail: { equals: session.email.trim(), mode: 'insensitive' } },
    ],
  };
}

/** A checkout email is not proof of ownership for an account-bound order. */
export function checkoutOrderWhere(
  orderCode: string,
  email: string,
  session: CustomerSessionPayload | null
): Prisma.OrderWhereInput {
  return {
    orderCode,
    customerEmail: { equals: email, mode: 'insensitive' },
    ...(session
      ? { OR: [{ userId: session.userId }, { userId: null }] }
      : { userId: null }),
  };
}

/** Keep the local-development fallback consistent with the database policy. */
export function canAccessMemoryOrder(
  order: { userId?: string | null },
  session: CustomerSessionPayload | null
): boolean {
  return !order.userId || order.userId === session?.userId;
}

/** Shared, allowlisted fields. Never select unallocated product credentials. */
const customerOrderBaseSelect = {
  id: true, orderCode: true, customerName: true, customerEmail: true,
  customerPhone: true, totalAmount: true, discountAmount: true, voucherCode: true,
  orderStatus: true, paymentStatus: true, deliveryStatus: true, paymentMethod: true,
  createdAt: true, updatedAt: true, paidAt: true, expiredAt: true,
  orderItems: {
    select: {
      id: true, productId: true, productNameSnapshot: true, priceSnapshot: true,
      quantity: true, subtotal: true,
      product: {
        select: {
          id: true, name: true, slug: true, imageUrl: true, game: true,
          deliveryType: true, serviceTag: true,
        },
      },
    },
  },
} as const;

/** The history view needs payment continuation, but not delivery secrets or raw payloads. */
export const customerOrderSummarySelect = {
  ...customerOrderBaseSelect,
  paymentTransactions: {
    select: { paymentUrl: true, providerInvoiceId: true },
    orderBy: { createdAt: 'desc' }, take: 1,
  },
} satisfies Prisma.OrderSelect;

/** Full delivery data is fetched only when the owner opens one order. */
export const customerOrderSelect = {
  ...customerOrderBaseSelect,
  digitalDeliveries: {
    select: { deliveryStatus: true, deliveredAt: true, deliveryData: true },
    orderBy: { createdAt: 'desc' }, take: 1,
  },
  paymentTransactions: {
    select: {
      provider: true, paymentUrl: true, providerInvoiceId: true, rawPayload: true, status: true,
    },
    orderBy: { createdAt: 'desc' }, take: 1,
  },
} satisfies Prisma.OrderSelect;

export type CustomerOrder = Prisma.OrderGetPayload<{ select: typeof customerOrderSelect }>;

export function deliveredContent(order: {
  paymentStatus: string;
  deliveryStatus: string;
  digitalDeliveries: Array<{ deliveryStatus: string; deliveryData: string | null }>;
}): string | null {
  if (!['paid', 'paid_manual'].includes(order.paymentStatus)) return null;
  if (!['delivered', 'resent'].includes(order.deliveryStatus)) return null;
  const delivery = order.digitalDeliveries.find((entry) =>
    ['delivered', 'resent'].includes(entry.deliveryStatus)
  );
  return delivery?.deliveryData || null;
}

/** Allowlist the response even if a future query accidentally fetches extra fields. */
export function customerOrderDetail(order: CustomerOrder) {
  const content = deliveredContent(order);
  return {
    id: order.id, orderCode: order.orderCode, customerName: order.customerName,
    customerEmail: order.customerEmail, customerPhone: order.customerPhone,
    totalAmount: order.totalAmount, discountAmount: order.discountAmount,
    voucherCode: order.voucherCode, orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus,
    paymentMethod: order.paymentMethod, createdAt: order.createdAt,
    updatedAt: order.updatedAt, paidAt: order.paidAt, expiredAt: order.expiredAt,
    orderItems: order.orderItems.map((item) => ({
      id: item.id, productId: item.productId, productNameSnapshot: item.productNameSnapshot,
      priceSnapshot: item.priceSnapshot, quantity: item.quantity, subtotal: item.subtotal,
      product: {
        id: item.product.id, name: item.product.name, slug: item.product.slug,
        imageUrl: item.product.imageUrl, game: item.product.game,
        deliveryType: item.product.deliveryType, serviceTag: item.product.serviceTag,
      },
    })),
    digitalDeliveries: content === null ? [] : [{
      deliveryStatus: order.digitalDeliveries[0].deliveryStatus,
      deliveredAt: order.digitalDeliveries[0].deliveredAt,
      deliveryData: content,
    }],
  };
}

export function orderReference(orderCode: string): string {
  return createHash('sha256').update(orderCode).digest('hex').slice(0, 24);
}
