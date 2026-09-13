type ReviewableOrder = {
  paymentStatus?: string | null;
  orderStatus?: string | null;
  deliveryStatus?: string | null;
  paidAt?: Date | string | null;
};

const REVIEWABLE_PAYMENT_STATUSES = new Set(['pending', 'pending_manual']);
const REVIEWABLE_ORDER_STATUSES = new Set(['created', 'waiting_payment']);

/**
 * Manual admin decisions are valid only while an order is still awaiting
 * payment. Keeping this rule shared by the UI and API prevents cancelled,
 * paid, or already-delivered orders from being approved or rejected later.
 */
export function canReviewPendingOrder(order: ReviewableOrder): boolean {
  return (
    REVIEWABLE_PAYMENT_STATUSES.has(order.paymentStatus || '') &&
    REVIEWABLE_ORDER_STATUSES.has(order.orderStatus || '') &&
    order.deliveryStatus === 'pending' &&
    !order.paidAt
  );
}
