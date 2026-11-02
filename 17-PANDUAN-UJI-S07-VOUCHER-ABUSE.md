# Panduan Uji S07 — Voucher Abuse

Uji hanya pada website penelitian, dengan voucher uji, akun uji, dan pembayaran **Midtrans Sandbox**. Kerangka: [OWASP API6:2023 Unrestricted Access to Sensitive Business Flows](https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/).

## 0. Apa yang diuji dan kebijakan responsnya

Voucher abuse merugikan toko tanpa membobol sistem: menebak kode voucher, memakai voucher sekali-pakai berulang kali, mengirim checkout paralel agar voucher terpakai dua kali, atau memanipulasi nilai diskon dari sisi klien.

| Varian | Serangan | Kontrol aplikasi | Respons yang diharapkan |
|---|---|---|---|
| **A. Tebak kode** | Mencoba banyak kode acak di `POST /api/vouchers/validate` | Kode harus ada & aktif; rate limit 20/menit per IP | 404 per kode salah; 429 setelah 20/menit |
| **B. Pakai ulang** | Akun yang sudah memakai voucher sekali-pakai mencoba lagi | Cek pemakaian per akun (pesanan dibayar atau pending aktif) | 400 "sudah pernah digunakan" |
| **C. Race condition** | Dua checkout **bersamaan** dengan voucher yang sama dari akun sama | Kunci transaksi per voucher+akun lalu cek ulang (`pg_advisory_xact_lock`) | Satu 201, satu **409**; hanya 1 pemakaian tercatat |
| **D. Manipulasi diskon** | Menyisipkan `discount_amount`/`total_amount` palsu di body checkout | Diskon dan total **dihitung server** dari database; request yang membawa field harga **ditolak dan dicatat** (`checkout_tampering_attempt`) | 400 + alert 110524; tanpa field palsu, total tetap harga − diskon resmi |

Syarat voucher lain yang selalu diperiksa server: wajib login, masa berlaku, minimal subtotal. Voucher pada pesanan yang kedaluwarsa/dibatalkan tidak dihitung terpakai (pelanggan boleh memakainya lagi).

**Event:** semua penolakan dicatat sebagai `voucher_abuse_attempt` dengan `payload_snippet` berisi alasan:

| `reason=` | Arti | Severity |
|---|---|---|
| `invalid_code` | Kode tidak ada/tidak aktif/kedaluwarsa | low |
| `reuse` | Voucher sekali-pakai sudah dipakai akun ini | medium |
| `concurrent_reuse` | Kalah balapan pada checkout paralel | high |
| *(Exceeded rate limit for apply_voucher)* | Lebih dari 20 validasi/menit | medium |

**Kebijakan respons S07: dibatasi dan dipantau, tidak diblokir** — sama seperti S06. Salah ketik kode atau mencoba voucher yang sudah dipakai adalah perilaku pelanggan biasa. Aplikasi menolak, Wazuh mendeteksi pola, n8n memberi tahu admin. Tidak ada Active Response maupun ban perangkat/akun.

## 1. Konfigurasi sekali (sebelum uji)

### 1.1 EC2 App — deploy kode terbaru

Kode terbaru menambahkan pencatatan penolakan voucher, kunci transaksi untuk race condition, dan mengeluarkan voucher dari pemicu ban.

```bash
cd ~/ecommerce-security
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app order-expiry-worker
```

Pastikan voucher uji ada dan aktif (seed bawaan: **HEMAT5K**, diskon Rp5.000, minimal belanja Rp30.000, wajib login, sekali pakai per akun):

```bash
sudo docker compose -f docker-compose.aws.yml exec -T app node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
p.voucher.findMany({ select: { code: true, isActive: true, discountAmount: true, minSubtotal: true,
  endDate: true, requiresAuth: true, singleUsePerAccount: true } })
 .then(v => { console.table(v); return p.\$disconnect(); });"
```

### 1.2 EC2 Wazuh — rule voucher (alert saja)

```bash
sudo grep -n -A 8 'id="11052[0-3]"' /var/ossec/etc/rules/saladinshop_rules.xml
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml \
  /var/ossec/etc/rules/saladinshop_rules.xml.backup-s07
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

Tambahkan setelah grup terakhir yang sudah ditutup (jangan menimpa ID yang sudah dipakai):

```xml
<group name="saladinshop,web_security,voucher_abuse,">
  <rule id="110520" level="5">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^voucher_abuse_attempt$</field>
    <description>SALADINSHOP: Voucher rejected from $(ip_address)</description>
    <group>business_logic,voucher_abuse,</group>
  </rule>

  <rule id="110521" level="8">
    <if_sid>110520</if_sid>
    <field name="payload_snippet" type="pcre2">reason=reuse</field>
    <description>SALADINSHOP: Single-use voucher reuse attempt from $(ip_address)</description>
    <group>business_logic,voucher_abuse,voucher_reuse,</group>
  </rule>

  <rule id="110522" level="10">
    <if_sid>110520</if_sid>
    <field name="payload_snippet" type="pcre2">reason=concurrent_reuse</field>
    <description>SALADINSHOP: Concurrent voucher reuse (race condition) blocked from $(ip_address)</description>
    <group>business_logic,voucher_abuse,race_condition,</group>
  </rule>

  <rule id="110523" level="10" frequency="5" timeframe="300">
    <if_matched_sid>110520</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated voucher rejections (possible code guessing) from $(ip_address)</description>
    <group>business_logic,voucher_abuse,voucher_guessing,</group>
  </rule>

  <rule id="110524" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^checkout_tampering_attempt$</field>
    <description>SALADINSHOP: Checkout price/discount tampering rejected from $(ip_address)</description>
    <group>business_logic,price_tampering,</group>
  </rule>
</group>
```

Lalu tambahkan `110520,110521,110522,110523,110524` ke `<rule_id>` blok `<integration>` custom-n8n. **Jangan** masukkan ke `<rules_id>` Active Response.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

Uji rule (`sudo /var/ossec/bin/wazuh-logtest`, tempel lalu Enter; cari `id: '110521'`):

```json
{"event_type":"voucher_abuse_attempt","severity":"medium","ip_address":"203.0.113.70","method":"POST","endpoint":"/api/vouchers/validate","user_agent":"test","payload_snippet":"reason=reuse; code=HEMAT5K","status_code":400,"request_id":"req-logtest-s07","created_at":"2026-11-02T10:00:00.000Z"}
```

### 1.3 n8n — workflow pertama (Telegram)

Tambahkan output Switch (format sama seperti sebelumnya) lalu sambungkan ke **Send a text message**:

| Rule | Nama output |
|---|---|
| 110520 | `110520 — Voucher Rejected` |
| 110521 | `110521 — Voucher Reuse` |
| 110522 | `110522 — Voucher Race Blocked` |
| 110523 | `110523 — Voucher Guessing` |
| 110524 | `110524 — Price Tampering` |

Opsional: untuk mengurangi spam, 110520 (penolakan tunggal) boleh tidak disambungkan ke Telegram — cukup terlihat di dashboard Wazuh.

## 2. Persiapan uji

- **Akun D** — akun uji terverifikasi yang **belum pernah** memakai HEMAT5K (untuk varian B).
- **Akun E** — akun uji terverifikasi lain yang **belum pernah** memakai HEMAT5K (untuk varian C).
- Produk dengan harga ≥ Rp30.000 (memenuhi minimal subtotal HEMAT5K). Catat slug-nya.
- Pastikan IP penguji tidak sedang terblokir dari skenario lain.

## 3. Varian A — Tebak kode voucher

**PENGUJI (Kali)** — tanpa login, mencoba 8 kode acak:

```bash
URL=https://saladinshop.duckdns.org/api/vouchers/validate
for c in DISKON50 GRATIS100 PROMO2026 HEMAT10K HEMAT50K NEWUSER VIP99 FLASH90; do
  curl -s -o /dev/null -w "$c: %{http_code}\n" -H 'Content-Type: application/json' \
    -d "{\"code\":\"$c\",\"subtotal\":50000}" "$URL"
  sleep 1
done
```

**Hasil yang diharapkan:** semua **404** "Kode voucher tidak ditemukan". Website tetap bisa diakses.

Lanjutan (rate limit) — 25 permintaan cepat:

```bash
for i in $(seq 1 25); do
  curl -s -o /dev/null -w "%{http_code} " -H 'Content-Type: application/json' \
    -d "{\"code\":\"TEBAK$i\",\"subtotal\":50000}" "$URL"
done; echo
```

**Hasil:** 404 sampai sekitar permintaan ke-20 (dihitung bersama 8 percobaan sebelumnya dalam menit yang sama), lalu **429**. Setelah 1 menit, kembali 404.

**ADMIN:**

```bash
# APP
cd ~/ecommerce-security
grep -F '"event_type":"voucher_abuse_attempt"' runtime-logs/security_events.log | tail -n 5 | cut -c1-230
# WAZUH
sudo grep -E '"id":"11052[03]"' /var/ossec/logs/alerts/alerts.json | tail -n 4 | cut -c1-230
```

Cari `reason=invalid_code`, alert **110520** per percobaan, **110523** setelah 5 dalam 5 menit, event `Exceeded rate limit for apply_voucher`, dan Telegram "Voucher Guessing".

> [Screenshot: output curl 404 → 429, event invalid_code, alert 110523, Telegram, website tetap 200.]

## 4. Varian B — Pakai ulang voucher sekali-pakai

1. Login sebagai **akun D**, checkout produk ≥ Rp30.000 dengan voucher **HEMAT5K** → diskon Rp5.000 diterapkan, pesanan dibuat (boleh dibayar via Sandbox atau dibiarkan pending — pending aktif tetap dihitung terpakai).
2. Masih sebagai akun D, buka checkout lagi dan masukkan **HEMAT5K** → klik terapkan.
   **Hasil:** ditolak "Anda sudah pernah menggunakan voucher HEMAT5K…" (Network: `POST /api/vouchers/validate` **400**, `ALREADY_USED`).
3. Coba melewati validasi tampilan: di Console browser akun D (setelah CAPTCHA di halaman checkout diselesaikan):

   ```javascript
   (async () => {
     const r = await fetch('/api/orders', {
       method: 'POST', credentials: 'same-origin',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         product_id: 'GANTI_SLUG_PRODUK', quantity: 1,
         customer_name: 'Uji Voucher D', customer_email: 'GANTI_EMAIL_AKUN_D',
         customer_phone: '081200000002', payment_method: 'va_bca',
         voucher_code: 'HEMAT5K',
         turnstile_token: window.turnstile.getResponse()
       })
     });
     console.log(r.status, await r.json());
   })();
   ```

   **Hasil:** **400** "Voucher HEMAT5K sudah pernah Anda gunakan sebelumnya." — tidak ada pesanan baru.
4. ADMIN: event `reason=reuse` (2x: dari validate dan checkout), alert **110521**, Telegram "Voucher Reuse".

> [Screenshot: pesanan pertama dengan diskon, penolakan di UI, respons Console 400, event reuse, alert 110521, Telegram.]

## 5. Varian C — Race condition (dua checkout bersamaan)

Tujuan: membuktikan voucher sekali-pakai tidak bisa terpakai dua kali walaupun dua request checkout dikirim pada saat yang sama.

1. Login sebagai **akun E** (belum pernah memakai HEMAT5K).
2. Buka halaman checkout produk yang sama di **dua tab**. Selesaikan CAPTCHA di **kedua** tab.
3. Di **tab 1**, Console: `copy(window.turnstile.getResponse())` lalu tempel ke catatan sebagai TOKEN_1.
4. Di **tab 2**, Console, jalankan (ganti TOKEN_1, slug, email):

   ```javascript
   (async () => {
     const order = (token) => fetch('/api/orders', {
       method: 'POST', credentials: 'same-origin',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         product_id: 'GANTI_SLUG_PRODUK', quantity: 1,
         customer_name: 'Uji Race E', customer_email: 'GANTI_EMAIL_AKUN_E',
         customer_phone: '081200000003', payment_method: 'va_bca',
         voucher_code: 'HEMAT5K', turnstile_token: token
       })
     }).then(async (r) => ({ status: r.status, body: await r.json() }));

     const results = await Promise.all([
       order('TOKEN_1'),
       order(window.turnstile.getResponse())
     ]);
     console.table(results.map(r => ({ status: r.status, message: r.body.message || r.body.data?.order_code })));
   })();
   ```

5. **Hasil yang diharapkan:** satu **201** (pesanan dibuat dengan diskon) dan satu **409** "Voucher HEMAT5K sudah dipakai pada pesanan lain dari akun Anda" — atau **400** "sudah pernah Anda gunakan" bila request kedua tiba setelah yang pertama selesai. **Tidak boleh** dua-duanya 201.
6. Verifikasi pemakaian voucher di database hanya 1:

   ```bash
   sudo docker compose -f docker-compose.aws.yml exec -T app node -e "
   const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
   p.voucherUsage.findMany({ where: { voucher: { code: 'HEMAT5K' }, user: { email: 'GANTI_EMAIL_AKUN_E' } },
     select: { usedAt: true, order: { select: { orderCode: true, paymentStatus: true } } } })
    .then(r => { console.log(r.length, 'pemakaian'); console.table(r.map(x => ({ ...x.order, usedAt: x.usedAt }))); return p.\$disconnect(); });"
   ```

   **Hasil:** `1 pemakaian`.
7. ADMIN: event `reason=concurrent_reuse` (bila 409), alert **110522**, Telegram "Voucher Race Blocked".

Catatan: pesanan yang kalah balapan sempat membuat transaksi Midtrans Sandbox yang tidak pernah dibayar; transaksi itu kedaluwarsa sendiri dan **tidak** membuat pesanan maupun pemakaian voucher.

> [Screenshot: tabel Console 201 + 409, query `1 pemakaian`, event concurrent_reuse, alert 110522, Telegram.]

## 6. Varian D — Manipulasi nilai diskon

Gunakan akun lain yang belum memakai HEMAT5K (atau akun E setelah pesanan varian C kedaluwarsa). Di Console halaman checkout (CAPTCHA sudah diselesaikan):

```javascript
(async () => {
  const r = await fetch('/api/orders', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: 'GANTI_SLUG_PRODUK', quantity: 1,
      customer_name: 'Uji Manipulasi', customer_email: 'GANTI_EMAIL_AKUN',
      customer_phone: '081200000004', payment_method: 'va_bca',
      voucher_code: 'HEMAT5K',
      discount_amount: 999999, total_amount: 1000, price: 1,
      turnstile_token: window.turnstile.getResponse()
    })
  });
  const j = await r.json();
  console.log(r.status, { total_amount: j.data?.total_amount, order_code: j.data?.order_code });
})();
```

**Hasil yang diharapkan (versi kode terbaru):** **400** "Data pesanan tidak valid." — pesanan **tidak** dibuat. Event `checkout_tampering_attempt` dengan `fields=total_amount,discount,...` beserta nilai palsunya, alert **110524**, Telegram "Price Tampering". Tidak ada blokir (kebijakan S07).

Cek di APP:

```bash
grep -F 'checkout_tampering_attempt' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 2 | cut -c1-260
```

**Pembanding (kontrol):** jalankan script yang sama **tanpa** baris `discount_amount, total_amount, price` → **201** dengan `total_amount` = harga − Rp5.000 + biaya admin (Rp750 + 0,7%). Contoh pengujian 3 November 2026 pada versi sebelumnya (field palsu masih diabaikan diam-diam): produk Rp199.000 → subtotal Rp194.000 + biaya Rp2.108 = **Rp196.108**, bukan Rp1.000. Cocokkan di dashboard admin dan halaman Midtrans Sandbox.

> [Screenshot: body request berisi nilai palsu + respons 400, event + alert 110524 + Telegram, dan pembanding 201 dengan total yang benar.]

Untuk laporan: versi sebelumnya sudah **mencegah** manipulasi (server menghitung sendiri), tetapi **tidak memantaunya** — percobaan tidak meninggalkan jejak di Wazuh. Versi terbaru menambah deteksi dan notifikasi.

## 7. Kontrol normal (false positive)

- Pelanggan memakai HEMAT5K pertama kali → diskon diterapkan, **tidak ada** event.
- Pelanggan salah ketik kode sekali → 404 + satu alert 110520 (level rendah), tanpa 110523, tanpa blokir.
- Pesanan dengan HEMAT5K dibiarkan kedaluwarsa → pelanggan boleh memakai HEMAT5K lagi (pemakaian lama tidak dihitung).

## 8. Batasan (untuk laporan)

- Respons S07 sengaja **pembatasan + notifikasi**. Penebak kode tetap dapat mencoba lagi setelah rate limit pulih; admin melihat pola dari alert 110523 dan dapat memblokir manual dari dashboard bila perlu.
- Deteksi tebak kode dihitung per IP; penebak yang memutar IP tidak terkorelasi oleh rule 110523.
- Batas "sekali pakai" berlaku per akun. Satu orang dengan banyak akun dapat memakai voucher di tiap akun — mitigasinya di luar cakupan (verifikasi identitas/perangkat).
- Kunci race condition diuji pada endpoint `POST /api/orders` dengan dua request paralel; bukan bukti semua kombinasi konkurensi tertutup.
