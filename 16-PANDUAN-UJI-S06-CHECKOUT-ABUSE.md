# Panduan Uji S06 — Bot, Fake Order, dan Checkout Abuse

Uji hanya pada website penelitian, dengan produk dan pembayaran **Midtrans Sandbox**, akun uji, serta data pelanggan sintetis. Kerangka: [OWASP API6:2023 Unrestricted Access to Sensitive Business Flows](https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/).

## 0. Apa yang diuji

Checkout dapat disalahgunakan tanpa membobol apa pun: bot membuat pesanan otomatis, atau pelaku menumpuk pesanan yang tidak pernah dibayar sehingga stok/antrian terganggu. S06 memeriksa **tiga kontrol berlapis** pada `POST /api/orders`:

| Varian | Serangan | Kontrol aplikasi | Event | HTTP |
|---|---|---|---|---|
| **A. Bot tanpa CAPTCHA** | Script/curl memesan langsung ke API tanpa token Turnstile, atau dengan token palsu | Verifikasi Cloudflare Turnstile **sebelum** pesanan dibuat | `bot_order_attempt` | 400 (token kosong) / 403 (token tidak sah) |
| **B. Flood checkout** | Banyak request checkout dalam waktu singkat | Rate limit 10 request/menit per IP | `checkout_abuse` (`Exceeded rate limit for checkout`) | 429 |
| **C. Fake order** | Membuat banyak pesanan lalu tidak membayar | Maksimal **3 pesanan pending per akun**, **5 per IP**; pesanan tak dibayar kedaluwarsa 15 menit | `checkout_abuse` (`active_pending_limit=...`) | 429 `ACTIVE_PENDING_LIMIT` |

Urutan pemeriksaan di server: rate limit → deteksi SQLi/XSS → validasi data → **Turnstile** → stok/voucher → **batas pending** → baru membuat transaksi Midtrans. Jadi bot dan flood ditolak **sebelum** ada pesanan atau transaksi yang dibuat.

**Respons otomatis:**

| Lapisan | Kapan |
|---|---|
| Alert Wazuh + Telegram | Setiap event (110510/110512), level tinggi saat berulang (110511/110513) |
| Blokir IP Nginx 30 menit (Active Response) | 3 event sejenis dari IP sama dalam jendela rule (110511/110513) |
| Ban perangkat (+ akun bila login) 30 menit | 3 event sejenis dalam 10 menit (aplikasi) |

Satu kali kena batas pending atau satu kali CAPTCHA kedaluwarsa **tidak** memblokir — itu bisa terjadi pada pelanggan biasa.

## 1. Konfigurasi sekali (sebelum uji)

### 1.1 EC2 App — deploy kode terbaru

Kode terbaru menambahkan ambang 3x untuk `checkout_abuse` dan `bot_order_attempt` pada ban perangkat/akun.

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

### 1.2 EC2 Wazuh — rule checkout dan bot

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
    <description>SALADINSHOP: Checkout rejected (pending limit or checkout flood) from $(ip_address)</description>
    <group>business_logic,checkout_abuse,</group>
  </rule>

  <rule id="110511" level="10" frequency="3" timeframe="600">
    <if_matched_sid>110510</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated checkout abuse from $(ip_address)</description>
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

Validasi:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t
echo "analysisd exit code: $?"
```

### 1.3 EC2 Wazuh — Active Response dan notifikasi

Tambahkan **`110511,110513`** ke `<rules_id>` blok Active Response yang ber-timeout **1800** (bukan 110510/110512 — satu kejadian tidak boleh memblokir):

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-s06
sudo nano /var/ossec/etc/ossec.conf
```

```xml
<!-- contoh setelah diubah; pertahankan ID lain yang sudah ada -->
<rules_id>110401,110411,110420,110421,110501,110603,110511,110513</rules_id>
```

Agar Telegram menerima alert, tambahkan `110510,110511,110512,110513` pada `<rule_id>` blok `<integration>` custom-n8n.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
sudo grep -F 'saladinshop-ip-control' /var/ossec/etc/shared/ar.conf
```

> Mengubah timeout di `ossec.conf` dapat mengubah daftar `ar.conf`. Dashboard admin aman karena n8n sekarang memanggil `!saladinshop-ip-control.py`.

Uji rule tanpa menyerang (`sudo /var/ossec/bin/wazuh-logtest`, tempel lalu Enter; cari `id: '110512'`):

```json
{"event_type":"bot_order_attempt","severity":"medium","ip_address":"203.0.113.60","method":"POST","endpoint":"/api/orders","user_agent":"curl/8.9.0","payload_snippet":"turnstile_token=missing","status_code":400,"request_id":"req-logtest-s06","created_at":"2026-11-02T10:00:00.000Z"}
```

### 1.4 n8n (homelab) — workflow pertama (Telegram)

Pada **workflow pertama** (Webhook → Edit Fields → **Switch** → Telegram), tambahkan output Switch baru, misalnya **"110511/110513 — Checkout/Bot"**, dengan kondisi rule id = `110511` atau `110513` (dan opsional `110510`, `110512`), lalu sambungkan ke node **Send a text message**. Simpan, pastikan workflow Active. Workflow kedua (IP control) **tidak** diubah.

## 2. Persiapan uji

- **PENGUJI**: Kali Linux / laptop dengan IP publik yang tidak di-allowlist, browser uji, dan akun customer uji terverifikasi (sebut **akun C**).
- **ADMIN**: dashboard admin (Security Events, IP Response, Device & Akun Ban), SSH ke APP dan WAZUH, Telegram.
- Sebelum tiap varian: unblock IP penguji, buka ban perangkat/akun di dashboard, dan beri jeda 10 menit dari varian sebelumnya agar hitungan tidak tercampur.
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
JAR=/tmp/bot-cookies.txt; rm -f "$JAR"
curl -s -c "$JAR" -b "$JAR" -o /dev/null https://saladinshop.duckdns.org/   # bot "membuka" website dulu

body() { printf '{"product_id":"%s","quantity":1,"customer_name":"Bot Uji","customer_email":"bot.uji@example.com","customer_phone":"081200000000","payment_method":"va_bca"%s}' "$SLUG" "$1"; }

# A1: tanpa token (3x)
for i in 1 2 3; do
  curl -s -c "$JAR" -b "$JAR" -o /dev/null -w "A1-$i: %{http_code}\n" \
    -H 'Content-Type: application/json' -d "$(body '')" "$URL"; sleep 2
done

# A2: token palsu (1x)
curl -s -c "$JAR" -b "$JAR" -w "\nA2: %{http_code}\n" -H 'Content-Type: application/json' \
  -d "$(body ',"turnstile_token":"token-palsu-buatan-bot"')" "$URL"

sleep 15
# Setelah ambang: akses halaman utama dengan "perangkat" bot yang sama
curl -s -c "$JAR" -b "$JAR" -o /dev/null -w "Akses setelah ambang: %{http_code}\n" https://saladinshop.duckdns.org/
```

**Hasil yang diharapkan:**
- A1-1..3: **400** "Verifikasi CAPTCHA wajib diselesaikan…" — tidak ada pesanan dibuat.
- A2: **403** (atau sudah 403 karena perangkat terban — catat yang terjadi).
- Akses setelah ambang: **403** (ban perangkat dan/atau blokir IP oleh 110513).

**ADMIN — APP:**

```bash
cd ~/ecommerce-security
grep -E '"event_type":"(bot_order_attempt|device_banned)"' runtime-logs/security_events.log | tail -n 6 | cut -c1-230
read -r -p "IP penguji: " IP_UJI
sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
```

**ADMIN — WAZUH:**

```bash
sudo grep -E '"id":"11051[23]"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-260
```

Dashboard: Security Events (`bot_order_attempt`), Device & Akun Ban (pemicu `bot_order_attempt`), IP Response (blokir sementara 30 menit), Telegram (110513). Pastikan **tidak ada pesanan baru** di menu Semua Pesanan dari email `bot.uji@example.com`.

> [Screenshot: output curl, event + device_banned, alert 110512/110513, Telegram, deny + 403, Semua Pesanan tanpa pesanan bot.]

## 4. Varian B — Flood checkout (rate limit)

Meniru banjir request checkout. Tanpa cookie jar agar yang diuji murni batas per IP (bukan ban perangkat). Lakukan dari IP yang sudah di-unblock dan setelah jeda 10 menit dari varian A.

```bash
SLUG=GANTI_DENGAN_SLUG_PRODUK
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "B-$i: %{http_code}\n" -H 'Content-Type: application/json' \
    -d "{\"product_id\":\"$SLUG\",\"quantity\":1,\"customer_name\":\"Flood Uji\",\"customer_email\":\"flood.uji@example.com\",\"customer_phone\":\"081200000001\",\"payment_method\":\"va_bca\"}" \
    https://saladinshop.duckdns.org/api/orders
done
```

**Hasil yang diharapkan:** request awal **400** (ditolak Turnstile), lalu sejak request ke-11 dalam satu menit **429** "Terlalu banyak permintaan checkout". Jika IP sudah terblokir oleh 110513 sebelum ke-11 (karena request awal juga `bot_order_attempt`), status berubah menjadi **403** — catat urutan sebenarnya; dua lapisan sama-sama bekerja.

```bash
# APP
grep -F 'Exceeded rate limit for checkout' runtime-logs/security_events.log | tail -n 2 | cut -c1-230
# WAZUH
sudo grep -E '"id":"1105(10|11|13)"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-260
```

> [Screenshot: urutan status 400 → 429/403, event checkout_abuse rate limit, alert, deny.]

## 5. Varian C — Fake order (pesanan tidak dibayar)

Melalui **browser dan halaman checkout normal**, login sebagai **akun C**, CAPTCHA diselesaikan setiap kali.

1. Buat **3 pesanan** produk Sandbox, **jangan dibayar**. Catat kode pesanan dan waktu kedaluwarsa (15 menit).
2. Buat pesanan **ke-4** → alert di halaman checkout "Terlalu banyak pesanan yang menunggu pembayaran"; DevTools → Network `POST /api/orders`: **429**, `code: ACTIVE_PENDING_LIMIT`. Riwayat akun tetap 3 pending.
3. ADMIN: event `checkout_abuse` dengan `active_pending_limit=account; limit=3`, alert **110510** (level 6, notifikasi saja). **Belum ada blokir** — satu kali kena batas masih wajar untuk pelanggan.
4. Ulangi checkout ke-4 **dua kali lagi** (total 3 penolakan dalam 10 menit, CAPTCHA tetap diselesaikan).
5. Hasil: alert **110511**, IP diblokir 30 menit, perangkat **dan akun C** diban 30 menit (sesi akun C keluar). Login akun C dari VPN/incognito → 403 "Akun ini dibatasi sementara".
6. **Kedaluwarsa:** setelah ±15 menit, worker mengubah ketiga pesanan menjadi `expired`/`cancelled`:

   ```bash
   sudo docker compose -f docker-compose.aws.yml logs --no-color --tail=40 order-expiry-worker
   ```

   Setelah ban dibuka, akun C bisa checkout normal lagi.

```bash
# APP
grep -E '"event_type":"(checkout_abuse|device_banned|account_banned)"' runtime-logs/security_events.log | tail -n 6 | cut -c1-230
# WAZUH
sudo grep -E '"id":"11051[01]"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-260
```

> [Screenshot: riwayat 3 pending, alert checkout ke-4 + Network 429, event, alert 110510 lalu 110511, Telegram, IP Response + Device & Akun Ban (akun C), log worker expired, checkout normal setelah pulih.]

## 6. Kontrol normal (false positive)

- Pelanggan biasa: 1 pesanan dengan CAPTCHA sah → berhasil sampai halaman pembayaran Midtrans Sandbox. Tidak ada event/alert.
- Pelanggan dengan 3 pending yang mencoba sekali lagi → hanya 429 + alert 110510, **tanpa** blokir/ban.
- CAPTCHA kedaluwarsa sekali → 403 + `bot_order_attempt`, **tanpa** blokir/ban; ulangi dengan CAPTCHA baru → berhasil.

## 7. Batasan (untuk laporan)

- Turnstile menghambat bot otomatis, tetapi tidak menghentikan manusia yang menyelesaikan CAPTCHA (atau layanan pemecah CAPTCHA). Batas pending dan rate limit menjadi lapisan berikutnya.
- Batas pending per IP dapat mengenai beberapa pengguna di jaringan bersama (kantor/kampus); karena itu ambang per IP lebih longgar (5) daripada per akun (3).
- Rate limit dan ambang ban disimpan di memori proses aplikasi; restart/recreate container mereset hitungan.
- Checkout tamu (tanpa login) hanya dibatasi per IP dan perangkat; ban akun hanya berlaku bila pelaku login.
- Hasil berlaku untuk endpoint `POST /api/orders` dan konfigurasi saat pengujian, bukan klaim seluruh bentuk penyalahgunaan bisnis tertutup.
