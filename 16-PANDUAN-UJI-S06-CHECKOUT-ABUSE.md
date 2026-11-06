# Panduan Uji S06 — Fake Order / Checkout Abuse

Uji hanya pada website penelitian dengan produk dan pembayaran **Midtrans Sandbox** serta akun uji.

## Ringkasan

| | |
|---|---|
| **Serangan** | Membuat banyak pesanan lalu tidak membayar (menumpuk pesanan palsu) |
| **Kontrol aplikasi** | Maksimal **3 pesanan pending per akun** (5 per IP); pesanan tak dibayar kedaluwarsa 15 menit; Cloudflare Turnstile wajib di checkout |
| **Respons** | **Dibatasi + notifikasi**, tanpa blokir (pelanggan biasa juga bisa lupa bayar) |
| **Event / rule** | `checkout_abuse` → **110510**; `bot_order_attempt` → **110512** |
| **Varian inti (10×)** | Pesanan ke-4 ditolak |
| **Bukti tambahan (1×)** | Checkout tanpa CAPTCHA ditolak |

## 1. Konfigurasi sekali

**EC2 App** — deploy kode terbaru:

```bash
cd ~/ecommerce-security
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app order-expiry-worker
```

**EC2 Wazuh** — tambahkan ke `/var/ossec/etc/rules/saladinshop_rules.xml` (backup dulu; jangan menimpa ID yang sudah ada):

```xml
<group name="saladinshop,web_security,checkout_abuse,">
  <rule id="110510" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^checkout_abuse$</field>
    <description>SALADINSHOP: Checkout limited (pending-order limit) from $(ip_address)</description>
    <group>business_logic,checkout_abuse,</group>
  </rule>
  <rule id="110512" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^bot_order_attempt$</field>
    <description>SALADINSHOP: Checkout without valid anti-bot verification from $(ip_address)</description>
    <group>bot,fake_order,</group>
  </rule>
</group>
```

Tambahkan `110510,110512` ke `<rule_id>` blok `<integration>` (Telegram). **Tidak** ke Active Response.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
```

**n8n (workflow pertama)** — output Switch `110510 — Checkout Limited` dan `110512 — Bot Order` → Send a text message.

## 2. Varian inti — Pesanan ke-4 ditolak

1. Login **akun uji C** di browser. Buat **3 pesanan** produk Sandbox melalui halaman checkout biasa (CAPTCHA diselesaikan), **jangan dibayar**.
2. Buat pesanan **ke-4**.
   **Hasil:** alert di halaman "Terlalu banyak pesanan yang menunggu pembayaran"; DevTools → Network `POST /api/orders` → **429** `ACTIVE_PENDING_LIMIT`. Riwayat tetap 3 pending.
3. ADMIN:

   ```bash
   # APP
   grep -F '"event_type":"checkout_abuse"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 1 | cut -c1-230
   # WAZUH
   sudo grep -F '"id":"110510"' /var/ossec/logs/alerts/alerts.json | tail -n 1 | cut -c1-200
   ```

   Event `active_pending_limit=account; limit=3`, alert **110510**, Telegram masuk. Akun C **tetap bisa** membuka website (tidak diblokir).
4. **Pemulihan otomatis:** setelah ±15 menit ketiga pesanan berubah `expired` dan akun C bisa checkout lagi.

**Pengulangan:** setiap percobaan memerlukan 3 pesanan pending baru. Untuk 10 percobaan, gunakan beberapa akun uji bergantian, atau tunggu 15 menit hingga pesanan kedaluwarsa.

## 3. Bukti tambahan (1×) — Checkout tanpa CAPTCHA

Dari Kali (ganti slug dengan produk aktif):

```bash
curl -s -w "\n%{http_code}\n" -H 'Content-Type: application/json' \
  -d '{"product_id":"GANTI_SLUG","quantity":1,"customer_name":"Bot Uji","customer_email":"bot.uji@example.com","customer_phone":"081200000000","payment_method":"va_bca"}' \
  https://saladinshop.duckdns.org/api/orders
```

**Hasil:** **400** "Verifikasi CAPTCHA wajib diselesaikan…", tidak ada pesanan, event `bot_order_attempt`, alert **110512**.

## 4. Kontrol normal

Pelanggan dengan 0–2 pesanan pending checkout dengan CAPTCHA sah → berhasil ke halaman pembayaran Midtrans, tanpa event.

## 5. Bukti untuk laporan

Riwayat 3 pending · alert di halaman + Network 429 · event & alert 110510 · Telegram · website tetap bisa diakses · log worker `expired` · (tambahan) curl tanpa CAPTCHA 400.

## 6. Batasan

- Respons sengaja pembatasan + notifikasi, bukan pemblokiran.
- Turnstile tidak menghentikan manusia yang menyelesaikan CAPTCHA; batas pending menjadi lapisan berikutnya.
- Batas per IP dapat mengenai pengguna di jaringan bersama, sehingga dibuat lebih longgar (5) dari batas akun (3).
- Banjir request checkout ditahan Nginx (`limit_req` 10/menit, burst 5) sebelum mencapai aplikasi; tidak diuji sebagai varian terpisah.
