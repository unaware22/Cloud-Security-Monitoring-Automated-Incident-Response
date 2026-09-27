# Tahap 1 — Keamanan akses dan data pesanan

Kode, tes, commit, dan push dikerjakan di repository. Langkah pada EC2 dan n8n di bawah dikerjakan pemilik sistem.

## Perubahan aplikasi

- Detail dan riwayat pesanan memeriksa kepemilikan dalam query database. Pesanan yang mempunyai `userId` hanya dapat diakses akun tersebut. Pencocokan email hanya berlaku untuk pesanan guest (`userId = null`) melalui sesi customer dengan email terverifikasi.
- Detail pesanan tidak mengembalikan seluruh objek produk, voucher, transaksi, atau inventori `Product.deliveryContent`.
- Produk digital ditampilkan dari `DigitalDelivery.deliveryData` milik pesanan tersebut, hanya jika pembayaran `paid`/`paid_manual` dan pengiriman `delivered`/`resent`. Tidak ada fallback ke credential stok produk yang belum dialokasikan.
- Pesanan tidak dikenal dan bukan milik pengguna mempunyai respons `404` yang sama.
- Kegagalan pencarian detail menghasilkan `unauthorized_object_access_attempt`. Event ini merupakan indikasi akses ditolak; salah ketik kode juga dapat memicunya. Satu event bukan bukti pasti penyerangan.
- Log baru tidak memuat email customer atau kode pesanan mentah. `order_ref` adalah hash untuk korelasi.
- Sesi customer yang belum terverifikasi atau role-nya bukan customer ditolak.
- Rate limit detail: 30 request/menit/IP. Verifikasi pembayaran: 12 request/menit/IP. Penyimpanan limiter masih in-memory untuk satu instance; restart menghapus bucket.
- Endpoint publik lama `/api/orders/manual-payment` sekarang mengembalikan `410` dan tidak mengubah pesanan. Checkout Midtrans serta fungsi admin yang sudah ada tetap terpisah dari endpoint ini.
- Tidak ada perubahan schema/migrasi database pada tahap ini.

## 1. Deploy di EC2 aplikasi

SSH melalui Tailscale seperti biasa, lalu:

```bash
cd ~/ecommerce-security
git status --short
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app
sudo docker compose -f docker-compose.aws.yml logs --tail=50 app
```

Jika `git status` memperlihatkan perubahan pada file yang akan diperbarui atau pull gagal, jangan memakai `reset --hard`. Simpan perubahan tersebut terlebih dahulu. Folder `fim-test/` yang untracked tidak perlu dihapus.

Tidak perlu mengganti key Midtrans, Google, SMTP, atau Turnstile. Pastikan menggunakan URL dan CAPTCHA yang sebelumnya sudah berhasil.

## 2. Uji normal dan akses akun lain

1. Login akun A yang emailnya terverifikasi; buat satu pesanan sandbox.
2. Buka riwayat akun A: pesanan tetap muncul. Sebelum bayar, tidak boleh ada credential produk.
3. Selesaikan pembayaran sandbox. Setelah pengiriman selesai, hanya credential yang dialokasikan untuk pesanan tersebut yang tampil.
4. Catat kode pesanan A, lalu login sebagai akun B pada profil browser berbeda.
5. Di halaman website akun B, buka Developer Tools → Console, jalankan perintah berikut dengan kode A:

```javascript
fetch('/api/user/orders/KODE-PESANAN-A', { credentials: 'same-origin' })
  .then(async response => console.log(response.status, await response.json()));
```

Hasil harus `404`, tanpa detail pesanan. Akun B juga tidak boleh melihat pesanan A di riwayat, meskipun email penerima pesanan A diubah ke email B. Hubungan `userId` tetap menentukan pemilik.

6. Logout, ulangi akses detail: hasil `401`.
7. Cek penutupan endpoint lama dari terminal EC2 aplikasi:

```bash
curl -i -X POST https://saladinshop.duckdns.org/api/orders/manual-payment \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Hasil harus `410`; tidak ada submission/status pesanan yang berubah.

8. Cek event di EC2 aplikasi:

```bash
sudo grep -F '"event_type":"unauthorized_object_access_attempt"' \
  ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3
```

## 3. Tambahkan rule di EC2 Wazuh Manager

Pastikan ID belum dipakai:

```bash
sudo grep -R -n 'id="11050[01]"' /var/ossec/etc/rules
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml \
  /var/ossec/etc/rules/saladinshop_rules.xml.backup-order-access
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

Tambahkan blok berikut setelah grup terakhir yang sudah ditutup. Jangan hapus rule yang sudah ada.

```xml
<group name="saladinshop,web_security,order_access,">
  <rule id="110500" level="8">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^unauthorized_object_access_attempt$</field>
    <description>SALADINSHOP: Customer order access denied from $(ip_address)</description>
    <group>authorization_failure,possible_bola,</group>
  </rule>

  <rule id="110501" level="12" frequency="3" timeframe="300">
    <if_matched_sid>110500</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated denied customer order access from $(ip_address)</description>
    <group>authorization_failure,possible_bola,repeated_access,</group>
  </rule>
</group>
```

Validasi sebelum restart:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t
echo $?
```

Hasil harus `0`. Jangan restart jika ada error. Korelasi `frequency` harus diuji dengan `wazuh-logtest` dan event nyata pada versi Wazuh yang terpasang; jangan menganggap jumlah alert yang terlihat pasti sama dengan jumlah request.

Sintaks korelasi menggunakan `same_field` untuk field JSON dinamis mengikuti [dokumentasi resmi Wazuh](https://documentation.wazuh.com/current/user-manual/ruleset/ruleset-xml-syntax/rules.html#same-field). Target konfigurasi ini adalah tiga akses ditolak dengan IP sama dalam 300 detik.

## 4. Integrasi Wazuh → workflow pertama n8n

Pada EC2 Wazuh Manager:

```bash
sudo nano /var/ossec/etc/ossec.conf
```

Cari blok `<integration>` dengan `<name>custom-n8n</name>`. Tambahkan `110500,110501` ke daftar `<rule_id>` yang sudah ada. Pertahankan API key, URL webhook, dan rule `120000` yang sebelumnya bekerja.

Pada workflow pertama penerima alert Wazuh (`/webhook/wazuh-alert`):

1. Buka node Switch setelah Edit Fields.
2. Tambahkan dua kondisi string dengan nilai kiri dalam mode Expression: `{{ $json.rule_id }}`.
3. Nilai kanan masing-masing `110500` dan `110501`, operator `is equal to`.
4. Hubungkan output keduanya ke node Telegram yang sudah digunakan. Pesan tetap dapat menggunakan event dan deskripsi asli Wazuh.
5. Publish/aktifkan workflow. Workflow kedua untuk perintah block/unblock manual tidak perlu diubah.
6. Validasi dan restart Manager:

```bash
sudo /var/ossec/bin/wazuh-integratord -t
sudo /var/ossec/bin/wazuh-analysisd -t
sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

7. Ulangi tes akun B, periksa Wazuh, Executions n8n, dan Telegram.

```bash
sudo grep -E '"id":"11050[01]"' /var/ossec/logs/alerts/alerts.json | tail -n 5
```

Tahap pertama menggunakan alert; kontrol aplikasi sudah menolak akses. Alert BOLA tidak otomatis menjadi IP Response karena belum ada tindakan block.

## 5. Opsional setelah uji: blokir sementara untuk akses ditolak berulang

Gunakan IP uji yang terpisah dari IP administrator. Tambahkan **110501 saja** ke `<rules_id>` pada blok Active Response sementara yang sudah dipakai brute force/credential stuffing. Pertahankan command, konfigurasi `timeout_allowed`, dan pemisahan SQL permanent yang sebelumnya digunakan.

Contoh tambahan pada daftar yang ada:

```xml
<rules_id>110401,110411,110420,110421,110501</rules_id>
<timeout>1800</timeout>
```

Untuk pengujian singkat, gunakan timeout 120 yang sebelumnya telah berhasil, kemudian kembali ke 1800 setelah siklus block/unblock terverifikasi. Jangan membuat blok Active Response duplikat untuk ID yang sama.

Script `/var/ossec/active-response/bin/saladinshop-ip-control.py` pada EC2 aplikasi mungkin mempunyai pemetaan rule ke `block_mode`/timeout. Jika berupa daftar ID, tambahkan `110501` ke daftar temporary; jika mode ditentukan oleh command/timeouts, pertahankan perilaku yang sudah terbukti. Periksa script sebelum mengubah, karena konfigurasi server tidak tersimpan lengkap di repository.

Validasi script dan konfigurasi sebelum restart:

```bash
# EC2 aplikasi, hanya jika script diubah
sudo python3 -m py_compile /var/ossec/active-response/bin/saladinshop-ip-control.py

# EC2 Wazuh Manager
sudo /var/ossec/bin/wazuh-analysisd -t
sudo /var/ossec/bin/wazuh-execd -t
sudo systemctl restart wazuh-manager
```

Hasil end-to-end yang diharapkan: akses ditolak → alert `110501` → Nginx deny → log `ip_response_action` → rule `120000` → callback n8n → IP Response temporary → timeout → unblock. Jangan menyimpulkan sukses hanya dari Telegram.

## Verifikasi lokal kode

```bash
npm run test:order-security
npx tsc --noEmit
npm run build
```

Tes memakai mock database/provider, sehingga tidak membuat transaksi pada RDS atau Midtrans. Pengujian end-to-end pada deployment tetap dilakukan dengan akun dan produk sandbox.

## Tahap berikutnya

Setelah tahap ini terdeploy dan uji normal berhasil, lanjutkan checkout/fake order, voucher concurrency, pemrosesan pembayaran idempotent, XSS, dan reset/enumeration. Perubahan tahap ini belum mengimplementasikan seluruh skenario tersebut dan tidak membuktikan aplikasi bebas celah.
