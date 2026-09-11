# Homelab / CasaOS Staging Deployment

Gunakan deployment ini sebagai **staging skripsi**, bukan toko publik. Jalankan Midtrans Sandbox dan gunakan data pelanggan fiktif.

## Batas aman lingkungan

- PostgreSQL tidak membuka port ke LAN atau internet.
- Aplikasi membuka port LAN `3000` hanya untuk pengujian lokal. Jangan meneruskannya ke internet; akses publik kelak harus melalui reverse proxy HTTPS atau tunnel yang Anda kelola.
- Wazuh Agent berjalan pada host CasaOS dan memantau `runtime-logs/security_events.log` serta log reverse proxy.
- Jangan menjalankan Wazuh Manager, Indexer, dan Dashboard penuh pada host CasaOS ber-RAM 3 GB. Gunakan Agent + n8n ringan, atau Manager Wazuh terpisah.

## Menyiapkan environment

Jangan mengubah nama atau menimpa `.env` menjadi `.env.example`. File `.env`
tetap menyimpan konfigurasi penyedia layanan, misalnya Midtrans dan SMTP.
Konfigurasi staging CasaOS dipisahkan dalam `.env.homelab` agar kredensial basis
data dan secret deployment tidak tercampur dengan konfigurasi pengembangan.

1. Salin `.env.homelab.example` menjadi `.env.homelab`, lalu isi nilainya.
2. Pastikan `.env` berisi `MIDTRANS_SERVER_KEY`,
   `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`, konfigurasi SMTP, dan nilai provider lain
   yang sudah digunakan aplikasi.
3. Pastikan `DATABASE_URL` pada `.env.homelab` memakai hostname Docker
   `postgres`, misalnya:

   ```env
   DATABASE_URL=postgresql://app_user:password-yang-sama@postgres:5432/ecommerce_security_thesis?schema=public
   ```

4. Untuk akses awal dari LAN, `APP_BASE_URL` boleh memakai
   `http://192.168.1.50:3000`. Namun callback Midtrans memerlukan URL HTTPS
   publik; alamat LAN seperti `192.168.x.x` tidak cukup.

## Menjalankan di CasaOS

1. Instal **Dockge** dari App Store CasaOS, lalu buka `http://192.168.1.50:5001`.
2. Buat stack baru bernama `ecommerce-security` dan tempel isi
   `docker-compose.homelab.yml` yang telah disesuaikan untuk CasaOS.
3. Masukkan secret aplikasi (Midtrans dan SMTP) hanya pada bagian
   `environment` stack di Dockge. Jangan masukkan `.env` atau secret ke GitHub.
4. Klik **Deploy**. Dockge menarik image aplikasi, menyalakan PostgreSQL,
   menerapkan migrasi Prisma, lalu menjalankan aplikasi di port `3000`.

CasaOS Custom Install tidak selalu dapat memvalidasi tag image dari GHCR.
Dockge dipakai karena dapat menjalankan Docker Compose dan menarik image GHCR
secara langsung.

`NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` dimasukkan saat image dibangun karena variabel publik Next.js dibaca pada waktu build. Untuk mengganti key tersebut, jalankan ulang workflow image dengan build argument baru; jangan menaruhnya dalam repository.

Setelah aplikasi hidup, jalankan seed **sekali** dari terminal container dengan `npm run seed`. Hapus `SEED_ADMIN_PASSWORD` dari `.env.homelab` setelah admin dibuat.

File `.env.homelab` sudah diabaikan Git dan tidak boleh di-commit. Sesudah
staging LAN siap, buat endpoint HTTPS yang dilindungi (reverse proxy atau
tunnel), perbarui `APP_BASE_URL`, dan baru daftarkan URL tersebut sebagai
webhook Midtrans Sandbox.

## Checklist sebelum menguji pembayaran

- Midtrans tetap memakai Sandbox (`MIDTRANS_IS_PRODUCTION=false`).
- URL callback Midtrans menunjuk ke `/api/payments/midtrans/webhook` pada URL HTTPS staging.
- Tidak ada port PostgreSQL yang dipublikasikan.
- Login admin hanya memakai akun yang tersimpan di PostgreSQL.
- `runtime-logs/security_events.log` terbaca Wazuh Agent.
- Uji: checkout, callback sah, callback signature salah, login admin gagal berulang, dan alert n8n.
