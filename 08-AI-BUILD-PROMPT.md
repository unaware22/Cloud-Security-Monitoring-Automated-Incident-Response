# Prompt for Antigravity / Claude Code

Use this prompt to start implementation.

```text
You are building a production-like digital product e-commerce web application for a cloud security monitoring thesis.

Project goals:
- Build a secure e-commerce website for digital products.
- Customer does not need register/login.
- Customer can browse products, buy now, checkout, pay, receive order code, and check order status.
- Admin can login, manage products, manage orders, approve manual payments, and resend delivery.
- Payment uses Xendit Invoice/Payment integration plus manual bank transfer fallback.
- Database is PostgreSQL and must be compatible with Amazon RDS.
- App must include request logging, audit logging, and security event logging for Wazuh monitoring.
- Do not intentionally add vulnerabilities. The app should be secure by design.

Recommended stack:
- Frontend/backend: Next.js or React + Express. If existing REST API exists, prefer React + Express.
- Database: PostgreSQL
- ORM: Prisma
- Auth: admin-only JWT/session with bcrypt password hash
- Payment: Xendit sandbox first
- Email: SMTP/Resend-compatible interface
- Deployment target: AWS EC2 behind Nginx, RDS private PostgreSQL

Core features:
1. Homepage
2. Product list
3. Product detail
4. Buy Now
5. Checkout without customer login
6. Input customer name/email/WhatsApp
7. Xendit payment invoice/payment URL
8. Manual payment method
9. Order code generation
10. Check order using order_code + email
11. Admin login
12. Admin product management
13. Admin order management
14. Manual payment approval
15. Email delivery dummy/real
16. Request/security logging
17. Audit logs

Security requirements:
- Validate all inputs.
- Use parameterized queries/Prisma.
- Rate limit admin login, checkout, check order, payment webhook.
- Verify Xendit webhook token/signature.
- Prevent order enumeration: require order_code + email and return generic error.
- Use secure random order codes, not sequential IDs.
- Hash admin password with bcrypt/argon2.
- Log suspicious patterns: SQLi attempt, XSS attempt, sensitive path scan, invalid webhook, repeated failed admin login, repeated failed check order.
- Write security event logs in JSON lines format for Wazuh Agent.

Database tables:
- products
- orders
- order_items
- payment_transactions
- manual_payment_submissions
- digital_deliveries
- admin_users
- audit_logs
- security_events

Build approach:
1. Create database schema and migrations.
2. Implement public product/order APIs.
3. Implement checkout + manual payment.
4. Implement Xendit integration with webhook verification.
5. Implement admin auth/dashboard/product/order management.
6. Implement logging/security middleware.
7. Add basic UI.
8. Add README deployment instructions for EC2 + RDS.

Important:
- Do not build marketplace features like cart, seller account, chat, review, shipment, vouchers.
- Do not add customer login/register.
- Keep scope focused and clean.
```
