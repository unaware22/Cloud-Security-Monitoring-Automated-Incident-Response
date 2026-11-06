# Panduan Uji S09 — Manipulasi Webhook Pembayaran

Uji hanya dengan **Midtrans Sandbox** dan pesanan uji sendiri. `MIDTRANS_SERVER_KEY` tidak pernah ditampilkan; tanda tangan uji dihitung di dalam container EC2 App.

## Ringkasan

| | |
|---|---|
| **Serangan** | Mengirim notifikasi "sudah dibayar" palsu ke `POST /api/payments/midtrans/webhook` agar produk terkirim tanpa membayar |
| **Kontrol aplikasi** | Tanda tangan SHA-512 (order_id + status_code + gross_amount + server key) dicek timing-safe; nominal harus sama dengan total di database; pesanan hanya diklaim `paid` sekali |
| **Respons** | **Ditolak + alert prioritas tinggi**, tanpa blokir otomatis (notifikasi sah datang dari server Midtrans; blokir otomatis berisiko memutus pembayaran bila terjadi salah konfigurasi) |
| **Event / rule** | `invalid_payment_callback` → **110530** (tanda tangan), **110531** (nominal) |
| **Varian inti (10× masing-masing)** | A. Tanda tangan palsu · B. Nominal salah |

## 1. Konfigurasi sekali

**EC2 App** — deploy kode terbaru (pull, build, recreate).

**EC2 Wazuh** — tambahkan (backup dulu):

```xml
<group name="saladinshop,web_security,payment,">
  <rule id="110530" level="12">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^invalid_payment_callback$</field>
    <description>SALADINSHOP: Rejected payment webhook (invalid signature) from $(ip_address)</description>
    <mitre><id>T1565.002</id></mitre>
    <group>payment_fraud,webhook,</group>
  </rule>
  <rule id="110531" level="13">
    <if_sid>110530</if_sid>
    <field name="payload_snippet" type="pcre2">gross_amount=</field>
    <description>SALADINSHOP: Payment webhook amount mismatch from $(ip_address)</description>
    <group>payment_fraud,webhook,amount_mismatch,</group>
  </rule>
</group>
```

Tambahkan `110530,110531` ke `<rule_id>` `<integration>`. **Tidak** ke Active Response. Validasi lalu restart manager. n8n: output `110530 — Fake Payment Webhook` dan `110531 — Payment Amount Mismatch`.

## 2. Persiapan

Buat satu **pesanan uji pending** (jangan dibayar). Catat kode pesanannya **tanpa tanda `#`** (contoh `ORD-G4MHN2Z5`) dan totalnya. Pesanan pending kedaluwarsa dalam 15 menit; buat pesanan baru bila perlu.

Pada **EC2 App**, siapkan fungsi tanda tangan (yang tercetak hanya hash, bukan server key):

```bash
cd ~/ecommerce-security
sign() { sudo docker compose -f docker-compose.aws.yml exec -T app node -e '
const c=require("crypto"); const [o,s,g]=process.argv.slice(1);
console.log(c.createHash("sha512").update(o+s+g+process.env.MIDTRANS_SERVER_KEY).digest("hex"))' "$1" "$2" "$3"; }
WEBHOOK=https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

## 3. Varian A — Tanda tangan palsu

Dari **Kali** (penyerang tidak tahu server key):

```bash
ORDER_P=ORD-GANTI_KODE
TOTAL_P=GANTI_TOTAL      # contoh 35000.00
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"$TOTAL_P\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$(head -c 64 /dev/urandom | sha512sum | cut -d' ' -f1)\"}" \
  https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

**Hasil:** **403** "Invalid signature key". Pesanan **tetap pending**, produk tidak terkirim. Event `invalid_payment_callback` (`signature=[REDACTED]`), alert **110530**, Telegram.

## 4. Varian B — Tanda tangan sah, nominal dimanipulasi

Dari **EC2 App** (menggunakan fungsi `sign`):

```bash
ORDER_P=ORD-GANTI_KODE
SIG=$(sign "$ORDER_P" 200 1000.00)
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"1000.00\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$SIG\"}" \
  "$WEBHOOK"
```

**Hasil:** **400** "Payment amount mismatch". Pesanan tetap pending. Event dengan `gross_amount=1000.00`, alert **110531**, Telegram.

> Jika hasilnya **200 OK "Webhook processed successfully"**, kode pesanan tidak ditemukan (mis. ada tanda `#`, salah ketik, atau pesanan sudah dihapus). Webhook sengaja menjawab 200 untuk pesanan yang tidak dikenal agar Midtrans berhenti mengulang; pesanan apa pun tidak berubah. Periksa `ORDER_P` lalu ulangi.

## 5. Verifikasi pesanan tidak berubah

```bash
sudo docker compose -f docker-compose.aws.yml exec -T app node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
p.order.findUnique({ where: { orderCode: process.argv[1] }, select: { paymentStatus: true, paidAt: true } })
 .then(r => { console.log(r); return p.\$disconnect(); });" "$ORDER_P"
```

**Hasil:** `paymentStatus: 'pending'`, `paidAt: null`.

## 6. Kontrol normal

Bayar satu pesanan lewat simulator Midtrans Sandbox → webhook asli diterima (200), status `paid`, produk terkirim **sekali**, tanpa event `invalid_payment_callback`.

## 7. Bukti untuk laporan

curl palsu 403 · nominal salah 400 · status pesanan tetap pending · event & alert 110530/110531 · Telegram · pembayaran Sandbox normal berhasil.

## 8. Batasan

- Keamanan bergantung pada kerahasiaan server key; bila bocor, mitigasi lanjutan adalah memverifikasi ulang status ke API Midtrans sebelum menandai lunas.
- Tidak ada blokir IP otomatis untuk S09 (alasan di ringkasan).
- Notifikasi ulang (retry) yang sah tidak mengirim produk dua kali karena klaim status atomik; tidak diuji sebagai varian terpisah.
