# Latihan Tanya Jawab Bimbingan — Bab 3

Dokumen ini versi **lisan** dari `22-BAHAN-BAB-3-KONSEP-SISTEM.md`. Untuk tulisan skripsi tetap pakai bahasa formal di dokumen 22. Di sini isinya cara menjawab kalau dosen bertanya langsung.

Cara memakainya:
- Tiap pertanyaan punya **jawaban singkat** (±20–30 detik) yang dihafalkan intinya, bukan kata per kata.
- Kalau dosen menggali lebih dalam, ada **kalau dosen lanjut tanya**.
- Tidak tahu itu boleh. Bilang jujur, lalu arahkan ke apa yang sudah Anda uji. Dosen lebih menghargai jawaban jujur daripada klaim yang tidak bisa dibuktikan.

---

## Satu kalimat pembuka (kalau diminta menjelaskan sistem secara umum)

> "Sistem ini memantau website e-commerce saya. Kalau ada serangan, aplikasi dan server mencatatnya, Wazuh membaca catatan itu dan memutuskan serangan atau bukan, lalu Nginx menolak penyerangnya, dan admin langsung dapat notifikasi di Telegram."

---

## 1. "Yang memblokir itu siapa sebenarnya? Wazuh atau Nginx?"

**Jawaban singkat:**
> "Dua-duanya, tapi tugasnya beda. Wazuh yang memutuskan, Nginx yang menolak. Wazuh Manager mencocokkan log dengan rule, kalau cocok dia menyuruh agent di server aplikasi menjalankan script. Script itu menulis alamat IP penyerang ke daftar blokir Nginx. Setelah itu Nginx yang menolak semua request dari IP tersebut dengan kode 403. Jadi Wazuh sendiri tidak menahan lalu lintas web, dia hanya memerintahkan Nginx."

**Kalau dosen lanjut tanya "scriptnya ngapain saja?":**
> "Ada empat langkah. Pertama, memeriksa apakah IP itu IP publik dan tidak masuk allowlist, supaya IP admin dan jaringan internal tidak ikut terblokir. Kedua, menulis baris `deny` ke file blocklist Nginx. Ketiga, mengecek konfigurasi Nginx dengan `nginx -t` lalu me-reload-nya. Keempat, mencatat hasilnya ke log supaya bisa diperiksa. Kalau waktu blokirnya habis, manager mengirim perintah hapus dan script menghapus baris deny tadi."

**Kalau ditanya "kenapa tidak Nginx saja yang mendeteksi?":**
> "Nginx hanya melihat request, tidak paham konteks aplikasi. Dia tidak tahu kalau akun B sedang mencoba membuka pesanan akun A. Aplikasi yang tahu, lalu mencatatnya, dan Wazuh yang menilai polanya. Jadi tiap komponen mengerjakan bagian yang paling dia pahami."

---

## 2. "Fungsi Nginx di sistem kamu apa?"

**Jawaban singkat:**
> "Nginx itu pintu depan. Semua orang dari internet lewat Nginx dulu, baru sampai ke aplikasi. Aplikasi saya sengaja hanya mendengarkan di localhost, jadi tidak bisa diakses langsung dari luar. Di pintu itu Nginx mengerjakan beberapa hal: menerima HTTPS, meneruskan request ke aplikasi sambil membawa IP asli pengunjung, membatasi jumlah request per menit, menolak akses ke file sensitif seperti `.env`, dan yang paling penting untuk skripsi ini, menolak IP yang ada di daftar blokir."

**Parameter yang bisa disebut kalau ditanya:**
- Batas umum 30 request per detik per IP.
- Batas checkout 10 request per menit.
- Batas login admin 5 request per menit.
- Format log JSON supaya mudah dibaca Wazuh.

**Fakta menarik untuk memperkuat jawaban:**
> "Waktu saya uji banjir request ke checkout, request ke-7 sudah ditolak Nginx, sebelum sampai ke aplikasi. Jadi Nginx juga jadi lapisan pertahanan pertama."

---

## 3. "Peretas itu membawa identitas apa saja? Kenapa kalau dia pakai VPN di Chrome yang sama tetap tidak bisa masuk?"

**Jawaban singkat:**
> "Setiap request membawa beberapa identitas. Yang pertama alamat IP. Yang kedua cookie perangkat yang saya pasang di browser. Yang ketiga cookie sesi login, yang menghubungkan ke akun. Ada juga User-Agent, tapi itu hanya saya catat karena mudah dipalsukan. VPN hanya mengganti IP. Cookie tersimpan di dalam browser, bukan di jaringan, jadi walaupun IP-nya berubah, cookie yang sama tetap terkirim dan server tahu itu perangkat yang sama."

**Penjelasan cookie perangkat (kalau ditanya cara kerjanya):**
> "Saat pertama kali membuka website, server memberi browser sebuah ID acak yang ditandatangani dengan kunci rahasia. Kalau perangkat itu menyerang, ID-nya saya ban selama 30 menit. Karena ditandatangani, penyerang tidak bisa memalsukan atau menebak ID perangkat lain. Cookie ini juga HttpOnly, jadi tidak bisa dibaca oleh JavaScript."

**Kalau ditanya "bedanya antar browser apa?":**
> "Tiap browser menyimpan cookie sendiri-sendiri. Chrome, Firefox, dan mode incognito punya cookie jar yang terpisah. Jadi kalau penyerang pindah dari Chrome ke Firefox, cookie perangkatnya hilang dan dia dianggap pengunjung baru. User-Agent-nya juga berbeda. Yang tetap sama hanya IP, kalau jaringannya sama, dan akun, kalau dia login dengan akun yang sama."

**Pertanyaan jebakan: "Berarti kalau ganti browser dan IP, bisa lolos dong?"**
> "Betul, kalau dia tidak login, saya tidak bisa mengenalinya sebagai orang yang sama. Ini batasan yang saya tulis jujur di skripsi. Server tidak bisa melihat IP asli di balik VPN, dan saya tidak memakai browser fingerprinting. Tapi kalau dia menyerang lagi dari identitas baru, serangannya tetap terdeteksi dan diblokir lagi. Dan kalau dia menyerang lewat akun yang login, akunnya ikut dibatasi, jadi ganti browser tidak membantu. Sistem ini mempersempit celahnya, bukan menutupnya seratus persen."

**Tabel ringkas untuk dihafal (kondisi → hasil):**

| Yang dilakukan penyerang | Hasil |
|---|---|
| Chrome yang sama, pakai VPN | Tetap diblokir (cookie perangkat sama) |
| Browser lain, tanpa VPN | Tetap diblokir (IP sama) |
| Browser lain + VPN, tidak login | Lolos (identitas baru) |
| Browser lain + VPN, login akun yang sama | Diblokir (ban akun) |

---

## 4. "Kenapa blokirnya 30 menit? Kenapa tidak selamanya?"

**Jawaban singkat:**
> "Saya memilih 30 menit karena tiga alasan. Pertama, ada acuan standar: standar keamanan pembayaran PCI DSS menyebut penguncian minimal 30 menit setelah percobaan gagal berulang. Saya memakainya sebagai acuan praktik industri, bukan sebagai kewajiban, karena data kartu ditangani Midtrans. Kedua, jendela deteksi saya 10 menit, jadi blokir harus lebih lama dari itu, kalau tidak penyerang bisa kembali sebelum hitungannya habis. Ketiga, blokirnya berakhir sendiri, jadi kalau ada pengguna sah yang salah terblokir, dia tidak terkunci selamanya."

**Kalau ditanya "kenapa tidak permanen?":**
> "Karena IP bukan identitas yang tetap. Banyak pengguna seluler di Indonesia berbagi satu IP publik, dan IP VPN dipakai banyak orang. Kalau saya blokir permanen, orang yang tidak bersalah ikut terkunci. Penyerang juga tinggal ganti IP. Jadi blokir permanen tidak diputuskan otomatis. Itu keputusan admin lewat dashboard setelah meninjau alert."

**Kalau ditanya "kenapa tidak 10 menit atau 1 jam?":**
> "10 menit di bawah standar yang saya pakai dan efek jeranya rendah. Satu jam atau lebih meningkatkan risiko pengguna sah terkunci. Satu jam saya pakai hanya sebagai eskalasi untuk perangkat atau akun yang mengulang dalam 24 jam."

**Kalau ditanya "angka ini dari mana, apa sudah terbukti paling tepat?":**
> "Jujur, ini keputusan kebijakan, bukan hasil hitungan. Ada trade-off antara terlalu singkat, penyerang tidak terhambat, dan terlalu lama, pengguna sah terganggu. Saya pilih 30 menit karena ada acuannya. Di Bab 4 saya evaluasi: apakah penyerang yang kembali setelah 30 menit terdeteksi lagi, dan apakah ada pengguna sah yang terkena. Kalau hasilnya perlu diubah, saya ubah dan catat sebagai versi eksperimen baru."

---

## 4b. "PCI DSS itu apa, dan kenapa kamu pakai sebagai rujukan?"

**Jawaban singkat:**
> "PCI DSS adalah standar keamanan data kartu pembayaran yang disusun oleh PCI Security Standards Council, yang dibentuk oleh merek kartu besar seperti Visa dan Mastercard. Standar ini berlaku untuk pihak yang menyimpan, memproses, atau mengirim data kartu. Saya memakainya sebagai rujukan praktik industri untuk keamanan toko online, khususnya Requirement 8.3.4 yang menyebut penguncian setelah percobaan login gagal berulang minimal 30 menit. Saya tidak mengklaim toko saya wajib patuh PCI DSS, karena data kartu ditangani Midtrans."

**Kalau dosen bertanya "berarti 8.3.4 berlaku untuk akun pelanggan tokomu?":**
> "Tidak langsung. Dokumen PCI DSS versi 4.0.1 menyatakan Requirement 8 tidak berlaku untuk akun konsumen. Requirement itu untuk akun karyawan, administrator, dan pihak ketiga. Yang paling dekat dengan sistem saya adalah login admin. Untuk sumber serangan seperti IP dan perangkat, saya mengadaptasinya, jadi saya sebut sebagai acuan praktik, bukan kewajiban."

**Kalau ditanya "angka 30 menit itu dari mana persisnya?":**
> "Dari Requirement 8.3.4 di PCI DSS v4.0.1 halaman 189: setelah paling banyak 10 percobaan gagal, akun dikunci dengan durasi minimal 30 menit atau sampai identitas pengguna dikonfirmasi. Alasannya di dokumen itu: tanpa penguncian, penyerang bisa menebak password terus-menerus lewat alat otomatis, dan penguncian memaksanya berhenti sementara."

**Rujukan lain yang dipakai:**
- Requirement **11.5.2** (halaman 286): mekanisme deteksi perubahan seperti FIM, yang memberi peringatan atas perubahan tanpa izin pada file penting dan membandingkan file penting minimal sekali seminggu. Ini dasar uji FIM.

---

## 5. "Pengujianmu mencakup 7 layer OSI yang mana saja?"

**Jawaban singkat:**
> "Fokus utama saya di layer 7, aplikasi, karena semua sepuluh skenario ada di sana: SQL injection, XSS, brute force, BOLA, dan seterusnya. Tapi pertahanannya melibatkan layer lain. Layer 6 untuk enkripsi HTTPS, encoding output, dan tanda tangan digital webhook. Layer 5 untuk sesi login dan pencabutan sesi. Layer 4 diuji lewat konfigurasi port di AWS Security Group. Layer 3 untuk pemblokiran IP dan jaringan privat Tailscale. Layer 1 dan 2 di luar cakupan karena itu tanggung jawab AWS."

**Tabel yang bisa dibuka kalau diminta rinci:**

| Layer | Yang diuji | Tools | Parameter penting |
|---|---|---|---|
| 7 Application | 10 skenario serangan | Next.js, Wazuh rules, Turnstile, n8n, Wazuh FIM | Rule 110100–110541, rate limit per endpoint |
| 6 Presentation | HTTPS, encoding, tanda tangan | TLS Nginx, React, SHA-512 webhook, HMAC cookie | HTTPS 443, SHA-512 + server key |
| 5 Session | Login, pencabutan sesi | JWT, cookie HttpOnly | Sesi 7 hari, `sessionVersion` naik saat ban |
| 4 Transport | Port yang terbuka | AWS Security Group | RDS 5432 hanya dari SG aplikasi, agent 1514 hanya antar-EC2 |
| 3 Network | Blokir IP, jaringan privat | Nginx deny, VPC, Tailscale | Timeout 1800 detik, IP privat dikecualikan |
| 1–2 | — | Dikelola AWS | Di luar cakupan |

**Kalau ditanya "kenapa layer 4 tidak ada skenarionya?":**
> "Karena di layer itu yang menentukan konfigurasi, bukan serangan. Saya cukup membuktikan bahwa database tidak bisa dijangkau dari internet dan hanya menerima koneksi dari server aplikasi. Skenario serangan yang saya pilih berfokus pada ancaman khas e-commerce yang ada di layer aplikasi."

**Kalau ditanya "kenapa tidak semua 7 layer diuji?":**
> "Layer 1 dan 2 dikelola AWS lewat model tanggung jawab bersama. Saya tidak punya akses ke sana dan memang bukan tanggung jawab saya. Yang jadi tanggung jawab saya, dari layer 3 ke atas, sudah dipetakan."

---

## 6. "Kenapa harus pakai AWS EC2, RDS, n8n, dan Telegram?"

### AWS EC2
> "Karena saya butuh akses penuh ke sistem operasinya. Saya harus memasang Wazuh Agent, Nginx, dan script yang mengubah konfigurasi server. Platform seperti Vercel tidak mengizinkan itu. Di EC2 juga IP publiknya nyata, jadi pengujian mendekati kondisi sebenarnya."

### Amazon RDS
> "Supaya database terpisah dari server aplikasi. RDS tidak punya akses publik dan hanya menerima koneksi dari server aplikasi saya. Kalau server aplikasi diretas, database tidak otomatis terbuka ke internet. Selain itu RDS dikelola AWS, jadi backup dan patch-nya otomatis."

### EC2 terpisah untuk Wazuh
> "Supaya penyerang yang berhasil menguasai server aplikasi tidak bisa menghapus alert yang sudah tersimpan. Wazuh juga butuh sumber daya besar, jadi tidak saya gabung dengan aplikasi."

### Wazuh
> "Wazuh gratis dan open source, tapi fiturnya lengkap. Dia bisa membaca log, membuat rule sendiri, memantau perubahan file, dan menjalankan respons otomatis, semuanya dalam satu platform. Alternatif seperti Splunk berbayar mahal. CloudWatch dan GuardDuty fokus ke infrastruktur AWS, tidak paham logika aplikasi seperti voucher atau pesanan orang lain, dan tidak punya respons otomatis ke Nginx."

### n8n
> "n8n yang mengatur alur notifikasi dan tombol block/unblock di dashboard admin. Dengan n8n, saya bisa mengubah format pesan atau alurnya tanpa mengubah konfigurasi Wazuh. Dia juga bisa di-host sendiri, jadi data alert tidak lewat layanan pihak ketiga seperti Zapier."

### Homelab dan Tailscale
> "Menghemat biaya AWS. n8n saya jalankan di homelab dan dihubungkan lewat Tailscale, jaringan privat terenkripsi. Jadi n8n tidak perlu dibuka ke internet. Sekaligus ini menunjukkan arsitektur hibrid: cloud dan on-premise."

### Telegram
> "Gratis, real-time, langsung masuk ke ponsel admin, dan integrasi API-nya sederhana. Email lebih lambat dan sering masuk spam, padahal respons insiden butuh cepat."

**Kalau dosen tanya "kenapa tidak semuanya di satu server saja?":**
> "Karena prinsip defense in depth: kalau satu komponen jebol, dampaknya tidak merembet. Aplikasi, database, dan SIEM saya pisahkan supaya kompromi satu bagian tidak membuka semuanya."

---

## 7. "Untuk tiap skenario, tools apa yang dipakai, parameternya apa, langkahnya bagaimana?"

**Jawaban umum:**
> "Setiap skenario saya jalankan dengan pola yang sama. Satu, saya kirim serangan dan catat waktu serta responsnya. Dua, saya cek apakah aplikasi mencatat event-nya. Tiga, saya cek apakah Wazuh mengeluarkan alert dengan rule yang tepat. Empat, saya cek notifikasi Telegram. Lima, untuk skenario yang memblokir, saya cek baris deny di Nginx dan buktikan penyerang mendapat 403. Enam, saya tunggu blokirnya berakhir sendiri, lalu ulangi sepuluh kali, ditambah traffic normal untuk menghitung false positive."

**Contoh lengkap yang paling mudah dijelaskan: S08 XSS**
> "Saya buka URL dengan `<script>alert(1)</script>` di parameter pencarian. Middleware aplikasi men-decode URL-nya, mengenali pola script, dan menolak dengan 400. Aplikasi mencatat event `xss_attempt`. Wazuh mencocokkannya dengan rule 110110 dan menyuruh agent memblokir IP selama 30 menit. Nginx lalu menolak IP itu dengan 403, dan Telegram menerima notifikasinya. Kalau penyerang pindah VPN dengan browser yang sama, cookie perangkatnya tetap kena ban, jadi tetap ditolak."

**Ringkasan sepuluh skenario dalam satu kalimat tiap skenario:**

| ID | Kalimat penjelasnya |
|---|---|
| S01 SQLi | "Aplikasi menolak pola SQL dan query memakai Prisma yang parameterized, Wazuh rule 110100 memblokir IP." |
| S02 Defacement | "Wazuh FIM realtime memantau folder web, mencatat hash dan isi perubahan dalam kurang dari satu detik, rule 110200." |
| S03 Brute force | "Lima password salah ke satu akun dalam 10 menit memicu rule 110401, IP dan perangkat diblokir, akun korban tidak ikut diban." |
| S04 Credential stuffing | "Lima email berbeda dari satu IP dalam 10 menit memicu rule 110420." |
| S05 BOLA | "Setiap query pesanan mensyaratkan pemilik sama dengan akun login, jadi akun B hanya dapat 404. Berulang memicu rule 110501 dan akun penyerang dibatasi." |
| S06 Fake order | "Maksimal 3 pesanan menunggu bayar per akun, pesanan ke-4 ditolak 429, Wazuh hanya memberi notifikasi karena ini bisa terjadi pada pelanggan biasa." |
| S07 Voucher | "Voucher sekali pakai dicek di server, pemakaian ulang ditolak dan dilaporkan lewat rule 110521." |
| S08 XSS | "Pola XSS ditolak dan diblokir, dan output encoding React membuat teks tidak pernah dijalankan sebagai kode." |
| S09 Webhook | "Notifikasi pembayaran harus punya tanda tangan SHA-512 yang benar dan nominal yang cocok dengan pesanan, kalau tidak ditolak dan dilaporkan lewat rule 110530/110531." |
| S10 Enumeration | "Pesan dan waktu respons lupa password dibuat sama untuk email terdaftar maupun tidak, supaya akun tidak bisa ditebak." |

---

## 8. Pertanyaan jebakan yang mungkin muncul

### "Kenapa S06, S07, S10 tidak diblokir, sedangkan S01, S08 diblokir?"
> "Karena niatnya berbeda. SQL injection dan XSS hampir pasti serangan. Sedangkan pesanan yang tidak dibayar, salah voucher, dan lupa password bisa dilakukan pelanggan biasa. Kalau saya blokir, pelanggan sah ikut terkunci. Jadi saya memakai respons bertingkat: serangan yang jelas diblokir, perilaku yang ambigu dibatasi dan dilaporkan ke admin."

### "Kenapa S09 tidak diblokir otomatis?"
> "Karena notifikasi yang sah datang dari server Midtrans. Kalau suatu saat salah konfigurasi, misalnya kunci berubah, blokir otomatis justru memblokir Midtrans dan semua pembayaran berhenti. Jadi untuk S09 sistem menolak dan memberi alert prioritas tinggi, dan keputusan blokirnya di tangan admin."

### "Apakah sistem ini menjamin website aman?"
> "Tidak, dan saya tidak mengklaim itu. Hasil pengujian berlaku untuk endpoint, konfigurasi, dan periode uji yang saya tentukan. Sistem ini membuktikan bahwa untuk sepuluh skenario itu, serangan terdeteksi, dilaporkan, dan direspons sesuai kebijakan. Batasannya saya tulis, misalnya penyerang yang mengganti IP dan perangkat sekaligus tanpa login tidak bisa dikenali."

### "Apa yang kamu temukan selama pengujian?"
> "Ada beberapa. Misalnya, serangan lewat URL tidak tercatat di awal karena catatan dari middleware tertolak redirect HTTPS. Payload yang di-encode browser juga sempat lolos deteksi. Detektor credential stuffing dulu memakai jendela waktu tetap sehingga bisa lolos kalau percobaannya melewati batas jendela, lalu saya ganti jadi sliding window. Voucher sekali pakai juga sempat bisa terpakai dua kali kalau dua checkout dikirim bersamaan. Semuanya saya perbaiki dan saya catat di bab pembahasan."

### "Apa bedanya sistemmu dengan WAF seperti Cloudflare?"
> "WAF fokus ke pola serangan di lapisan HTTP. Sistem saya memantau, mengorelasikan, dan merespons juga serangan logika bisnis seperti voucher, pesanan orang lain, dan checkout, plus perubahan file di server. Dan semua respons tercatat dan bisa dikendalikan dari dashboard admin."

### "Kenapa tidak pakai CloudWatch saja?"
> "CloudWatch bagus untuk metrik infrastruktur AWS. Tapi untuk membaca log aplikasi dengan rule khusus, memantau integritas file, dan menjalankan respons otomatis ke Nginx, Wazuh lebih sesuai dan gratis. Menambah CloudWatch hanya menambah biaya tanpa menambah kemampuan yang saya butuhkan."

---

## Tips menjawab

1. **Mulai dari jawaban, baru alasan.** "Yang memblokir Nginx, tetapi yang memerintahkan Wazuh, karena..."
2. **Pakai contoh nyata dari pengujianmu.** Misalnya "waktu saya uji, request ke-7 sudah ditolak Nginx". Itu membuktikan kamu benar-benar menjalankannya.
3. **Akui batasan lebih dulu sebelum dosen menemukannya.** Misalnya ganti browser dan IP tanpa login. Ini menunjukkan kamu paham sistemmu sendiri.
4. **Jangan mengarang angka.** Kalau ditanya statistik yang tidak kamu punya, jawab "saya tidak punya data pastinya, yang saya uji adalah..."
5. **Kalau tidak tahu:** "Itu belum saya uji, Pak/Bu. Dalam skripsi ini saya batasi pada ... dan saya masukkan sebagai saran penelitian lanjutan."
6. **Bawa dokumen cadangan:** tabel peran komponen (doc 22 bagian 3.1), tabel identitas dan VPN (bagian 3.3), dan tabel 10 skenario (doc 15, bagian 5).
