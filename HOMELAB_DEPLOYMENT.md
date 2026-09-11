# Homelab / CasaOS Staging Deployment

Gunakan deployment ini sebagai **staging skripsi**, bukan toko publik. Jalankan Midtrans Sandbox dan gunakan data pelanggan fiktif.

## Batas aman lingkungan

- PostgreSQL tidak membuka port ke LAN atau internet.
- Aplikasi hanya membuka `127.0.0.1:3000`; akses eksternal harus melalui reverse proxy HTTPS atau tunnel yang Anda kelola.
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

Impor `docker-compose.homelab.yml` melalui fitur Compose/Custom Install CasaOS dari folder project ini. CasaOS akan membangun aplikasi, menyalakan PostgreSQL, menerapkan migrasi Prisma, lalu menjalankan aplikasi.

`NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` dimasukkan saat image dibangun karena variabel publik Next.js dibaca pada waktu build. Untuk mengganti key tersebut, rebuild aplikasi dari CasaOS setelah memperbarui `.env`.

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
