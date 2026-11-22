# Panduan Uji S10 — Lupa Password dan Account Enumeration

Uji hanya dengan akun dan email uji milik sendiri.

## Ringkasan

| | |
|---|---|
| **Serangan** | Memakai fitur lupa password untuk mengetahui email mana yang terdaftar (bahan credential stuffing/phishing) dan membanjiri email korban |
| **Kontrol aplikasi** | Pesan respons **identik** untuk email terdaftar/tidak; **waktu respons minimum** ±0,9–1,1 detik untuk keduanya; rate limit 5/10 menit per IP + Turnstile; token reset di-hash, berlaku 1 jam, sekali pakai |
| **Respons** | **Dibatasi + notifikasi**, tanpa blokir |
| **Event / rule** | `user_password_reset_abuse` → **110540** (+ **110541** untuk banjir) |
| **Varian inti (10×)** | Enumeration: email terdaftar vs tidak terdaftar |
| **Bukti tambahan (1×)** | Banjir permintaan reset ditolak 429 |

## 1. Konfigurasi sekali

**EC2 App** — deploy kode terbaru (pull, build, recreate).

**EC2 Wazuh** — tambahkan (backup dulu):

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
</group>
```

Tambahkan `110541` ke `<rule_id>` `<integration>`. **Tidak** ke Active Response. Validasi lalu restart manager. n8n: output `110541 — Reset Flood`.

## 2. Varian inti — Account enumeration

Siapkan **akun R** (terdaftar, emailnya bisa Anda buka) dan **email X** yang tidak terdaftar (mis. `tidakada.s10@example.com`).

Di halaman **Lupa Password**, buka DevTools → Network. Kirim bergantian (CAPTCHA diselesaikan tiap kali):

| # | Email | Catat dari `POST /api/auth/forgot-password` |
|---|---|---|
| 1 | Akun R | status, `message`, kolom **Time** |
| 2 | Email X | status, `message`, **Time** |

**Kuota:** maksimal 5 permintaan per 10 menit per IP (dihitung bersama halaman reset password). Satu percobaan = 1 pasang (R + X); beri jeda 10 menit setiap 2 pasang, atau gunakan IP lain.

**Hasil yang diharapkan:**
- Keduanya **200** dengan `message` **sama persis**: "Jika alamat email Anda terdaftar, kami telah mengirimkan tautan…".
- Waktu respons keduanya di kisaran yang sama (±0,9–1,2 detik); tidak ada pola "email terdaftar selalu lebih lama".
- Hanya akun R yang menerima email.

Di lembar uji, catat waktu tiap permintaan lalu hitung rata-rata kelompok R dan kelompok X.

**Pelengkap (1×):** halaman **Login** dengan email X dan password acak → "Email atau password salah." — sama dengan pesan untuk password salah pada akun R.

## 3. Bukti tambahan (1×) — Banjir permintaan reset

Rate limit dihitung sebelum CAPTCHA, sehingga dapat diuji dari Kali (lakukan setelah jeda 10 menit dari varian inti):

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "R-$i: %{http_code}\n" -H 'Content-Type: application/json' \
    -d '{"email":"tidakada.s10@example.com"}' \
    https://saladinshop.duckdns.org/api/auth/forgot-password
done
```

**Hasil:** R-1..5 **403** (tanpa CAPTCHA), R-6..7 **429** "Terlalu banyak permintaan reset kata sandi". Event `Exceeded rate limit for forgot_password`, alert **110541**, Telegram. Website tetap dapat diakses.

## 4. Kontrol normal

Pengguna lupa password → menerima email → reset sekali → berhasil, tanpa alert 110541.

## 5. Bukti untuk laporan

Dua respons Network dengan pesan identik + kolom Time · tabel rata-rata waktu R vs X · email hanya diterima akun R · curl 403 → 429 · alert 110541 · Telegram.

## 6. Batasan

- Waktu respons minimum mengurangi, tetapi tidak menghilangkan seluruh sinyal waktu (variasi jaringan/beban); dinilai dari beberapa percobaan.
- Rate limit per IP dan disimpan di memori aplikasi (reset saat container di-restart).
- **Halaman register masih membocorkan keberadaan akun** (email terdaftar → 409 "Email sudah terdaftar"), dibatasi rate limit 5/15 menit + CAPTCHA. Penutupan penuh memerlukan perubahan alur pendaftaran; dicatat sebagai temuan.
- Token reset palsu, bekas pakai, dan kedaluwarsa ditolak dan dicatat (`reason=unknown_token/used_token/expired_token`), tetapi tidak diuji sebagai varian terpisah.
