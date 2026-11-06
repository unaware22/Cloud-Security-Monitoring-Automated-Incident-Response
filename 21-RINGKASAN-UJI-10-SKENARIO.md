# Ringkasan Uji 10 Skenario (Bahan Bab 4)

Satu halaman pegangan: varian inti yang diuji, rule Wazuh, dan respons per skenario. Rincian langkah ada di panduan masing-masing.

## 1. Varian inti per skenario

Setiap varian inti diuji **10 kali** dengan konfigurasi yang sama, ditambah **traffic normal** pada endpoint yang sama untuk mengukur false positive (proposal 3.2.7–3.2.8).

| ID | Skenario | Varian inti | Hasil yang diharapkan | Rule Wazuh | Respons | Panduan |
|---|---|---|---|---|---|---|
| S01 | SQL injection | Payload SQL di pencarian (`/api/products?search=` atau URL halaman) | 400, data aman | 110100 | **Blokir** IP + ban perangkat | 15 |
| S02 | Web defacement | Ubah file uji di folder FIM | Alert < 1 detik, hash & diff tercatat | 110200 / 110201 | Notifikasi | 15 |
| S03 | Brute force | 5 password salah ke 1 akun (customer & admin) | 401 → 429 | 110401 / 110411 | **Blokir** IP + ban perangkat | 15 |
| S04 | Credential stuffing | 5 email berbeda dari 1 IP | 429 | 110420 | **Blokir** IP + ban perangkat | 15 |
| S05 | BOLA | Akun B membuka pesanan akun A | 404 tanpa data | 110500 / 110501 | **Blokir** IP + ban perangkat & akun | 15 |
| S06 | Fake order | Pesanan pending ke-4 | 429 `ACTIVE_PENDING_LIMIT` | 110510 | Batasi + notifikasi | 16 |
| S07 | Voucher abuse | Pakai ulang voucher sekali-pakai | 400 "sudah pernah digunakan" | 110521 | Tolak + notifikasi | 17 |
| S08 | XSS | `<script>` di URL halaman | 400, tanpa pop-up | 110110 | **Blokir** IP + ban perangkat | 18 |
| S09 | Webhook palsu | (A) tanda tangan palsu, (B) nominal salah | 403 / 400, pesanan tetap pending | 110530 / 110531 | Tolak + alert prioritas tinggi | 19 |
| S10 | Enumeration | Lupa password: email terdaftar vs tidak | Pesan & waktu sama | 110540 / 110541 | Batasi + notifikasi | 20 |

**Varian penghindaran (lintas skenario):** pada skenario yang memblokir, ulangi dengan VPN di browser yang sama → tetap 403 (ban perangkat). Bandingkan versi V1 (blokir IP saja) dan V2 (+ ban perangkat/akun). Panduan 14.

**Dasar kebijakan respons bertingkat:** serangan teknis yang jelas berniat jahat (SQLi, XSS, brute force, credential stuffing, BOLA) diblokir. Perilaku yang juga dapat dilakukan pelanggan biasa (pesanan tak dibayar, salah voucher, lupa password) cukup dibatasi dan dilaporkan. Webhook pembayaran tidak diblokir otomatis agar IP Midtrans tidak ikut terblokir bila terjadi salah konfigurasi.

## 2. Data yang dicatat per percobaan

| Test ID | Versi | Waktu serangan | HTTP | Event aplikasi | Waktu alert Wazuh | Waktu Telegram | Waktu blokir | Akses setelahnya | Catatan |
|---|---|---|---|---|---|---|---|---|---|

Contoh Test ID: `S08-V2-03` = XSS, versi konfigurasi 2, percobaan ke-3.

Metrik yang dihitung dari tabel ini: detection rate (TP / jumlah serangan), false positive (alert dari traffic normal), waktu deteksi (serangan → alert), waktu notifikasi (alert → Telegram), dan waktu respons (alert → blokir).

**Aturan pengulangan untuk skenario yang memblokir:** jangan membuka blokir manual di antara percobaan. Tunggu `unblocked` oleh `wazuh:auto-expire` (SQLi 10 menit, lainnya 30 menit) atau gunakan IP lain, lalu buka ban perangkat di dashboard. Membuka blokir manual saat timer masih berjalan menyebabkan blokir berikutnya diabaikan (`duplicate_ignored`).

## 3. Temuan dan perbaikan selama pengujian (untuk pembahasan)

| No | Temuan | Skenario terdampak | Perbaikan |
|---|---|---|---|
| 1 | Penyerang mengganti IP dengan VPN dan kembali mengakses website setelah diblokir | Lintas skenario | Ban sementara berbasis cookie perangkat bertanda tangan dan akun |
| 2 | Event dari middleware (serangan lewat URL halaman, scan path sensitif) tidak pernah tercatat: relay memakai `http://` lalu redirect 301 mengubah POST menjadi GET | S01, S08 | Relay internal langsung ke `127.0.0.1:3000` |
| 3 | Payload yang di-encode browser (`%3Cscript%3E`, `%27%20OR`) tidak terdeteksi; `%` rusak menggagalkan decode | S01, S08 | Query di-decode (bertahap, toleran) sebelum dicocokkan |
| 4 | Credential stuffing tidak terdeteksi bila rangkaian melewati batas jendela tetap 10 menit | S04 | Sliding window |
| 5 | Unblock dari dashboard gagal (Wazuh error 1652) setelah timeout rule diubah, karena nama command bergantung pada timeout | Respons | n8n memanggil script langsung (`!saladinshop-ip-control.py`); dashboard menampilkan status gagal |
| 6 | Blokir baru diabaikan (`duplicate_ignored`) setelah unblock manual saat timer lama masih berjalan | Respons | Belum diperbaiki — prosedur uji menunggu auto-expire |
| 7 | Dua checkout paralel dapat memakai voucher sekali-pakai dua kali | S07 | Kunci transaksi per voucher+akun |
| 8 | Penolakan voucher dan manipulasi harga tidak meninggalkan jejak di Wazuh | S07 | Dicatat sebagai `voucher_abuse_attempt` / `checkout_tampering_attempt` |
| 9 | Tanda tangan webhook dapat dipalsukan bila server key kosong; perbandingan tidak timing-safe | S09 | Ditolak bila key kosong; perbandingan timing-safe |
| 10 | Lupa password menjawab lebih lambat untuk email terdaftar (enumeration lewat waktu) | S10 | Waktu respons minimum yang sama |
| 11 | Register membocorkan keberadaan email (409) | S10 | Belum diperbaiki — dicatat sebagai batasan |
