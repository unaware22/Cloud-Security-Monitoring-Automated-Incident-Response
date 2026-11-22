# Bahan Bab 3 — Cara Kerja Sistem, Komponen, dan Alasan Pemilihannya

Dokumen ini menjelaskan **bagaimana sistem bekerja**, bukan sekadar bagaimana memasangnya. Pertanyaan yang dijawab: siapa yang mencatat serangan, siapa yang memutuskan, siapa yang benar-benar memblokir, parameter apa yang dipakai, dan mengapa setiap teknologi dipilih.

Semua angka dan parameter diambil dari kode dan konfigurasi yang dipakai pada penelitian ini (branch `codex/homelab-staging` dan panduan 13 dan 15). Rujukan standar di bagian akhir ditulis dari pengetahuan umum, jadi **cek dulu ke dokumen aslinya** sebelum dikutip di skripsi.

Versi bahasa lisan untuk menjawab dosen ada di `23-LATIHAN-TANYA-JAWAB-BIMBINGAN-BAB-3.md`.

---

## 3.1 Siapa mendeteksi, memutuskan, dan memblokir

Pemblokiran penyerang tidak dilakukan satu komponen saja. Ada lima peran yang saling bergantian:

| Peran | Komponen | Yang dikerjakan |
|---|---|---|
| **Pencatat** | Aplikasi Next.js, Nginx, dan fitur pemantau file Wazuh (FIM) | Mengenali kejadian mencurigakan (misalnya pola SQL injection) lalu menuliskannya sebagai log berformat JSON (`security_events.log`, `access.json.log`) |
| **Pengumpul** | **Wazuh Agent** di EC2 aplikasi | Membaca log dan perubahan file, lalu mengirimnya ke Wazuh Manager lewat TCP 1514 |
| **Pengambil keputusan** | **Wazuh Manager** di EC2 Wazuh | Mencocokkan setiap event dengan aturan (*rule*). Jika rule tersebut terdaftar di Active Response, manager menyuruh agent menjalankan tindakan |
| **Pelaksana** | **Script Active Response** (`saladinshop-ip-control.py`), dijalankan oleh agent | Memeriksa alamat IP (apakah IP publik, apakah masuk daftar pengecualian), menulis baris `deny <IP>;` ke `/etc/nginx/conf.d/90-saladinshop-blocklist.conf`, memeriksa dan memuat ulang Nginx, lalu mencatat hasilnya |
| **Penegak** | **Nginx** | Menolak setiap request dari IP yang ada di daftar `deny` dengan kode **403**, sebelum request itu sampai ke aplikasi |

Jadi singkatnya: **Wazuh Manager yang memutuskan, Wazuh Agent (lewat script) yang melaksanakan, dan Nginx yang benar-benar menolak penyerang.** Wazuh sendiri tidak menahan lalu lintas web. Ia hanya memerintahkan perubahan pada konfigurasi Nginx.

Ada satu lapisan tambahan yang **tidak lewat Wazuh**, yaitu blokir perangkat dan akun. Aplikasi mencatat ban itu di database (RDS), dan *middleware* Next.js yang menolak request dari perangkat atau akun tersebut. Wazuh hanya menerima lognya untuk keperluan pemantauan.

### Urutan kejadian dari serangan sampai pemulihan (contoh S08, XSS)

| No | Kejadian | Komponen | Perkiraan waktu |
|---|---|---|---|
| 1 | Penyerang membuka `/products?q=<script>…` | Browser → Nginx → Next.js | 0 detik |
| 2 | Middleware men-decode URL, mengenali pola XSS, lalu menjawab **400** | Middleware Next.js | < 1 detik |
| 3 | Event `xss_attempt` ditulis ke `security_events.log` dan RDS | Next.js | < 1 detik |
| 4 | Aplikasi mencatat **ban perangkat** 30 menit (berdasarkan cookie `sv_did`) | Next.js + RDS | < 1 detik |
| 5 | Agent membaca baris log baru dan mengirimnya ke manager | Wazuh Agent | sekitar 1–5 detik |
| 6 | Manager mencocokkan **rule 100800** dan menghasilkan alert | Wazuh Manager | < 1 detik |
| 7 | Rule 100800 terdaftar di Active Response, sehingga manager mengirim perintah `block` ke agent dengan `timeout 1800` | Wazuh Manager | < 1 detik |
| 8 | Script memeriksa IP, menulis `deny`, menjalankan `nginx -t`, memuat ulang Nginx, dan mencatat hasil | Agent + script | sekitar 1–2 detik |
| 9 | Alert diteruskan ke n8n, lalu pesan masuk ke Telegram admin | Wazuh → n8n → Telegram | sekitar 1–5 detik |
| 10 | Request berikutnya dari IP itu ditolak **Nginx (403)**. Dari IP lain tetapi browser sama, ditolak **middleware (403)** karena ban perangkat | Nginx / Next.js | — |
| 11 | Setelah 1800 detik, manager mengirim perintah hapus dan script menghapus baris `deny`, sehingga akses pulih (`wazuh:auto-expire`) | Wazuh Manager + script | 30 menit |

Perkiraan waktu di atas diganti dengan hasil pengukuran nyata di Bab 4.

---

## 3.2 Fungsi Nginx

Nginx berperan sebagai **reverse proxy**, yaitu satu-satunya pintu masuk dari internet menuju aplikasi. Aplikasi Next.js hanya mendengarkan di `127.0.0.1:3000`, jadi tidak bisa diakses langsung dari luar server.

| No | Fungsi | Parameter yang dipakai | Kaitannya dengan penelitian |
|---|---|---|---|
| 1 | **Meneruskan request ke aplikasi** | `proxy_pass http://127.0.0.1:3000`, serta meneruskan `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` | Aplikasi tidak terbuka ke internet, dan IP asli pengunjung tetap sampai ke aplikasi untuk dicatat |
| 2 | **Menerima koneksi HTTPS** | Sertifikat TLS di Nginx (port 443) | Lalu lintas terenkripsi di perjalanan |
| 3 | **Menegakkan daftar blokir** | Baris `deny <IP>;` di `90-saladinshop-blocklist.conf`, ditulis oleh script Active Response | **Inilah yang benar-benar memblokir penyerang** (jawaban 403) |
| 4 | **Membatasi jumlah request** (pertahanan pertama) | `general_limit` 30 request/detik (burst 50); `checkout_limit` 10 request/menit (burst 5) pada `/api/orders`; `login_limit` 5 request/menit (burst 3) pada `/api/admin/login` | Banjir request ditolak sebelum menyentuh aplikasi. Pada uji banjir checkout, request ke-7 sudah ditolak Nginx |
| 5 | **Menolak akses ke jalur sensitif** | `location ~ /\.(env\|git\|aws\|svn\|DS_Store)` dan `wp-admin\|phpmyadmin\|pma\|backup.*` dijawab 404 | Mencegah bocornya file konfigurasi |
| 6 | **Menambah header keamanan** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` | Mengurangi risiko clickjacking dan salah tafsir tipe file |
| 7 | **Menjadi sumber log** | `access.json.log` berformat JSON (IP, request, status, user-agent) | Dibaca Wazuh Agent sebagai sumber deteksi tambahan |

---

## 3.3 Identitas yang dibawa penyerang

Setiap request dari browser membawa beberapa "identitas". Sebagian dipakai sistem untuk **memblokir**, sebagian hanya untuk **mencatat**.

| Identitas | Bentuknya | Dipakai untuk | Disimpan di mana |
|---|---|---|---|
| **Alamat IP publik** | contoh `114.10.76.91` | **Blokir IP** (Nginx, 30 menit) dan pengelompokan kejadian oleh rule Wazuh | Tidak disimpan di browser, ditentukan oleh jaringan, ISP, atau VPN |
| **Cookie perangkat `sv_did`** | UUID acak + tanda tangan HMAC | **Ban perangkat** 30 menit (60 menit jika mengulang dalam 24 jam) | Di penyimpanan cookie browser (per profil browser) |
| **Cookie sesi `customer_session_token`** | JWT bertanda tangan (HS256), berlaku 7 hari | Menunjukkan **akun** yang sedang login. Ban akun mencabut sesi ini | Di penyimpanan cookie browser |
| **Akun pengguna** | ID dan email di database | **Ban akun**, berlaku di browser, perangkat, dan IP mana pun | Database RDS (tabel `security_penalties`) |
| **User-Agent** | contoh `Mozilla/5.0 (X11; Linux x86_64; rv:140.0) … Firefox/140.0` | **Hanya dicatat** sebagai bukti, tidak dipakai memblokir karena mudah dipalsukan | Dikirim browser di setiap request |
| **`device_ref`** | 12 karakter hasil hash dari ID perangkat | Mengaitkan kejadian di log Wazuh tanpa membuka isi cookie | Log aplikasi |

### Cookie perangkat `sv_did` lebih rinci

| Atribut | Nilai | Manfaat |
|---|---|---|
| Isi | UUID acak + tanda tangan **HMAC-SHA256** | Tidak bisa ditebak atau dipalsukan. Cookie yang diubah dianggap perangkat baru |
| Kunci tanda tangan | `DEVICE_COOKIE_SECRET` (cadangan: `CUSTOMER_JWT_SECRET`), minimal 32 karakter | Hanya server yang bisa membuat cookie yang sah |
| `HttpOnly` | ya | Tidak bisa dibaca JavaScript, jadi aman walau ada celah XSS |
| `SameSite` | `Lax` | Tidak ikut terkirim pada request lintas situs yang berbahaya |
| `Secure` | ya (HTTPS) | Hanya dikirim lewat koneksi terenkripsi |
| Masa berlaku | 30 hari | Perangkat tetap dikenali walaupun browser ditutup |

### Mengapa VPN di browser yang sama tetap terblokir

VPN hanya mengganti **alamat IP** (lapisan jaringan). Cookie disimpan di **dalam browser**, bukan di jaringan, sehingga tetap terkirim walaupun IP berubah. Dari cookie itu, server tahu bahwa ini perangkat yang sama.

| Yang dilakukan penyerang setelah terblokir | IP | Cookie `sv_did` | Akun | Hasil |
|---|---|---|---|---|
| Tetap di Chrome, tanpa VPN | sama | sama | sama | **403 dari Nginx** (blokir IP) |
| **Chrome yang sama + VPN** | **berubah** | **sama** | sama | **403 dari middleware** (ban perangkat) |
| Chrome + VPN + login ke akun yang sama | berubah | sama | sama | 403 (ban perangkat dan akun) |
| **Browser lain** (Firefox/Edge) + VPN, tidak login | berubah | **baru** | tidak ada | **Lolos**, dianggap pengunjung baru |
| Browser lain + VPN + login ke **akun yang sama** | berubah | baru | **sama** | **403** "Akun dibatasi" (ban akun) |
| **Incognito atau profil baru** + VPN | berubah | baru | tidak ada | Lolos, cookie-nya terpisah |
| **Hapus cookie** di Chrome + VPN | berubah | baru | hilang | Lolos |
| Browser lain **tanpa** VPN | **sama** | baru | — | **403 dari Nginx**, IP masih diblokir |

Yang **berbeda antar-browser** adalah isi penyimpanan cookie (`sv_did`, sesi), User-Agent, penyimpanan lokal, dan cache. Yang **sama** adalah IP (jika jaringannya sama) dan akun (jika login dengan akun yang sama).

**Batasan yang ditulis apa adanya di skripsi:** server tidak bisa melihat IP asli di balik VPN dan tidak memakai *browser fingerprinting*. Penyerang yang mengganti IP **dan** perangkat (browser lain, incognito, atau hapus cookie) **tanpa login** tidak bisa dikenali sebagai orang yang sama. Lapisan perangkat dan akun mempersempit celah ini, tetapi tidak menutupnya sepenuhnya. Jika ia menyerang lagi dari identitas baru, serangannya tetap terdeteksi dan diblokir lagi.

---

## 3.4 Durasi blokir: mengapa 30 menit dan tidak selamanya

### Landasan

| Rujukan | Isi yang relevan | Penerapan di sistem |
|---|---|---|
| **PCI DSS v4.0, Requirement 8.3.4** (standar keamanan industri pembayaran kartu) | Percobaan autentikasi gagal dibatasi dengan mengunci identitas setelah paling banyak 10 percobaan, dengan **durasi kunci minimal 30 menit** atau sampai identitas dikonfirmasi | Durasi dasar blokir otomatis **30 menit (1800 detik)**, dipakai sebagai acuan praktik industri pembayaran (bukan kewajiban kepatuhan). Standar ini aslinya untuk penguncian akun, lalu diterapkan pada sumber serangan |
| **NIST SP 800-63B-4**, bagian 3.2.2 *Rate Limiting (Throttling)* (pada edisi lama 800-63B-3: bagian 5.2.2) | Percobaan gagal berturut-turut pada satu akun dibatasi **paling banyak 100** (batas atas, boleh lebih rendah). Teknik tambahan yang disebut: tantangan anti-bot, waktu tunggu yang **bertambah** setelah tiap kegagalan (contoh 30 detik sampai 1 jam), dan penilaian risiko berbasis IP, waktu, atau metadata browser | Eskalasi: ban perangkat/akun **30 menit**, naik jadi **60 menit** jika mengulang dalam 24 jam, selaras dengan prinsip waktu tunggu yang bertambah |
| **OWASP Authentication Cheat Sheet** dan **Credential Stuffing Prevention Cheat Sheet** | Penguncian permanen bisa disalahgunakan untuk mengunci pengguna sah | Tidak ada blokir permanen otomatis |
| **Fail2ban** (bawaan `jail.conf`) | `bantime = 10m`, `findtime = 10m`, `maxretry = 5`, praktik umum pada perangkat lunak pemblokir IP | Jendela deteksi **10 menit** dan ambang **5 percobaan** pada detektor brute force dan credential stuffing |

### Mengapa tidak diblokir selamanya

1. **IP bukan identitas yang tetap.** Banyak operator seluler memakai satu IP publik untuk banyak pelanggan sekaligus (*Carrier-Grade NAT*), dan IP rumah bisa berganti. Blokir permanen berisiko mengunci pengguna sah yang kebetulan mendapat IP itu kemudian.
2. **IP server VPN dipakai bersama.** Memblokirnya selamanya berarti ikut memblokir banyak orang lain.
3. **Penyerang tetap bisa ganti IP.** Blokir permanen tidak jauh lebih efektif terhadap penyerang yang gigih, tetapi jauh lebih berisiko bagi pengguna sah.
4. **Keputusan jangka panjang sebaiknya oleh manusia.** Panduan penanganan insiden (NIST SP 800-61) menempatkan keputusan penahanan jangka panjang pada analisis petugas. Karena itu sistem menyediakan **blokir manual permanen** dari dashboard admin (mode `permanent`) setelah admin meninjau alert.

### Kebijakan durasi yang dipakai

| Respons | Durasi | Dasar |
|---|---|---|
| Blokir IP otomatis (Wazuh Active Response) | **1800 detik (30 menit)** | PCI DSS 8.3.4 |
| Ban perangkat/akun (aplikasi) | **30 menit**, **60 menit** jika mengulang dalam 24 jam | PCI DSS 8.3.4 + eskalasi menurut NIST 800-63B |
| Blokir manual oleh admin | Sementara atau **permanen** (keputusan admin) | NIST SP 800-61 |
| Pembatasan request di aplikasi | 1–15 menit sesuai endpoint | Pulih sendiri untuk pengguna biasa |

### Keputusan: 30 menit untuk semua blokir otomatis

Durasi blokir adalah **keputusan kebijakan** (menimbang untung rugi), bukan angka yang bisa dihitung pasti. Dua kepentingan yang saling bertentangan:

- **Terlalu singkat:** penyerang cukup menunggu sebentar lalu mengulang, sehingga blokir hampir tidak menghambat.
- **Terlalu lama atau permanen:** pengguna sah yang kebetulan memakai IP yang sama ikut terkunci.

| Durasi | Keuntungan | Kerugian | Penilaian |
|---|---|---|---|
| 5 menit | Risiko salah blokir paling kecil | Penyerang hampir tidak terhambat. Lebih pendek dari jendela deteksi 10 menit, jadi serangan bisa diulang sebelum hitungan sebelumnya habis | Terlalu singkat |
| 10 menit (bawaan Fail2ban) | Cukup untuk menghentikan serangan otomatis sederhana | Di bawah batas 30 menit pada standar pembayaran, efek jera rendah | Lebih rendah dari standar yang relevan |
| **30 menit** | **Sesuai batas minimal PCI DSS 8.3.4**, cukup lama membuat serangan otomatis tidak efisien, dan pulih sendiri sehingga salah blokir masih bisa diterima | Penyerang yang sabar bisa kembali setelah 30 menit (ditangani deteksi ulang dan eskalasi) | **Dipilih** |
| 60 menit | Efek jera lebih kuat bagi pelanggar berulang | Pengguna sah yang salah terblokir menunggu lebih lama | Dipakai **hanya** sebagai eskalasi ban perangkat/akun |
| 24 jam | Penyerang terhambat lebih lama | Risiko tinggi mengunci pengguna sah di IP bersama | Tidak dipakai otomatis |
| Permanen | IP itu tertutup selamanya | IP bukan identitas tetap, mudah disalahgunakan untuk mengunci pengguna sah, dan penyerang cukup ganti IP | **Hanya manual oleh admin** |

**Alasan memilih 30 menit, secara ringkas:**

1. **Ada praktik standar yang dijadikan acuan.** PCI DSS v4.0 Req. 8.3.4 menyebut penguncian minimal 30 menit setelah percobaan autentikasi gagal berulang (cek teks aslinya sebelum dikutip). Perlu dinyatakan jujur: (a) standar itu mengatur penguncian *akun pengguna sistem*, sedangkan sistem ini memakainya untuk sumber serangan (IP, perangkat, akun); (b) standar itu **bukan kewajiban kepatuhan** bagi penelitian ini, karena data kartu ditangani Midtrans. Jadi PCI DSS dipakai sebagai **acuan praktik industri** untuk memilih angka 30 menit, bukan sebagai syarat yang harus dipenuhi.
2. **Sejalan dengan jendela deteksi.** Deteksi menghitung kejadian dalam 10 menit. Blokir harus lebih lama dari itu, kalau tidak penyerang bisa kembali sebelum hitungannya selesai.
3. **Bisa pulih sendiri.** Blokir berakhir otomatis tanpa campur tangan admin (`wazuh:auto-expire`), sehingga salah blokir tidak menjadi kerugian permanen.
4. **Satu angka untuk semua skenario.** Lebih mudah dijelaskan dan diuji ulang. Perbedaan perlakuan antarskenario ditentukan oleh **jenis respons** (blokir, batasi, atau tolak), bukan oleh durasi.
5. **Keputusan yang lebih lama diambil manusia.** Blokir panjang atau permanen dilakukan admin dari dashboard setelah meninjau alert.

**Angka ini bisa dievaluasi di Bab 4:** catat apakah penyerang yang kembali setelah 30 menit terdeteksi dan diblokir lagi (uji ulang setelah `auto-expire`), dan apakah ada pengguna sah yang ikut terkena (lewat traffic normal). Jika hasilnya menunjukkan perlu diubah, ubah durasinya dan catat sebagai versi eksperimen baru.

### Menyamakan konfigurasi Wazuh (SQLi saat ini masih 10 menit)

Konfigurasi aktif sebelum migrasi memakai `timeout 600` untuk rule SQL injection (ID lama 110100, kini 100100; lihat Lampiran E di dokumen 15) dan `1800` untuk rule lain. Supaya sesuai keputusan di atas, lakukan di **EC2 Wazuh**:

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-timeout
sudo nano /var/ossec/etc/ossec.conf
```

Cari blok Active Response yang berisi `<rules_id>100100</rules_id>`, lalu ubah `<timeout>600</timeout>` menjadi `<timeout>1800</timeout>`. Setelah itu:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
sudo grep -F 'saladinshop-ip-control' /var/ossec/etc/shared/ar.conf
```

Jika tidak ada blok lain ber-timeout 600, `ar.conf` tidak lagi memuat `saladinshop-ip-control600`. Dashboard admin tetap aman karena n8n memanggil `!saladinshop-ip-control.py`, bukan nama command yang bergantung pada timeout.

---

## 3.5 Pemetaan pengujian ke 7 lapisan OSI

Aplikasi web modern sebenarnya lebih pas digambarkan dengan model TCP/IP, yang menggabungkan lapisan 5–7 OSI menjadi satu lapisan aplikasi. Pemetaan ke OSI di bawah dipakai untuk menunjukkan **cakupan dan batasan** pengujian.

| Lapisan OSI | Yang diuji atau diamankan | Tools | Parameter | Skenario / status |
|---|---|---|---|---|
| **7 Application** | Serangan pada logika dan input aplikasi (SQLi, XSS, brute force, credential stuffing, BOLA, fake order, voucher, webhook, enumeration) dan keutuhan file web | Next.js (validasi Zod, deteksi pola, cek kepemilikan data), Cloudflare Turnstile, pembatas request aplikasi, Wazuh rules, Wazuh FIM, n8n, Telegram | Rule 100100–101001; batas request (login 30 per 15 menit, checkout 10 per menit, voucher 20 per menit, lupa password 5 per 10 menit); pesanan menunggu bayar 3 per akun dan 5 per IP; FIM mode `realtime` | **S01–S10** |
| **6 Presentation** | Enkripsi, encoding data, dan tanda tangan data | TLS di Nginx, output encoding React, decode URL (`%3C` menjadi `<`) sebelum deteksi, HMAC-SHA256 untuk cookie perangkat, SHA-512 untuk tanda tangan webhook Midtrans | HTTPS 443; decode sampai 3 putaran; kunci HMAC minimal 32 karakter; SHA-512 + server key | S08 (encoding), S09 (tanda tangan), varian VPN (cookie bertanda tangan) |
| **5 Session** | Sesi login dan pencabutannya | JWT HS256 (`jose`), cookie `HttpOnly`/`SameSite=Lax`/`Secure`, `sessionVersion` | Sesi 7 hari; ban akun menaikkan `sessionVersion`; reset password mencabut semua sesi | S05 (sesi akun B), S10, ban akun |
| **4 Transport** | Port yang terbuka ke internet | AWS Security Group | 80/443 terbuka; 22 hanya dari IP pemilik; 5432 (RDS) hanya dari SG aplikasi; 1514/1515 (agent) hanya antar-EC2 | **Pemeriksaan konfigurasi** (bukan skenario serangan): RDS tidak bisa dijangkau dari internet |
| **3 Network** | Identitas IP dan isolasi jaringan | Nginx `deny` (lewat Wazuh AR), AWS VPC, Tailscale | Hanya IPv4 publik yang diblokir; IP privat/Tailscale dikecualikan; timeout 1800 detik | Respons S01, S03, S04, S05, S08; varian VPN |
| **2 Data Link** | — | Dikelola AWS | — | **Di luar cakupan** (tanggung jawab AWS, *shared responsibility model*) |
| **1 Physical** | — | Pusat data AWS | — | **Di luar cakupan** (tanggung jawab AWS) |

---

## 3.6 Alasan memilih teknologi

| Komponen | Alasan dipilih | Alternatif yang dipertimbangkan | Mengapa tidak dipilih |
|---|---|---|---|
| **AWS EC2** (aplikasi) | Akses penuh ke sistem operasi, jadi bisa memasang Wazuh Agent, Nginx, dan script yang mengubah konfigurasi server. Lingkungannya cloud publik dengan IP publik yang nyata | Vercel / AWS Amplify (PaaS) | Platform seperti ini tidak mengizinkan agent keamanan atau perubahan konfigurasi web server, sehingga Active Response tidak bisa diterapkan |
| **Amazon RDS** (PostgreSQL) | Database terkelola (backup dan patch otomatis), **tanpa akses publik**, hanya menerima koneksi dari Security Group aplikasi. Jika server aplikasi diretas, database tidak otomatis terbuka ke internet | PostgreSQL di EC2 yang sama | Aplikasi dan database dalam satu server memperbesar dampak jika server diretas, dan backup/patch harus diurus manual |
| **EC2 terpisah untuk Wazuh** | Wazuh Manager, Indexer, dan Dashboard butuh sumber daya besar. Memisahkannya menjaga **alert tetap utuh** walaupun server aplikasi dikuasai penyerang | Wazuh di server aplikasi | Berebut sumber daya dengan aplikasi, dan log bisa dihapus penyerang yang menguasai server |
| **Wazuh** | SIEM/XDR **open source** yang menyediakan analisis log, aturan buatan sendiri, korelasi, **FIM**, dan **Active Response** dalam satu platform, tanpa biaya lisensi | Splunk, IBM QRadar | Berbayar dan lisensinya mahal |
| | | AWS CloudWatch + GuardDuty | Berfokus pada infrastruktur AWS, tidak memahami logika aplikasi (BOLA, voucher, checkout) tanpa pengembangan besar, berbayar per data, dan tidak punya respons otomatis ke Nginx |
| **Nginx** | Reverse proxy yang ringan, mendukung `deny` per IP yang bisa diubah script, pembatasan request, TLS, dan log JSON | Apache | Fungsinya mirip, tetapi Nginx lebih ringan dan umum dipakai di depan aplikasi Node.js |
| **n8n** (di homelab) | Alat otomasi alur kerja **low-code** yang bisa **dipasang sendiri**, jadi data alert tidak keluar ke pihak ketiga. Logika notifikasi dan kontrol IP dipisah dari Wazuh sehingga mudah diubah | Zapier, Make | Layanan cloud berbayar, dan data alert melewati pihak ketiga |
| | | Script langsung di Wazuh | Sulit dirawat dan diubah, serta tidak ada riwayat eksekusi yang mudah dilihat |
| **Homelab + Tailscale** | Menghemat biaya AWS dan menunjukkan arsitektur **hibrid** (cloud + on-premise). Tailscale (berbasis WireGuard) membuat jaringan privat terenkripsi tanpa membuka port n8n ke internet | n8n di EC2 Wazuh | Menambah biaya dan beban EC2, dan webhook n8n harus diamankan sendiri jika terbuka |
| **Telegram** | **Bot API gratis**, notifikasi *push* real-time ke ponsel admin, integrasi HTTP sederhana, dan umum dipakai di Indonesia | Email | Lebih lambat, sering masuk spam, kurang cocok untuk respons cepat |
| | | Slack / Discord | Secara teknis setara, Telegram dipilih karena lebih umum dipakai admin toko kecil di Indonesia |
| **Cloudflare Turnstile** | CAPTCHA gratis yang menghambat bot tanpa teka-teki gambar | Google reCAPTCHA | Turnstile tidak memakai teka-teki dan lebih ramah privasi |
| **Midtrans (Sandbox)** | Payment gateway Indonesia. Mode Sandbox memungkinkan uji pembayaran tanpa uang nyata, dan mendukung verifikasi tanda tangan webhook | Xendit | Setara, Midtrans dipilih untuk uji integrasi pembayaran |

### Jawaban singkat jika ditanya dosen

- **"Kenapa tidak pakai satu server saja?"** Memisahkan aplikasi, database, dan SIEM membatasi dampak jika salah satunya diretas (*defense in depth*) dan menjaga alert tetap utuh.
- **"Kenapa Wazuh, bukan CloudWatch/GuardDuty?"** Wazuh gratis, bisa membaca log aplikasi dengan aturan sendiri, dan punya FIM serta Active Response yang bisa memerintahkan Nginx memblokir IP.
- **"Kenapa n8n, tidak langsung dari Wazuh ke Telegram?"** n8n memisahkan pengaturan alur: membentuk pesan, memilih jalur per rule, dan menangani perintah block/unblock dari dashboard ke Wazuh API, tanpa mengubah konfigurasi Wazuh setiap alur berubah.
- **"Kenapa n8n di homelab?"** Hemat biaya, data tetap di bawah kendali sendiri, dan terhubung privat lewat Tailscale tanpa membuka port ke publik.
- **"Kenapa Telegram?"** Gratis, real-time, dan langsung masuk ke ponsel admin.

---

## 3.7 Cara kerja tiap skenario

Setiap skenario dijelaskan dalam empat tahap: **pencegahan** (oleh aplikasi atau Nginx), **deteksi** (event dan rule Wazuh), **notifikasi** (n8n lalu Telegram), dan **respons** (siapa yang bertindak dan dengan parameter apa).

> **Catatan:** penjelasan *mengapa serangan itu bisa terjadi* (akar masalah) dan langkah uji lengkap tiap skenario ada di `15-PANDUAN-UJI-10-SKENARIO.md`. Skenario S02 pada tabel di bawah masih versi proposal (FIM); usulan penggantinya, pemindaian jalur sensitif, ada di dokumen 15 dan menunggu persetujuan dosen.

| ID | Pencegahan (tools dan parameter) | Deteksi (event → rule) | Respons (pelaksana dan parameter) | Lapisan OSI |
|---|---|---|---|---|
| **S01 SQL injection** | Next.js mendeteksi pola SQL di query dan form (URL di-decode dulu) lalu menjawab 400. Query database memakai Prisma yang terparameter | `sql_injection_attempt` → **100100** | **Nginx deny** lewat Wazuh AR (timeout 1800 detik) + **ban perangkat** 30 menit (middleware) | 7, 3 |
| **S02 Defacement** | — (simulasi perubahan file di server) | Wazuh **FIM realtime** pada folder web → **100210** (diubah) / **100211** (ditambah), mencatat hash MD5/SHA1/SHA256 dan isi perubahan | Notifikasi. Pemulihan dilakukan admin secara manual | 7 (host) |
| **S03 Brute force** | Pembatas login (customer 30 per 15 menit; admin 5 per 15 menit + Nginx 5 per menit burst 3), Turnstile | Detektor: 5 kegagalan ke 1 akun dalam 10 menit (sliding window) → `user_bruteforce_attempt` → **100300**; admin → **100301** | Nginx deny 1800 detik + ban **perangkat** saja (akun korban tidak diban) | 7, 5, 3 |
| **S04 Credential stuffing** | Turnstile. Login dengan password benar pun ditolak (429) bila IP yang sama baru saja mencoba 5 akun berbeda dalam 10 menit | 5 email berbeda dari 1 IP dalam 10 menit → `credential_stuffing_attempt` → **100400** | Nginx deny 1800 detik + ban perangkat | 7, 3 |
| **S05 BOLA** | Setiap query pesanan mensyaratkan **pemilik = akun yang login**, sehingga akun lain hanya mendapat 404 tanpa data | `unauthorized_object_access_attempt` → **100500**; berulang dari IP yang sama → **100501** (`frequency` dan `timeframe` sesuai rule aktif; panduan: 3 kali dalam 300 detik) | Nginx deny 1800 detik (100501) + ban **perangkat dan akun** setelah 3 kali dalam 10 menit | 7, 5, 3 |
| **S06 Fake order** | Maksimal 3 pesanan menunggu bayar per akun dan 5 per IP; kedaluwarsa 15 menit; Turnstile; Nginx `checkout_limit` 10 per menit burst 5 | `checkout_abuse` → **100600**; `bot_order_attempt` → **100601** | Pembatasan (429/400) + notifikasi, **tanpa blokir** | 7 |
| **S07 Voucher** | Server memeriksa login, masa berlaku, minimal belanja, **sekali pakai per akun**, dan mengunci transaksi. Diskon dihitung server | `voucher_abuse_attempt` (`reason=reuse`) → **100700** dan **100701** | Penolakan (400) + notifikasi, tanpa blokir | 7 |
| **S08 XSS** | Deteksi pola XSS (URL di-decode) lalu 400, ditambah **output encoding React** | `xss_attempt` → **100800** | Nginx deny 1800 detik + ban perangkat 30 menit | 7, 6, 3 |
| **S09 Webhook** | Tanda tangan **SHA-512** (order_id + status_code + gross_amount + server key) dibandingkan secara aman terhadap serangan waktu, nominal dicocokkan, status pesanan diklaim sekali | `invalid_payment_callback` → **100900** (tanda tangan) / **100901** (nominal) | Penolakan (403/400) + alert prioritas tinggi, **tanpa blokir otomatis** (supaya IP Midtrans tidak ikut terblokir jika terjadi salah konfigurasi) | 7, 6 |
| **S10 Enumeration** | Pesan respons sama untuk semua email, waktu respons minimum sekitar 0,9–1,1 detik, pembatas 5 per 10 menit, Turnstile | `user_password_reset_abuse` → **101000**; banjir → **101001** | Pembatasan (429) + notifikasi, tanpa blokir | 7 |

**Respons bertingkat.** Serangan teknis yang jelas bermaksud jahat (S01, S03, S04, S05, S08) **diblokir**. Perilaku yang juga bisa dilakukan pelanggan biasa (S06, S07, S10) **dibatasi dan dilaporkan**. Webhook pembayaran (S09) **ditolak dan dilaporkan** tanpa blokir otomatis.

### Langkah pengujian yang sama untuk setiap skenario

1. Catat versi kode dan konfigurasi, lalu pastikan semua layanan aktif (aplikasi, Nginx, agent, manager, n8n).
2. Pastikan IP dan perangkat penguji tidak sedang diblokir.
3. Kirim serangan, lalu catat waktu, IP, `request_id`, dan respons HTTP.
4. Periksa event di `security_events.log` (aplikasi).
5. Periksa alert di Wazuh (`alerts.json` atau dashboard) dan rule yang terpicu.
6. Periksa notifikasi Telegram dan eksekusi n8n.
7. Untuk skenario yang memblokir: periksa baris `deny` di Nginx, log Active Response, akses penguji (harus 403), dan varian VPN.
8. Tunggu blokir berakhir sendiri sebelum percobaan berikutnya.
9. Ulangi 10 kali dan jalankan traffic normal sebagai kontrol false positive.

---

## Rujukan yang perlu dicek dan dikutip

- PCI Security Standards Council, *PCI DSS v4.0* (atau v4.0.1), Requirement 8.3.4. **Status verifikasi:** dokumen resmi (`docs-prv.pcisecuritystandards.org`) mengembalikan 403 tanpa registrasi, jadi teksnya baru terkonfirmasi lewat sumber sekunder (compliance.theartofservice.com/controls/pci-dss-4-0/8-3-4, diakses 22 November 2026): penguncian user ID setelah paling banyak 10 percobaan, dengan durasi minimal 30 menit atau sampai identitas dikonfirmasi. Unduh dokumen resmi dari *Document Library* pcisecuritystandards.org (gratis, perlu mengisi formulir), lalu kutip dari dokumen itu beserta nomor halamannya.
- NIST SP 800-63B-4, *Digital Identity Guidelines: Authentication and Authenticator Management*, bagian 3.2.2 *Rate Limiting (Throttling)*, https://pages.nist.gov/800-63-4/sp800-63b.html (dibaca langsung 22 November 2026; edisi ini terbit Agustus 2025). Edisi sebelumnya, SP 800-63B-3 bagian 5.2.2 (https://pages.nist.gov/800-63-3/sp800-63b.html), tercatat telah digantikan sejak 1 Agustus 2025. Keduanya memuat batas maksimal 100 percobaan gagal berturut-turut per akun.
- NIST SP 800-61, *Computer Security Incident Handling Guide* (tahap penahanan/*containment*).
- OWASP *Authentication Cheat Sheet* dan *Credential Stuffing Prevention Cheat Sheet*.
- OWASP *XSS Prevention Cheat Sheet*; OWASP API Security Top 10 2023 (API1 BOLA, API6).
- Dokumentasi Fail2ban (`jail.conf`: `bantime`, `findtime`, `maxretry`).
- Dokumentasi Wazuh: *Active Response*, *File Integrity Monitoring*, sintaks *Rules* (`frequency`, `timeframe`, `same_field`).
- AWS *Shared Responsibility Model*; dokumentasi Amazon RDS (akses publik dan Security Group).
- Dokumentasi Midtrans: verifikasi `signature_key` pada HTTP notification.
