# Xendit Integration Plan

## 1. Recommended Payment Model
Use hybrid payment:
1. Xendit Invoice/Payment as automatic payment.
2. Manual Bank Transfer/Manual QRIS as fallback with admin approval.

## 2. Xendit Flow
```text
POST /api/orders
  -> create order pending
  -> create Xendit invoice
  -> store provider_invoice_id and payment_url
  -> customer pays
  -> Xendit webhook received
  -> verify webhook token/signature
  -> update payment_status=paid
  -> deliver digital product
```

## 3. Manual Flow
```text
Customer chooses Manual Transfer
  -> order pending_manual
  -> customer submits payment reference
  -> admin verifies manually
  -> approve_manual_payment
  -> payment_status=paid_manual
  -> deliver digital product
```

## 4. Required Environment Variables
```env
DATABASE_URL=postgresql://...
XENDIT_SECRET_KEY=...
XENDIT_WEBHOOK_TOKEN=...
APP_BASE_URL=https://example.com
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
ADMIN_JWT_SECRET=...
```

## 5. Webhook Security Requirements
- Verify callback token/signature.
- Reject invalid callbacks with 401/403.
- Implement idempotency: same webhook should not double-deliver.
- Match amount and order code.
- Never trust client-side payment status.
- Log invalid callback as `invalid_payment_callback` severity high.

## 6. Admin Override Rules
Manual approval is allowed only for admin role.
Every approval must write audit log:
- admin_id
- order_id
- old_status
- new_status
- IP address
- timestamp
- note

Use label: `Approve Manual Payment`, not `Set Paid`.
