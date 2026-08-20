# Workflow

## 1. Customer Purchase Workflow
```text
Homepage
  -> Product List
  -> Product Detail
  -> Buy Now
  -> Checkout Form
  -> Create Order
  -> Choose Payment Method
  -> Pay via Xendit or Manual Transfer
  -> Payment Confirmation
  -> Digital Delivery
  -> Check Order
```

## 2. Xendit Payment Workflow
```text
Customer submit checkout
  -> Backend creates order: payment_status=pending
  -> Backend creates Xendit invoice/payment request
  -> Xendit returns invoice_url/payment_url
  -> Customer pays QRIS/VA/e-wallet
  -> Xendit sends webhook to /api/payments/xendit/webhook
  -> Backend verifies webhook signature/token
  -> Backend updates payment_status=paid
  -> Backend creates delivery job
  -> Email delivery sent
  -> delivery_status=delivered
```

## 3. Manual Payment Workflow
```text
Customer selects Manual Transfer/Manual QRIS
  -> Backend creates order: payment_status=pending_manual
  -> Page shows bank account/static QRIS/payment instructions
  -> Customer submits payment reference/proof info
  -> Admin opens Payment Verification
  -> Admin verifies manually
  -> Admin clicks Approve Manual Payment
  -> System sets payment_status=paid_manual
  -> Audit log is written
  -> Digital product is delivered
```

## 4. Check Order Workflow
```text
Customer opens Check Order
  -> inputs order_code + email
  -> backend validates both values
  -> if match: show order status
  -> if fail repeatedly: log order_enumeration_attempt
  -> rate limit endpoint
```

## 5. Admin Workflow
```text
/admin/login
  -> admin authenticates
  -> dashboard
  -> manage products
  -> manage orders
  -> verify manual payments
  -> resend delivery
  -> view audit logs/security events
```

## 6. Security Monitoring Workflow
```text
Request enters app/Nginx
  -> request logger records access log
  -> security middleware detects suspicious pattern
  -> writes security_events log/file
  -> Wazuh Agent reads log
  -> Wazuh Manager triggers rule
  -> n8n receives alert/webhook
  -> Telegram/Discord notification
  -> optional IP block via iptables/ipset when threshold exceeded
```
