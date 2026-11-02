# Panduan Uji S09 — Manipulasi Pembayaran / Webhook Midtrans

Uji hanya dengan **Midtrans Sandbox** dan pesanan uji milik sendiri. Kunci server Midtrans (`MIDTRANS_SERVER_KEY`) **tidak boleh** ditampilkan; perhitungan tanda tangan dilakukan di dalam container EC2 App.

## 0. Apa yang diuji dan kebijakan responsnya

Setelah pelanggan membayar, Midtrans memanggil `POST /api/payments/midtrans/webhook`. Endpoint ini publik, sehingga penyerang dapat mengirim notifikasi palsu "sudah dibayar" agar produk digital terkirim tanpa membayar.

Kontrol di aplikasi:

| Kontrol | Mencegah |
|---|---|
| **Tanda tangan SHA-512** = SHA512(order_id + status_code + gross_amount + ServerKey), dibandingkan secara *timing-safe*; ditolak bila server key kosong | Notifikasi palsu dari pihak yang tidak tahu server key |
| **Cek nominal**: `gross_amount` harus sama dengan total pesanan di database | Notifikasi dengan nominal berbeda (mis. membayar lebih kecil) |
| **Klaim atomik**: pesanan hanya diubah jadi `paid` bila statusnya masih `pending`/`expired` | Notifikasi berulang (retry/replay) mengirim produk dua kali |
| Hanya `settlement`/`capture` dengan `status_code 200` dan fraud `accept` yang dianggap lunas | Status lain dianggap belum dibayar |

**Kebijakan respons S09: ditolak + alert prioritas tinggi, tanpa blokir IP otomatis.** Alasan: notifikasi yang sah datang dari server Midtrans. Bila suatu saat terjadi salah konfigurasi (mis. server key berubah), Active Response justru akan memblokir IP Midtrans dan menghentikan seluruh pembayaran. Admin menilai alert lalu memblokir manual dari dashboard bila jelas berasal dari penyerang.

| Event | Arti |
|---|---|
| `invalid_payment_callback` + `signature=[REDACTED]`, status 403 | Tanda tangan tidak sah |
| `invalid_payment_callback` + `gross_amount=...`, status 400 | Tanda tangan sah tetapi nominal tidak cocok |

## 1. Konfigurasi sekali

### 1.1 EC2 App

Deploy kode terbaru (pull, build, recreate). Kode terbaru memperketat verifikasi tanda tangan (server key kosong → semua ditolak; perbandingan timing-safe; field non-teks ditolak tanpa error 500).

Pastikan server key terisi (hanya panjangnya yang ditampilkan):

```bash
cd ~/ecommerce-security
sudo docker compose -f docker-compose.aws.yml exec -T app node -e 'console.log("MIDTRANS_SERVER_KEY length:", (process.env.MIDTRANS_SERVER_KEY||"").length)'
```

### 1.2 EC2 Wazuh — rule webhook (alert saja)

```bash
sudo grep -n -B2 -A6 'invalid_payment_callback' /var/ossec/etc/rules/saladinshop_rules.xml
```

Jika belum ada, tambahkan (sesuaikan ID bila terpakai):

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

Tambahkan `110530,110531` ke `<rule_id>` blok `<integration>` (Telegram). **Jangan** ke Active Response.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
```

### 1.3 n8n — workflow pertama

Output Switch `110530 — Fake Payment Webhook` dan `110531 — Payment Amount Mismatch` → **Send a text message**.

## 2. Persiapan

Buat **dua pesanan uji** (Sandbox) dari akun uji, produk digital otomatis:
- **Pesanan P (pending)** — dibiarkan belum dibayar. Catat `ORDER_P` dan totalnya.
- **Pesanan L (lunas)** — dibayar lewat simulator Midtrans Sandbox sampai status `paid` dan produk terkirim. Catat `ORDER_L` dan totalnya.

Pada APP, siapkan fungsi pembuat tanda tangan (server key tetap di dalam container, yang tercetak hanya hasil hash):

```bash
cd ~/ecommerce-security
sign() { sudo docker compose -f docker-compose.aws.yml exec -T app node -e '
const c=require("crypto"); const [o,s,g]=process.argv.slice(1);
console.log(c.createHash("sha512").update(o+s+g+process.env.MIDTRANS_SERVER_KEY).digest("hex"))' "$1" "$2" "$3"; }
WEBHOOK=https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

## 3. Varian A — Notifikasi lunas palsu (tanpa server key)

Dari **Kali (PENGUJI)** — penyerang tidak tahu server key:

```bash
ORDER_P=GANTI_KODE_PESANAN_PENDING
TOTAL_P=GANTI_TOTAL_PESANAN_P   # contoh 35000.00
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"$TOTAL_P\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$(head -c 64 /dev/urandom | sha512sum | cut -d' ' -f1)\"}" \
  https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

**Hasil:** **403** "Invalid signature key". Pesanan P **tetap pending**, tidak ada produk terkirim. Event `invalid_payment_callback` (403), alert **110530**, Telegram.

Varian tambahan — `signature_key` berupa angka (`"signature_key":12345`) → tetap **403**, bukan 500.

## 4. Varian B — Tanda tangan sah, nominal dimanipulasi

Mensimulasikan notifikasi bertanda tangan sah dengan nominal lebih kecil (mis. akibat manipulasi di sisi pembayaran). Dijalankan di **APP**:

```bash
ORDER_P=GANTI_KODE_PESANAN_PENDING
SIG=$(sign "$ORDER_P" 200 1000.00)
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"1000.00\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$SIG\"}" \
  "$WEBHOOK"
```

**Hasil:** **400** "Payment amount mismatch". Pesanan P tetap pending. Event `invalid_payment_callback` dengan `gross_amount=1000.00`, alert **110531**, Telegram.

## 5. Varian C — Replay notifikasi sah (pengiriman ganda)

Pesanan L sudah lunas. Kirim ulang notifikasi lunas yang **sah** dua kali (meniru retry Midtrans atau replay penyerang yang menyadap notifikasi):

```bash
ORDER_L=GANTI_KODE_PESANAN_LUNAS
TOTAL_L=GANTI_TOTAL_PESANAN_L   # format sama dengan notifikasi Midtrans, mis. 35000.00
SIG=$(sign "$ORDER_L" 200 "$TOTAL_L")
for i in 1 2; do
  curl -s -w " -> %{http_code}\n" -H 'Content-Type: application/json' \
    -d "{\"order_id\":\"$ORDER_L\",\"status_code\":\"200\",\"gross_amount\":\"$TOTAL_L\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$SIG\"}" \
    "$WEBHOOK"
done
```

**Hasil:** keduanya **200 OK** (Midtrans harus menerima 200 agar berhenti mengulang), tetapi **tidak ada** pengiriman produk tambahan. Verifikasi:

```bash
sudo docker compose -f docker-compose.aws.yml exec -T app node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
p.order.findUnique({ where: { orderCode: process.argv[1] },
  select: { paymentStatus: true, paidAt: true, _count: { select: { digitalDeliveries: true } } } })
 .then(r => { console.log(r); return p.\$disconnect(); });" "$ORDER_L"
```

Cari `paidAt` **tidak berubah** dan jumlah pengiriman **1**. Stok produk juga tidak berkurang lagi (cek di admin), dan email pengiriman tidak terkirim ulang.

> Bila nama relasi `digitalDeliveries` berbeda pada schema, cek jumlah baris pengiriman lewat dashboard admin (detail pesanan).

## 6. Kontrol normal

Bayar satu pesanan baru lewat simulator Midtrans Sandbox → webhook asli diterima (200), status `paid`, produk terkirim **sekali**, **tidak ada** event `invalid_payment_callback`.

## 7. Screenshot

(a) curl palsu 403 + pesanan tetap pending, (b) nominal salah 400, (c) event + alert 110530/110531 + Telegram, (d) replay 2x 200 + jumlah pengiriman tetap 1, (e) pembayaran Sandbox normal berhasil.

## 8. Batasan

- Keamanan bergantung pada kerahasiaan `MIDTRANS_SERVER_KEY`. Bila kunci bocor, penyerang dapat membuat tanda tangan sah; mitigasi lanjutan adalah memverifikasi ulang status transaksi ke API Midtrans (`GET /v2/{order_id}/status`) sebelum menandai lunas.
- Field `transaction_status` tidak termasuk dalam tanda tangan Midtrans; aplikasi mengandalkan `status_code 200` (yang ditandatangani) dan klaim atomik.
- Tidak ada blokir IP otomatis untuk S09 (alasan di bagian 0); respons berupa penolakan + alert prioritas tinggi.
