# PRD — Digital Product E-Commerce with Security Monitoring

## 1. Ringkasan Produk
Website e-commerce untuk menjual produk digital. Customer dapat membeli produk tanpa membuat akun. Pembayaran menggunakan **Xendit** untuk QRIS/Virtual Account/e-wallet, dengan fallback **manual payment approval** dari admin.

Project ini juga menjadi objek skripsi untuk implementasi **security monitoring** dan **automated incident response** berbasis Wazuh dan n8n pada infrastruktur AWS.

## 2. Tujuan
- Membuat website e-commerce produk digital yang layak digunakan.
- Menerapkan arsitektur AWS production-like: EC2 Web App + RDS PostgreSQL private + EC2 Monitoring.
- Mengintegrasikan Xendit untuk pembayaran real/sandbox.
- Menyediakan manual payment approval di admin dashboard.
- Mencatat request, audit log, dan security event.
- Menghubungkan log aplikasi ke Wazuh dan alert ke n8n.

## 3. Non-Goals
- Tidak membuat marketplace seperti Shopee/Tokopedia.
- Tidak membuat customer register/login.
- Tidak melakukan DDoS sungguhan.
- Tidak membuat vulnerability secara sengaja.
- Tidak membuat fitur seller, chat, review, ekspedisi, refund kompleks.

## 4. Target User
### Customer
- Membeli produk digital cepat tanpa akun.
- Menerima produk via email setelah pembayaran sukses.
- Mengecek status pesanan dengan order code + email.

### Admin
- Mengelola produk.
- Melihat dan memproses order.
- Approve pembayaran manual.
- Melihat audit/security logs.

### Security/Admin Operator
- Menerima alert aktivitas mencurigakan.
- Melihat incident log.
- Melakukan blocking/rate-limit sesuai SOP.

## 5. Fitur Customer
- Homepage
- Product list
- Product detail
- Buy Now
- Checkout tanpa login
- Input nama, email, nomor WhatsApp
- Xendit payment invoice/QRIS/VA
- Manual bank transfer/manual QRIS
- Order code
- Check order dengan order code + email
- Email delivery digital product

## 6. Fitur Admin
- Admin login
- Dashboard ringkas
- Product management: create, read, update, deactivate
- Order management
- Payment verification manual
- Resend delivery email
- Audit logs
- Security events viewer

## 7. Fitur Security
- Admin password hashing
- Rate limiting endpoint sensitif
- Input validation
- Parameterized query/ORM
- Request logging
- Security event logging
- Audit log admin
- Xendit webhook signature verification
- RDS private access only

## 8. Success Criteria
- Customer bisa membuat order dan mendapat order code.
- Pembayaran Xendit sandbox dapat mengubah status order menjadi paid via webhook.
- Admin dapat approve manual payment.
- Produk digital dapat dikirim/diberikan setelah paid.
- RDS tidak bisa diakses langsung dari internet.
- Security event muncul untuk SQLi attempt, XSS attempt, admin brute force, order enumeration, fake webhook, path scanning, traffic spike.
- Wazuh menerima log dan n8n mengirim alert.
