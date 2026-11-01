# Panduan Uji S06 — Bot, Fake Order, dan Checkout Abuse

Uji hanya pada website penelitian, dengan produk dan pembayaran **Midtrans Sandbox**, akun uji, serta data pelanggan sintetis. Kerangka: [OWASP API6:2023 Unrestricted Access to Sensitive Business Flows](https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/).

## 0. Apa yang diuji dan kebijakan responsnya

Checkout dapat disalahgunakan tanpa membobol apa pun: bot membuat pesanan otomatis, atau pelaku menumpuk pesanan yang tidak pernah dibayar. S06 memeriksa **tiga kontrol pembatasan** pada `POST /api/orders`:

| Varian | Serangan | Kontrol aplikasi | Event | HTTP |
|---|---|---|---|---|
| **A. Bot tanpa CAPTCHA** | Script/curl memesan langsung ke API tanpa token Turnstile atau dengan token palsu | Verifikasi Cloudflare Turnstile **sebelum** pesanan dibuat | `bot_order_attempt` | 400 (token kosong) / 403 (token tidak sah) |
| **B. Flood checkout** | Banyak request checkout dalam waktu singkat | Rate limit 10 request/menit per IP | `checkout_abuse` (`Exceeded rate limit for checkout`) | 429 |
| **C. Fake order** | Membuat banyak pesanan lalu tidak membayar | Maksimal **3 pesanan pending per akun**, **5 per IP**; pesanan tak dibayar kedaluwarsa 15 menit | `checkout_abuse` (`active_pending_limit=...`) | 429 `ACTIVE_PENDING_LIMIT` |

Urutan pemeriksaan di server: rate limit → deteksi SQLi/XSS → validasi data → **Turnstile** → stok/voucher → **batas pending** → baru membuat transaksi Midtrans. Bot dan flood ditolak **sebelum** ada pesanan atau transaksi.

**Kebijakan respons S06: dibatasi dan dipantau, tidak diblokir.**

| Lapisan | Peran pada S06 |
|---|---|
| Aplikasi | **Mencegah** — menolak request bot, flood, dan pesanan pending berlebih |
| Wazuh | **Mendeteksi** — alert 110510/110512, dan alert berulang 110511/110513 dengan level lebih tinggi |
| n8n | **Memberi tahu** admin lewat Telegram |
| Blokir IP / ban perangkat-akun | **Tidak dipakai.** Perilaku ini dapat dilakukan pelanggan biasa (lupa bayar, CAPTCHA kedaluwarsa, jaringan bersama), sehingga respons yang proporsional adalah pembatasan + notifikasi |

Setelah pembatasan berakhir (rate limit 1 menit, atau pesanan pending dibayar/kedaluwarsa 15 menit), pengguna dapat checkout lagi tanpa campur tangan admin.

## 1. Konfigurasi sekali (sebelum uji)

### 1.1 EC2 App — deploy kode terbaru

Kode terbaru memastikan `checkout_abuse` dan `bot_order_attempt` **tidak** memicu ban perangkat/akun.

```bash
cd ~/ecommerce-security
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app order-expiry-worker
```

Cek nilai batas pending yang berlaku:

```bash
sudo docker compose -f docker-compose.aws.yml exec -T app node -e '
const l=(n,f)=>{const v=Number(process.env[n]);return Number.isInteger(v)&&v>=1&&v<=20?v:f};
console.log({pendingPerAccount:l("CHECKOUT_MAX_PENDING_PER_ACCOUNT",3),pendingPerIp:l("CHECKOUT_MAX_PENDING_PER_IP",5)})'
```

**Pastikan Turnstile aktif** (halaman checkout menampilkan CAPTCHA). Jika Turnstile mati, varian A dengan curl **akan benar-benar membuat pesanan pending** — jangan jalankan varian A sebelum CAPTCHA terlihat di halaman checkout.

### 1.2 EC2 Wazuh — rule checkout dan bot (alert saja)

Cek dulu apakah rule 110510 sudah pernah dibuat:

```bash
sudo grep -n -A 8 'id="11051[0-3]"' /var/ossec/etc/rules/saladinshop_rules.xml
```

Jika belum ada, backup lalu tambahkan **setelah grup terakhir yang sudah ditutup** (jika 110510 sudah ada dengan isi lain, jangan menimpa — catat isi lama dan sesuaikan ID):

```bash
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml \
  /var/ossec/etc/rules/saladinshop_rules.xml.backup-s06
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

```xml
<group name="saladinshop,web_security,checkout_abuse,">
  <rule id="110510" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^checkout_abuse$</field>
    <description>SALADINSHOP: Checkout limited (pending limit or checkout flood) from $(ip_address)</description>
    <group>business_logic,checkout_abuse,</group>
  </rule>

  <rule id="110511" level="10" frequency="3" timeframe="600">
    <if_matched_sid>110510</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated checkout limiting from $(ip_address)</description>
    <group>business_logic,checkout_abuse,repeated_abuse,</group>
  </rule>

  <rule id="110512" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^bot_order_attempt$</field>
    <description>SALADINSHOP: Checkout without valid anti-bot verification from $(ip_address)</description>
    <group>bot,fake_order,</group>
  </rule>

  <rule id="110513" level="10" frequency="3" timeframe="300">
    <if_matched_sid>110512</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated bot order attempts from $(ip_address)</description>
    <group>bot,fake_order,repeated_abuse,</group>
  </rule>
</group>
```

110511/110513 hanya **menaikkan level alert** agar pola berulang lebih mudah dikenali di dashboard dan Telegram. **Jangan** memasukkan 110510–110513 ke `<rules_id>` blok Active Response.

### 1.3 EC2 Wazuh — notifikasi ke n8n

Tambahkan `110510,110511,110512,110513` pada `<rule_id>` blok `<integration>` custom-n8n (pertahankan ID lain yang sudah ada):

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-s06
sudo nano /var/ossec/etc/ossec.conf
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

Pastikan rule S06 **tidak** ada di Active Response:

```bash
sudo sed -n '/<active-response>/,/<\/active-response>/p' /var/ossec/etc/ossec.conf | grep -E '<rules_id>'
```

Uji rule tanpa menyerang (`sudo /var/ossec/bin/wazuh-logtest`, tempel lalu Enter; cari `id: '110512'`):

```json
{"event_type":"bot_order_attempt","severity":"medium","ip_address":"203.0.113.60","method":"POST","endpoint":"/api/orders","user_agent":"curl/8.9.0","payload_snippet":"turnstile_token=missing","status_code":400,"request_id":"req-logtest-s06","created_at":"2026-11-02T10:00:00.000Z"}
```

### 1.4 n8n (homelab) — workflow pertama (Telegram)

Pada **workflow pertama** (Webhook → Edit Fields → **Switch** → Telegram), tambahkan output Switch baru, misalnya **"S06 — Checkout/Bot"**, dengan kondisi rule id = `110510`, `110511`, `110512`, atau `110513`, lalu sambungkan ke node **Send a text message**. Simpan, pastikan workflow Active. Workflow kedua (IP control) **tidak** diubah.

## 2. Persiapan uji

- **PENGUJI**: Kali Linux / laptop dengan IP publik, browser uji, dan akun customer uji terverifikasi (sebut **akun C**).
- **ADMIN**: dashboard admin (Security Events, Semua Pesanan), SSH ke APP dan WAZUH, Telegram.
- Pastikan IP penguji tidak sedang terblokir dari skenario lain (IP Response, Device & Akun Ban).
- Ambil slug produk yang aktif dan berstok:

  ```bash
  curl -s https://saladinshop.duckdns.org/api/products | python3 -c '
  import sys, json
  d = json.load(sys.stdin); items = d.get("data", d) if isinstance(d, dict) else d
  items = items.get("products", items) if isinstance(items, dict) else items
  for p in items[:5]: print(p.get("slug"), "| stok:", p.get("stock"))'
  ```

  Simpan salah satu sebagai `SLUG` untuk varian A/B.

## 3. Varian A — Bot tanpa CAPTCHA

Meniru bot yang memesan langsung ke API tanpa melewati halaman checkout.

**PENGUJI (Kali):**

```bash
SLUG=GANTI_DENGAN_SLUG_PRODUK
URL=https://saladinshop.duckdns.org/api/orders
body() { printf '{"product_id":"%s","quantity":1,"customer_name":"Bot Uji","customer_email":"bot.uji@example.com","customer_phone":"081200000000","payment_method":"va_bca"%s}' "$SLUG" "$1"; }

# A1: tanpa token (3x)
for i in 1 2 3; do
  curl -s -o /dev/null -w "A1-$i: %{http_code}\n" -H 'Content-Type: application/json' -d "$(body '')" "$URL"; sleep 2
done

# A2: token palsu (1x)
curl -s -w "\nA2: %{http_code}\n" -H 'Content-Type: application/json' \
  -d "$(body ',"turnstile_token":"token-palsu-buatan-bot"')" "$URL"

# Website tetap bisa diakses (tidak ada blokir)
curl -s -o /dev/null -w "Halaman utama: %{http_code}\n" https://saladinshop.duckdns.org/
```

**Hasil yang diharapkan:**
- A1-1..3: **400** "Verifikasi CAPTCHA wajib diselesaikan…" — tidak ada pesanan dibuat.
- A2: **403** "Verifikasi CAPTCHA gagal atau kedaluwarsa".
- Halaman utama: **200** (pembatasan hanya pada checkout, tidak ada blokir).

**ADMIN — APP:**

```bash
cd ~/ecommerce-security
grep -F '"event_type":"bot_order_attempt"' runtime-logs/security_events.log | tail -n 4 | cut -c1-230
```

**ADMIN — WAZUH:**

```bash
sudo grep -E '"id":"11051[23]"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-260
```

Cek: Security Events (`bot_order_attempt`), alert 110512 per percobaan dan 110513 setelah 3x, Telegram masuk, dan **tidak ada pesanan** dari `bot.uji@example.com` di menu Semua Pesanan.

> [Screenshot: output curl, event, alert 110512/110513, Telegram, Semua Pesanan tanpa pesanan bot, halaman utama tetap 200.]

## 4. Varian B — Flood checkout (rate limit)

Meniru banjir request checkout dari satu IP.

```bash
SLUG=GANTI_DENGAN_SLUG_PRODUK
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "B-$i: %{http_code}\n" -H 'Content-Type: application/json' \
    -d "{\"product_id\":\"$SLUG\",\"quantity\":1,\"customer_name\":\"Flood Uji\",\"customer_email\":\"flood.uji@example.com\",\"customer_phone\":\"081200000001\",\"payment_method\":\"va_bca\"}" \
    https://saladinshop.duckdns.org/api/orders
done
sleep 65
curl -s -o /dev/null -w "Setelah 1 menit: %{http_code}\n" -H 'Content-Type: application/json' \
  -d "{\"product_id\":\"$SLUG\",\"quantity\":1,\"customer_name\":\"Flood Uji\",\"customer_email\":\"flood.uji@example.com\",\"customer_phone\":\"081200000001\",\"payment_method\":\"va_bca\"}" \
  https://saladinshop.duckdns.org/api/orders
```

**Hasil yang diharapkan:** B-1..10 **400** (ditolak Turnstile), B-11 dan B-12 **429** "Terlalu banyak permintaan checkout". Setelah 1 menit, kembali **400** (rate limit pulih sendiri; masih 400 karena tanpa CAPTCHA).

```bash
# APP
grep -F 'Exceeded rate limit for checkout' runtime-logs/security_events.log | tail -n 2 | cut -c1-230
# WAZUH
sudo grep -E '"id":"1105(10|11|12|13)"' /var/ossec/logs/alerts/alerts.json | tail -n 5 | cut -c1-260
```

> [Screenshot: urutan status 400 → 429 → 400 setelah jeda, event checkout_abuse rate limit, alert 110510, Telegram.]

## 5. Varian C — Fake order (pesanan tidak dibayar)

Melalui **browser dan halaman checkout normal**, login sebagai **akun C**, CAPTCHA diselesaikan setiap kali.

1. Buat **3 pesanan** produk Sandbox, **jangan dibayar**. Catat kode pesanan dan waktu kedaluwarsa (15 menit).
2. Buat pesanan **ke-4** → alert di halaman checkout "Terlalu banyak pesanan yang menunggu pembayaran"; DevTools → Network `POST /api/orders`: **429**, `code: ACTIVE_PENDING_LIMIT`. Riwayat akun tetap 3 pending.
3. Ulangi checkout ke-4 **dua kali lagi** → tetap 429, pesanan tidak bertambah.
4. ADMIN: event `checkout_abuse` dengan `active_pending_limit=account; limit=3`, alert **110510** setiap penolakan dan **110511** setelah 3x, Telegram masuk. Akun C **tetap bisa** membuka website dan riwayat pesanannya (tidak diblokir/diban).
5. **Pemulihan otomatis:** setelah ±15 menit, worker mengubah ketiga pesanan menjadi `expired`/`cancelled`, lalu akun C bisa checkout normal lagi:

   ```bash
   sudo docker compose -f docker-compose.aws.yml logs --no-color --tail=40 order-expiry-worker
   ```

```bash
# APP
grep -F '"event_type":"checkout_abuse"' runtime-logs/security_events.log | tail -n 4 | cut -c1-230
# WAZUH
sudo grep -E '"id":"11051[01]"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-260
```

> [Screenshot: riwayat 3 pending, alert checkout ke-4 + Network 429, event, alert 110510/110511, Telegram, akun C tetap bisa akses website, log worker expired, checkout normal setelah pesanan kedaluwarsa.]

## 6. Kontrol normal (false positive)

- Pelanggan biasa: 1 pesanan dengan CAPTCHA sah → berhasil sampai halaman pembayaran Midtrans Sandbox. Tidak ada event/alert.
- Pelanggan dengan 3 pending yang mencoba sekali lagi → 429 + alert 110510 saja; website tetap bisa diakses.
- CAPTCHA kedaluwarsa sekali → 403 + `bot_order_attempt`; ulangi dengan CAPTCHA baru → berhasil.

## 7. Batasan (untuk laporan)

- Respons S06 sengaja **pembatasan + notifikasi**, bukan pemblokiran, karena pola ini dapat terjadi pada pelanggan biasa. Pelaku yang gigih tetap dapat mencoba lagi setelah pembatasan berakhir; admin mengetahuinya dari alert berulang (110511/110513) dan dapat memblokir manual dari dashboard bila perlu.
- Turnstile menghambat bot otomatis, tetapi tidak menghentikan manusia yang menyelesaikan CAPTCHA (atau layanan pemecah CAPTCHA). Batas pending dan rate limit menjadi lapisan berikutnya.
- Batas pending per IP dapat mengenai beberapa pengguna di jaringan bersama; karena itu batas per IP (5) lebih longgar daripada per akun (3).
- Rate limit disimpan di memori proses aplikasi; restart/recreate container mereset hitungannya.
- Checkout tamu (tanpa login) hanya dibatasi per IP.
- Hasil berlaku untuk endpoint `POST /api/orders` dan konfigurasi saat pengujian, bukan klaim seluruh bentuk penyalahgunaan bisnis tertutup.
