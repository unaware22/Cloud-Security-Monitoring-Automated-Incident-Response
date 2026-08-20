# API Specification

## Public Product APIs
### GET /api/products
Returns active products.

### GET /api/products/:slug
Returns product detail.

## Checkout APIs
### POST /api/orders
Create order.

Request:
```json
{
  "product_id": "uuid",
  "quantity": 1,
  "customer_name": "Tang",
  "customer_email": "tang@example.com",
  "customer_phone": "08123456789",
  "payment_method": "xendit_invoice"
}
```

Response:
```json
{
  "order_code": "ORD-X7F9K2Q8",
  "payment_status": "pending",
  "payment_url": "https://..."
}
```

### POST /api/orders/manual-payment
Submit manual payment reference.

### POST /api/payments/xendit/webhook
Xendit webhook receiver.
Requirements:
- verify callback token/signature
- idempotent update
- reject invalid callback
- log invalid_payment_callback if invalid

### POST /api/orders/check
Check order by order_code + email.

Request:
```json
{
  "order_code": "ORD-X7F9K2Q8",
  "email": "tang@example.com"
}
```

Security:
- rate limit
- do not reveal whether order_code or email alone is wrong
- log repeated failures

## Admin APIs
### POST /api/admin/login
Admin login.
Security:
- rate limit
- log failed attempts
- password hash verification

### GET /api/admin/dashboard
Dashboard summary.

### CRUD /api/admin/products
- GET /api/admin/products
- POST /api/admin/products
- PUT /api/admin/products/:id
- PATCH /api/admin/products/:id/deactivate

### GET /api/admin/orders
List orders.

### GET /api/admin/orders/:id
Order detail.

### POST /api/admin/orders/:id/approve-manual-payment
Approve manual payment.
Must write audit log.

### POST /api/admin/orders/:id/reject-manual-payment
Reject manual payment.
Must write audit log.

### POST /api/admin/orders/:id/resend-delivery
Resend digital product.
Must write audit log.

## Logging Requirement
Every request should include:
- request_id
- timestamp
- ip_address
- method
- endpoint
- status_code
- response_time
- user_agent

Suspicious requests should create security_events record and append JSON log file for Wazuh.
