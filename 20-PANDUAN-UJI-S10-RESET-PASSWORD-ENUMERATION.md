# Panduan Uji S10 — Forgot/Reset Password dan Account Enumeration

Uji hanya dengan akun dan email uji milik sendiri. Kerangka: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## 0. Apa yang diuji dan kebijakan responsnya

Fitur lupa password sering disalahgunakan untuk: (1) **mengetahui email mana yang terdaftar** (account enumeration) sebagai bahan credential stuffing/phishing, (2) **membanjiri email korban** dengan permintaan reset, dan (3) **menebak atau memakai ulang token reset** untuk mengambil alih akun.

| Kontrol | Mencegah |
|---|---|
| Pesan respons **identik** untuk email terdaftar dan tidak terdaftar | Enumeration lewat isi pesan |
| **Waktu respons minimum** ±0,9–1,1 detik untuk kedua kasus | Enumeration lewat perbedaan waktu (email terdaftar butuh query tambahan) |
| Rate limit 5 permintaan / 10 menit per IP + Cloudflare Turnstile | Banjir email reset dan otomatisasi |
| Token acak, disimpan sebagai **hash**, berlaku **1 jam**, **sekali pakai** (dikonsumsi atomik), token lama dihapus saat token baru dibuat | Menebak, memakai ulang, atau memakai tautan lama |
| Setelah reset berhasil, `sessionVersion` dinaikkan | Sesi lama (mis. milik penyerang) langsung tidak berlaku |

**Event:**

| Event | `payload_snippet` | Arti |
|---|---|---|
| `user_password_reset_abuse` | `Exceeded rate limit for forgot_password` | Lebih dari 5 permintaan reset / 10 menit |
| `user_password_reset_abuse` | `reason=unknown_token` / `used_token` / `expired_token` | Token reset tidak sah dipakai |

**Kebijakan respons S10: dibatasi dan dipantau, tidak diblokir.** Pengguna biasa bisa lupa password berkali-kali atau membuka tautan lama. Rate limit, CAPTCHA, dan token sekali pakai sudah mencegah penyalahgunaan; Wazuh memberi tahu admin bila polanya berulang.

## 1. Konfigurasi sekali

### 1.1 EC2 App

Deploy kode terbaru (pull, build, recreate). Kode terbaru menambahkan waktu respons minimum, pencatatan token tidak sah, dan mengeluarkan `user_password_reset_abuse` dari pemicu ban.

### 1.2 EC2 Wazuh — rule reset (alert saja)

```bash
sudo grep -n -B2 -A6 'user_password_reset_abuse' /var/ossec/etc/rules/saladinshop_rules.xml
```

Jika belum ada, tambahkan (sesuaikan ID bila terpakai):

```xml
<group name="saladinshop,web_security,password_reset,">
  <rule id="110540" level="5">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^user_password_reset_abuse$</field>
    <description>SALADINSHOP: Password reset rejected from $(ip_address)</description>
    <group>authentication,password_reset,</group>
  </rule>

  <rule id="110541" level="8">
    <if_sid>110540</if_sid>
    <field name="payload_snippet" type="pcre2">Exceeded rate limit for forgot_password</field>
    <description>SALADINSHOP: Password reset flooding from $(ip_address)</description>
    <group>authentication,password_reset,reset_flood,</group>
  </rule>

  <rule id="110542" level="10" frequency="5" timeframe="600">
    <if_matched_sid>110540</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated invalid password reset attempts from $(ip_address)</description>
    <group>authentication,password_reset,token_guessing,</group>
  </rule>
</group>
```

Tambahkan `110540,110541,110542` ke `<rule_id>` blok `<integration>` (Telegram). **Jangan** ke Active Response.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
```

### 1.3 n8n — workflow pertama

Output Switch `110541 — Reset Flood` dan `110542 — Reset Token Guessing` → **Send a text message** (110540 opsional).

## 2. Persiapan

- **Akun R**: akun uji terverifikasi dengan email yang bisa Anda buka.
- **Email X**: alamat email uji yang **tidak terdaftar**, format valid (mis. `tidakada.s10@example.com`).
- Browser dengan DevTools (tab Network) untuk melihat respons dan waktu.

## 3. Varian A — Account enumeration (isi pesan dan waktu)

Di halaman **Lupa Password**, lakukan bergantian (CAPTCHA diselesaikan tiap kali, maksimal 5 permintaan per 10 menit — bagi menjadi dua sesi bila perlu):

| # | Email | Catat dari Network `POST /api/auth/forgot-password` |
|---|---|---|
| 1 | Akun R (terdaftar) | status, isi `message`, **Time** |
| 2 | Email X (tidak terdaftar) | status, isi `message`, **Time** |
| 3 | Akun R | … |
| 4 | Email X | … |

**Hasil yang diharapkan:**
- Status **200** dan `message` **sama persis** untuk keduanya: "Jika alamat email Anda terdaftar, kami telah mengirimkan tautan…".
- Waktu respons keduanya berada di rentang yang sama (sekitar 0,9–1,2 detik); tidak ada pola "terdaftar selalu lebih lama".
- Hanya akun R yang menerima email.

Hitung rata-rata waktu kedua kelompok di lembar uji. Untuk bab pembahasan, bandingkan dengan versi sebelum perbaikan bila datanya ada (dulu email terdaftar menjalankan beberapa query database sebelum menjawab).

> [Screenshot: dua respons Network dengan pesan identik, kolom Time, dan email reset hanya di kotak masuk akun R.]

## 4. Varian B — Banjir permintaan reset (rate limit)

Rate limit dihitung **sebelum** CAPTCHA, sehingga dapat diuji dengan curl dari Kali (tanpa token, CAPTCHA akan menolak, tetapi hitungan tetap bertambah):

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "R-$i: %{http_code}\n" -H 'Content-Type: application/json' \
    -d '{"email":"tidakada.s10@example.com"}' \
    https://saladinshop.duckdns.org/api/auth/forgot-password
done
```

**Hasil:** R-1..5 **403** (CAPTCHA tidak ada), R-6..7 **429** "Terlalu banyak permintaan reset kata sandi". Tidak ada email terkirim. Website tetap dapat diakses (200).

```bash
# APP
cd ~/ecommerce-security
grep -F 'user_password_reset_abuse' runtime-logs/security_events.log | tail -n 3 | cut -c1-230
# WAZUH
sudo grep -E '"id":"11054[0-2]"' /var/ossec/logs/alerts/alerts.json | tail -n 3 | cut -c1-230
```

Cari event `Exceeded rate limit for forgot_password`, alert **110541**, Telegram "Reset Flood".

> **Kuota bersama:** halaman lupa password dan reset password memakai kuota rate limit yang **sama** (5 permintaan / 10 menit per IP). Beri jeda 10 menit antar varian (A, B, C) atau gunakan IP berbeda, dan hitung jumlah submit di varian C agar tidak tertahan 429 di tengah langkah.

## 5. Varian C — Token reset: palsu, dipakai ulang, kedaluwarsa

1. **Token palsu:** buka `https://saladinshop.duckdns.org/reset-password?token=TOKENPALSU1234567890`, isi password baru yang memenuhi syarat, selesaikan CAPTCHA → **400** "Tautan reset kata sandi tidak valid…". Event `reason=unknown_token`.
2. **Token dipakai ulang:** minta reset untuk akun R, buka tautan dari email, ganti password → berhasil. Buka **tautan yang sama** lagi dan coba ganti password → **400**. Event `reason=used_token`.
3. **Token lama setelah token baru:** minta reset dua kali untuk akun R; pakai tautan dari email **pertama** → **400** (token lama dihapus saat token baru dibuat).
4. (Opsional, butuh 1 jam) **Token kedaluwarsa:** minta reset, tunggu > 60 menit, buka tautan → **410** "telah kedaluwarsa". Event `reason=expired_token`.

Ulangi token palsu ≥ 5 kali dalam 10 menit (dari IP yang belum terkena rate limit) → alert **110542** "Repeated invalid password reset attempts".

> [Screenshot: tiap penolakan + event reason-nya, alert 110542, Telegram.]

## 6. Varian D — Sesi lama dicabut setelah reset

1. Login akun R di **browser 1** (anggap sesi penyerang yang sudah masuk).
2. Di **browser 2**, lakukan lupa password → reset password akun R.
3. Kembali ke browser 1, muat ulang halaman akun/riwayat pesanan → **sesi berakhir** (diminta login lagi).
4. Login dengan password lama → gagal; dengan password baru → berhasil.

> [Screenshot: browser 1 sebelum dan sesudah reset.]

## 7. Catatan enumeration di halaman lain

| Halaman | Perilaku | Status |
|---|---|---|
| Login | "Email atau password salah." untuk email tidak terdaftar maupun password salah; ada dummy-hash agar waktu mirip | Aman |
| Lupa password | Pesan dan waktu disamakan (bagian 3) | Aman |
| **Register** | Email terdaftar → **409** "Email sudah terdaftar…" | **Masih membocorkan keberadaan akun** — dibatasi rate limit 5/15 menit + CAPTCHA. Penutupan penuh butuh perubahan alur (selalu "cek email Anda", lalu mengirim email "akun Anda sudah ada" ke pemilik) |

Uji cepat untuk dokumentasi: daftar dengan email akun R → 409. Catat sebagai **temuan dan batasan** di laporan.

## 8. Kontrol normal

- Pengguna lupa password, menerima email, reset sekali → berhasil, tanpa alert 110541/110542.
- Pengguna salah buka tautan lama sekali → 400 + satu alert 110540 (level rendah), tanpa blokir.

## 9. Batasan

- Waktu respons minimum mengurangi, tetapi tidak menghilangkan seluruh sinyal waktu (variasi jaringan, beban server); hasil dinilai secara statistik dari beberapa percobaan.
- Rate limit dihitung per IP dan disimpan di memori aplikasi (reset saat container di-restart); penyerang yang memutar IP dibatasi CAPTCHA.
- Halaman register masih memungkinkan enumeration (bagian 7).
- Pengiriman email dilakukan asinkron; kegagalan SMTP tidak terlihat oleh pengguna.
