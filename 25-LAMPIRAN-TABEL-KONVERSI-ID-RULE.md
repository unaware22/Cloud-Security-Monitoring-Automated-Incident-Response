# Lampiran Skripsi — Daftar Rule Wazuh dan Tabel Konversi ID

Satu halaman untuk lampiran. Penomoran rule diubah agar berurutan per skenario sehingga mudah ditelusuri: **S01 = 1001xx, S02 = 1002xx, S03 = 1003xx, dan seterusnya sampai S10 = 1010xx**, sedangkan rule lintas skenario memakai **1011xx**. Semua nomor berada di rentang 100000–120000 yang diperuntukkan bagi rule buatan sendiri pada Wazuh.

## Tabel konversi

| Skenario | ID baru | ID lama | Event aplikasi / sumber | Fungsi rule | Respons |
|---|---|---|---|---|---|
| S01 SQL injection | **100100** | 110100 | `sql_injection_attempt` | Input berpola SQL | Blokir IP |
| S02 Pemindaian jalur | **100200** | 110130 | `sensitive_path_scan` | Satu percobaan jalur sensitif | Alert |
| S02 Pemindaian jalur | **100201** | 110131 | korelasi 100200 | 5 jalur dalam 60 detik dari IP yang sama | Blokir IP |
| S02 FIM (lampiran) | **100210** | 110200 | Wazuh syscheck | File yang dipantau diubah | Alert |
| S02 FIM (lampiran) | **100211** | 110201 | Wazuh syscheck | File baru pada folder yang dipantau | Alert |
| S03 Brute force | **100300** | 110401 | `user_bruteforce_attempt` | 5 gagal login ke satu akun customer | Blokir IP |
| S03 Brute force | **100301** | 110411 | `admin_bruteforce_attempt` | Brute force akun admin | Blokir IP |
| S04 Credential stuffing | **100400** | 110420 | `credential_stuffing_attempt` | 5 akun berbeda dari satu IP | Blokir IP |
| S04 Credential stuffing | **100401** | 110421 | `account_takeover_attempt` | Satu akun diserang dari banyak IP | Blokir IP |
| S05 BOLA | **100500** | 110500 | `unauthorized_object_access_attempt` | Akses pesanan milik akun lain ditolak | Alert |
| S05 BOLA | **100501** | 110501 | korelasi 100500 | Penolakan berulang dari IP yang sama | Blokir IP |
| S06 Fake order | **100600** | 110510 | `checkout_abuse` | Batas pesanan menunggu bayar tercapai | Alert |
| S06 Fake order | **100601** | 110512 | `bot_order_attempt` | Checkout tanpa verifikasi anti-bot | Alert |
| S07 Voucher | **100700** | 110520 | `voucher_abuse_attempt` | Voucher ditolak | Alert |
| S07 Voucher | **100701** | 110521 | `voucher_abuse_attempt` (`reason=reuse`) | Pemakaian ulang voucher sekali pakai | Alert |
| S07 Voucher | **100702** | 110524 | `checkout_tampering_attempt` | Field harga dari klien ditolak | Alert |
| S08 XSS | **100800** | 110110 | `xss_attempt` | Input berpola XSS | Blokir IP |
| S09 Webhook | **100900** | 110530 | `invalid_payment_callback` | Tanda tangan webhook salah | Alert prioritas tinggi |
| S09 Webhook | **100901** | 110531 | `invalid_payment_callback` (`gross_amount=`) | Nominal webhook tidak sesuai pesanan | Alert prioritas tinggi |
| S10 Enumeration | **101000** | 110540 | `user_password_reset_abuse` | Permintaan reset ditolak | Alert |
| S10 Enumeration | **101001** | 110541 | `user_password_reset_abuse` (rate limit) | Banjir permintaan reset password | Alert |
| Lintas skenario | **101100** | 110601 | `device_banned` | Perangkat diban sementara | Pemantauan |
| Lintas skenario | **101101** | 110602 | `account_banned` | Akun diban sementara | Pemantauan |
| Lintas skenario | **101102** | 110603 | `banned_device_request` | Perangkat terban kembali dari IP baru | Blokir IP |
| Lintas skenario | **101103** | 110604 | `banned_account_request` | Login ke akun yang diban | Pemantauan |

**Tidak berubah:** rule **120000** (`ip_response_action`), yaitu laporan hasil block/unblock yang disinkronkan ke dashboard admin.

**Keterangan respons:** *Blokir IP* berarti rule terdaftar pada Active Response dengan `timeout` 1800 detik (30 menit). *Alert* berarti hanya dicatat dan dikirim ke Telegram lewat n8n, tanpa pemblokiran otomatis. *Pemantauan* berarti mencatat tindakan blokir perangkat atau akun yang dilakukan oleh aplikasi.

## Catatan penulisan di skripsi

1. Pengujian yang dilakukan **sebelum migrasi** memakai ID lama (kolom "ID lama"). Pengujian versi final memakai ID baru. Cantumkan kalimat penjelasan ini pada lampiran agar bukti lama (screenshot, dokumen mingguan) tetap dapat ditelusuri.
2. Dalam bab pembahasan, rujuk rule dengan ID baru dan sebut ID lama di dalam kurung bila screenshot yang ditampilkan masih memakai ID lama, misalnya "rule 100800 (sebelumnya 110110)".
3. Urutan angka menunjukkan nomor skenario: dua digit pertama setelah awalan 10 adalah nomor skenario (`1008xx` → S08), dan dua digit terakhir adalah urutan rule di dalam skenario itu.

Cara migrasi pada server (cadangan, perintah pemetaan, validasi, dan pemulihan) ada pada Lampiran E di `15-PANDUAN-UJI-10-SKENARIO.md`.
