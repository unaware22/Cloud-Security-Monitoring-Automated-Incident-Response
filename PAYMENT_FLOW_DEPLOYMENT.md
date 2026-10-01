# Alur pembayaran dan kedaluwarsa pesanan (AWS)

Perubahan ini menampilkan Snap Midtrans di halaman pesanan SALADINSHOP. QRIS/nomor virtual account tetap dibuat dan dikendalikan oleh Midtrans, bukan rekening toko. Status **lunas** dan data produk hanya muncul setelah verifikasi server ke Midtrans atau webhook Midtrans yang bertanda tangan valid.

Pesanan yang belum dibayar memiliki batas 15 menit. `order-expiry-worker` mengecek pesanan yang melewati batas setiap 30 detik, memastikan status gateway, membatalkan transaksi gateway yang masih pending, lalu menandai pesanan lokal `expired`/`cancelled`. Jika Midtrans tidak bisa dihubungi, worker **tidak** menganggap pesanan sudah batal; pengecekan akan dicoba lagi. Notifikasi lunas sah yang datang terlambat masih dapat mengoreksi status lokal.

## Deploy di EC2 aplikasi

Jalankan dari direktori `~/ecommerce-security` setelah perubahan ini di-push. Jangan tempel kunci Midtrans ke terminal/chat; gunakan `.env` yang sudah ada. Tidak ada variabel rahasia baru.

```bash
cd ~/ecommerce-security
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml up -d --build app order-expiry-worker
sudo docker compose -f docker-compose.aws.yml ps
sudo docker compose -f docker-compose.aws.yml logs --tail=50 app order-expiry-worker
```

`app` dan worker memakai image yang sama; worker **tidak membuka port publik**. Jangan jalankan lebih dari satu worker untuk deployment ini. Jika worker tidak jalan, pesanan hanya diperbarui ketika ada notifikasi/pemeriksaan status, jadi periksa `ps` dan log worker.

## Uji dengan Midtrans Sandbox

1. Buat satu pesanan QRIS/VA dan pastikan halaman detail menunjukkan **Menunggu Pembayaran**, instruksi Midtrans, dan hitung mundur.
2. Bayar pesanan uji Sandbox. Tunggu status **Pembayaran Berhasil** atau **Pesanan Selesai**; data produk digital muncul hanya sesudah lunas dan pengiriman diproses.
3. Buat pesanan Sandbox lain, jangan bayar. Sesudah batas 15 menit dan satu siklus worker (maksimal sekitar 30 detik bila Midtrans responsif), periksa halaman pesanan: status menjadi kedaluwarsa/batal. Di admin, pesanan hilang dari **Pesanan aktif** tetapi bisa ditemukan di **Riwayat gagal/batal**.
4. Periksa `logs --tail=50 order-expiry-worker` untuk baris `expired` atau alasan gateway belum bisa diverifikasi. Jangan membuat transaksi riil untuk pengujian.

Riwayat pesanan tak dibayar tidak dihapus seketika dari RDS. Menghapusnya akan menghilangkan bukti untuk audit, deteksi checkout fiktif, dan data pengujian skripsi. Kebijakan retensi dan penghapusan/anonymisasi data pribadi dapat ditentukan kemudian bersama dosen sebelum diterapkan.

Voucher sekali-pakai hanya dianggap terpakai bila pembayaran lunas atau pesanan masih menunggu dalam batas waktu. Pesanan batal/kedaluwarsa tetap tercatat, tetapi tidak mengunci voucher selamanya.
