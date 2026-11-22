# Bahan Bab 3 — Konsep, Komponen, dan Mekanisme Sistem

Dokumen ini menjelaskan **cara kerja** sistem, bukan hanya cara memasangnya: komponen apa yang mendeteksi, siapa yang memutuskan, siapa yang memblokir, dengan parameter apa, dan mengapa teknologi itu dipilih. Semua parameter diambil dari kode dan konfigurasi yang dipakai (repo `codex/homelab-staging` dan panduan 13–21). Rujukan standar di bagian akhir **wajib dicek ulang ke dokumen aslinya** sebelum dikutip di skripsi.

---

## 3.1 Pembagian peran: siapa mendeteksi, memutuskan, dan memblokir

Pemblokiran tidak dilakukan oleh satu komponen. Ada empat peran yang berbeda:

| Peran | Komponen | Tugas |
|---|---|---|
| **Pencatat (sensor)** | Aplikasi Next.js + Nginx + Wazuh FIM | Mengenali kejadian (mis. pola SQLi) dan menulisnya sebagai log JSON (`security_events.log`, `access.json.log`) |
| **Pengumpul** | **Wazuh Agent** di EC2 aplikasi | Membaca log dan perubahan file, mengirimnya ke manager (TCP 1514) |
| **Pengambil keputusan** | **Wazuh Manager** di EC2 Wazuh | Mencocokkan event dengan *rules*; bila rule terdaftar di Active Response, memerintahkan agent menjalankan respons |
| **Pelaksana** | **Script Active Response** (`saladinshop-ip-control.py`) yang dijalankan **agent** | Memeriksa IP (publik? masuk allowlist?), menulis `deny <IP>;` ke `/etc/nginx/conf.d/90-saladinshop-blocklist.conf`, memvalidasi dan me-*reload* Nginx, mencatat hasil |
| **Penegak (enforcer)** | **Nginx** | Menolak setiap request dari IP yang tercantum di daftar deny dengan **403**, sebelum request mencapai aplikasi |

Jadi jawaban singkatnya: **Wazuh Manager memutuskan, Wazuh Agent (melalui script) mengeksekusi, dan Nginx yang benar-benar menolak penyerang.** Wazuh sendiri tidak memblokir lalu lintas web; ia memerintahkan perubahan konfigurasi pada Nginx.

Lapisan tambahan (blokir perangkat/akun) **tidak** melalui Wazuh: aplikasi sendiri mencatat ban di database (RDS) dan **middleware Next.js** menolak request dari perangkat/akun tersebut. Wazuh menerima log tindakan ini untuk pemantauan.

### Alur pemblokiran otomatis (contoh S08 XSS)

| No | Kejadian | Komponen | Waktu tipikal |
|---|---|---|---|
| 1 | Penyerang membuka `/products?q=<script>…` | Browser → Nginx → Next.js | 0 s |
| 2 | Middleware men-decode URL, mencocokkan pola XSS, menjawab **400** | Next.js middleware | < 1 s |
| 3 | Event `xss_attempt` ditulis ke `security_events.log` (+ RDS) | Next.js | < 1 s |
| 4 | Aplikasi mencatat **ban perangkat** 30 menit (cookie `sv_did`) | Next.js + RDS | < 1 s |
| 5 | Agent membaca baris log baru, kirim ke manager | Wazuh Agent | ± 1–5 s |
| 6 | Manager mencocokkan **rule 110110** (`event_type = xss_attempt`) → alert | Wazuh Manager | < 1 s |
| 7 | Rule 110110 ada di `<rules_id>` Active Response → perintah `block` ke agent dengan `timeout 1800` | Wazuh Manager | < 1 s |
| 8 | Script memeriksa IP, menulis `deny IP;`, `nginx -t`, reload, catat hasil | Agent + script | ± 1–2 s |
| 9 | Alert diteruskan ke n8n → Telegram admin | integrator Wazuh → n8n | ± 1–5 s |
| 10 | Request berikutnya dari IP itu → **403 dari Nginx**; dari IP lain tetapi browser sama → **403 dari middleware** (ban perangkat) | Nginx / Next.js | — |
| 11 | Setelah 1800 s, manager mengirim perintah `delete` → script menghapus deny → akses pulih (`wazuh:auto-expire`) | Wazuh Manager + script | 30 menit |

Waktu tipikal diisi dengan hasil pengukuran nyata di Bab 4.

---

## 3.2 Fungsi Nginx dalam sistem

Nginx adalah **reverse proxy**: satu-satunya pintu masuk dari internet ke aplikasi. Kontainer Next.js hanya mendengarkan `127.0.0.1:3000`, sehingga tidak bisa diakses langsung dari luar.

| No | Fungsi | Parameter yang dipakai | Kaitan dengan skripsi |
|---|---|---|---|
| 1 | **Reverse proxy** | `proxy_pass http://127.0.0.1:3000`, meneruskan `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` | Aplikasi tidak terekspos; IP asli penyerang diteruskan ke aplikasi untuk dicatat |
| 2 | **Terminasi HTTPS (TLS)** | Sertifikat TLS di Nginx (port 443) | Lalu lintas terenkripsi (lapisan presentasi) |
| 3 | **Penegak daftar blokir** | `deny <IP>;` di `90-saladinshop-blocklist.conf` (ditulis oleh script Active Response) | **Inilah yang benar-benar memblokir penyerang** (403) |
| 4 | **Rate limiting** (lapisan pertama) | `general_limit` 30 req/s burst 50; `checkout_limit` 10 req/menit burst 5 (`/api/orders`); `login_limit` 5 req/menit burst 3 (`/api/admin/login`) | Banjir request ditolak sebelum mencapai aplikasi (terbukti pada S06 flood: request ke-7 ditolak) |
| 5 | **Menolak path sensitif** | `location ~ /\.(env|git|aws|svn|DS_Store)` dan `wp-admin|phpmyadmin|pma|backup.*` → 404 | Mencegah kebocoran file konfigurasi |
| 6 | **Header keamanan** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` | Mengurangi clickjacking dan MIME sniffing |
| 7 | **Sumber log** | `access.json.log` (format JSON: IP, request, status, user-agent) | Dibaca Wazuh Agent sebagai sumber deteksi tambahan |

---

## 3.3 Identitas yang dibawa penyerang

Setiap request dari browser membawa beberapa "identitas". Sistem memakai sebagian untuk **memblokir** dan sebagian hanya untuk **mencatat**.

| Identitas | Wujud | Lapisan | Dipakai untuk | Disimpan di mana |
|---|---|---|---|---|
| **Alamat IP publik** | mis. `114.10.76.91` | Network (L3) | **Blokir IP** (Nginx deny, 30 menit) dan korelasi rule Wazuh (`same_field ip_address`) | Tidak disimpan di browser; ditentukan jaringan/ISP/VPN |
| **Cookie perangkat `sv_did`** | `UUID.HMAC` mis. `0e602530-….DniRtl…` | Session/Application | **Ban perangkat** 30 menit (60 menit bila mengulang dalam 24 jam) | **Cookie jar browser** (per profil browser) |
| **Cookie sesi `customer_session_token`** | JWT bertanda tangan (HS256), berlaku 7 hari | Session (L5) | Menentukan **akun** yang login; **ban akun** mencabut sesi | Cookie jar browser |
| **Akun pengguna** | user ID / email di database | Application (L7) | **Ban akun** (S05 BOLA, dll.) — berlaku di browser/perangkat/IP mana pun | Database RDS (`security_penalties`) |
| **User-Agent** | `Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/... Firefox/140.0` | Application | **Hanya dicatat** (bukti forensik), tidak dipakai memblokir karena mudah dipalsukan | Dikirim browser setiap request |
| **`device_ref`** | 12 karakter hash dari ID perangkat | — | Korelasi di log Wazuh tanpa membocorkan isi cookie | Log aplikasi |

### Rincian cookie perangkat `sv_did`

| Atribut | Nilai | Fungsi |
|---|---|---|
| Isi | UUID acak + tanda tangan **HMAC-SHA256** | Tidak bisa ditebak atau dipalsukan; cookie yang diubah dianggap perangkat baru |
| Kunci tanda tangan | `DEVICE_COOKIE_SECRET` (cadangan: `CUSTOMER_JWT_SECRET`), ≥ 32 karakter | Hanya server yang bisa membuat cookie sah |
| `HttpOnly` | ya | Tidak bisa dibaca JavaScript (aman dari pencurian lewat XSS) |
| `SameSite` | `Lax` | Tidak terkirim pada request lintas situs yang berbahaya |
| `Secure` | ya (HTTPS) | Hanya terkirim lewat koneksi terenkripsi |
| Masa berlaku | 30 hari | Perangkat tetap dikenali walau browser ditutup |

### Mengapa VPN di Chrome tetap terblokir, tetapi browser lain tidak

VPN hanya mengganti **alamat IP** (lapisan jaringan). Cookie disimpan di dalam **profil browser**, bukan di jaringan, sehingga tetap terkirim walaupun IP berubah.

| Tindakan penyerang setelah terblokir | IP | Cookie `sv_did` | Sesi/akun | Hasil |
|---|---|---|---|---|
| Tetap di Chrome, tanpa VPN | sama | sama | sama | **403 Nginx** (blokir IP) |
| **Chrome yang sama + VPN** | **berubah** | **sama** | sama | **403 middleware** (ban perangkat) ✓ |
| Chrome + VPN + **login akun yang sama** | berubah | sama | sama | 403 (ban perangkat dan akun) ✓ |
| **Browser lain** (Firefox/Edge) + VPN, tanpa login | berubah | **baru** | tidak ada | **Lolos** — dianggap pengunjung baru |
| Browser lain + VPN + **login akun yang sama** | berubah | baru | **akun sama** | **403 "Akun dibatasi"** (ban akun) ✓ |
| **Incognito / profil baru** + VPN | berubah | baru | tidak ada | Lolos (cookie jar terpisah) |
| **Hapus cookie** di Chrome + VPN | berubah | baru | hilang | Lolos |
| Browser lain **tanpa** VPN | **sama** | baru | — | **403 Nginx** (IP masih diblokir) |

Yang **berbeda antarbrowser**: cookie jar (`sv_did`, sesi), User-Agent, penyimpanan lokal, cache. Yang **sama**: IP (bila jaringan sama) dan akun (bila login dengan akun yang sama).

**Batasan yang ditulis jujur di skripsi:** server tidak dapat melihat IP asli di balik VPN dan tidak memakai *browser fingerprinting*. Penyerang yang mengganti IP **dan** perangkat (browser lain/incognito/hapus cookie) **tanpa login** tidak dapat dikenali sebagai orang yang sama. Lapisan perangkat dan akun mempersempit celah ini; mereka tidak menutupnya sepenuhnya. Bila penyerang menyerang lagi dari identitas baru, ia terdeteksi dan diblokir lagi.

---

## 3.4 Durasi blokir: mengapa 30 menit (bukan selamanya)

### Landasan

| Rujukan | Isi yang relevan | Penerapan di sistem |
|---|---|---|
| **PCI DSS v4.0, Requirement 8.3.4** (standar keamanan industri kartu pembayaran) | Percobaan autentikasi gagal dibatasi dengan mengunci ID setelah ≤ 10 percobaan, dengan **durasi penguncian minimal 30 menit** atau sampai identitas dikonfirmasi | Durasi dasar blokir otomatis **30 menit (1800 detik)**. Relevan karena sistem adalah e-commerce yang memproses pembayaran. Diadaptasi dari penguncian akun ke pemblokiran sumber serangan |
| **NIST SP 800-63B, bagian Rate Limiting** | Membatasi percobaan gagal berturut-turut; menyarankan mekanisme seperti waktu tunggu yang **meningkat** daripada penguncian permanen | Eskalasi: ban perangkat/akun **30 menit**, **60 menit** bila mengulang dalam 24 jam |
| **OWASP Authentication / Credential Stuffing Cheat Sheet** | Penguncian permanen dapat disalahgunakan untuk *denial of service* terhadap pengguna sah | Tidak ada blokir permanen otomatis |
| **Fail2ban (konfigurasi bawaan `jail.conf`)** | `bantime = 10m`, `findtime = 10m`, `maxretry = 5` — praktik umum perangkat lunak pemblokir IP | Jendela deteksi **10 menit** dan ambang **5 percobaan** pada detektor brute force/credential stuffing |

### Mengapa tidak diblokir selamanya

1. **IP bukan identitas tetap.** ISP seluler di Indonesia umumnya memakai *Carrier-Grade NAT*: satu IP publik dipakai bersama banyak pelanggan, dan IP rumah dapat berganti. Blokir permanen berisiko mengunci **pengguna sah** yang kemudian mendapat IP tersebut.
2. **IP VPN dipakai bersama.** Alamat server VPN digunakan banyak orang; memblokirnya permanen ikut memblokir pengguna lain.
3. **Penyerang tetap bisa berganti IP**, sehingga blokir permanen tidak lebih efektif terhadap penyerang yang gigih, tetapi jauh lebih berisiko terhadap pengguna sah.
4. **Keputusan permanen sebaiknya oleh manusia.** Panduan penanganan insiden (NIST SP 800-61) menempatkan keputusan penahanan jangka panjang pada analisis petugas. Karena itu sistem menyediakan **blokir manual permanen** dari dashboard admin (mode `permanent`) setelah admin meninjau alert.

### Kebijakan durasi yang dipakai

| Respons | Durasi | Dasar |
|---|---|---|
| Blokir IP otomatis (Wazuh AR) | **1800 detik (30 menit)** | PCI DSS 8.3.4 |
| Ban perangkat/akun (aplikasi) | **30 menit**, **60 menit** bila mengulang < 24 jam | PCI DSS 8.3.4 + eskalasi NIST 800-63B |
| Blokir manual oleh admin | Sementara atau **permanen** (keputusan admin) | NIST SP 800-61 |
| Rate limit aplikasi | 1–15 menit sesuai endpoint | Pemulihan otomatis untuk pengguna biasa |

### Keputusan: 30 menit untuk semua blokir otomatis, dan mengapa angka itu

Durasi blokir adalah **keputusan kebijakan (trade-off)**, bukan angka yang bisa dihitung secara eksak. Dua hal yang saling bertentangan:

- **Terlalu singkat** → penyerang cukup menunggu sebentar lalu mengulang, jadi blokir tidak menghambat.
- **Terlalu lama atau permanen** → pengguna sah yang kebetulan memakai IP yang sama ikut terkunci (CGNAT, VPN bersama).

| Durasi | Keuntungan | Kerugian | Penilaian |
|---|---|---|---|
| 5 menit | Risiko salah blokir paling kecil | Penyerang bisa mengulang hampir tanpa hambatan; lebih pendek dari jendela deteksi 10 menit, sehingga serangan yang sama bisa terdeteksi lagi sebelum blokir berakhir | Terlalu singkat |
| 10 menit (bawaan Fail2ban) | Cukup untuk menghentikan serangan otomatis sederhana | Di bawah batas 30 menit yang dipakai standar pembayaran; efek jera rendah | Lebih rendah dari standar yang relevan |
| **30 menit** | **Sesuai ambang minimal PCI DSS 8.3.4**; cukup lama untuk membuat serangan otomatis tidak efisien; risiko salah blokir masih bisa diterima karena pulih sendiri | Penyerang yang sabar tetap bisa kembali setelah 30 menit (ditangani deteksi ulang dan eskalasi) | **Dipilih** |
| 60 menit (eskalasi) | Efek jera lebih kuat bagi pelanggar berulang | Pengguna sah yang salah blokir menunggu lebih lama | Dipakai **hanya** untuk ban perangkat/akun bila mengulang dalam 24 jam |
| 24 jam | Menghambat penyerang lebih lama | Risiko tinggi mengunci pengguna sah di IP bersama | Tidak dipakai otomatis |
| Permanen | Menutup IP itu selamanya | IP bukan identitas tetap (CGNAT, IP dinamis, VPN bersama); mudah disalahgunakan agar pengguna sah terkunci (DoS); penyerang tinggal berganti IP | **Hanya manual oleh admin** |

**Alasan memilih 30 menit, ringkasnya:**
1. **Landasan standar:** PCI DSS v4.0 Req. 8.3.4 menetapkan penguncian setelah percobaan autentikasi gagal berulang dengan durasi **minimal 30 menit** (atau sampai identitas dikonfirmasi). Sistem ini adalah e-commerce yang memproses pembayaran, sehingga standar itu relevan. Catatan kejujuran: standar tersebut mengatur penguncian akun, sedangkan sistem ini menerapkannya pada sumber serangan (IP, perangkat, akun).
2. **Konsisten dengan jendela deteksi:** deteksi memakai jendela 10 menit. Blokir harus lebih lama dari jendela itu, kalau tidak penyerang kembali sebelum hitungannya habis.
3. **Dapat dipulihkan sendiri:** blokir otomatis berakhir tanpa campur tangan admin (`wazuh:auto-expire`), sehingga salah blokir tidak menjadi kerugian permanen.
4. **Seragam untuk semua skenario:** satu angka lebih mudah dijelaskan dan diuji ulang. Perbedaan perlakuan antarskenario ditentukan oleh **jenis respons** (blokir, batasi, atau tolak), bukan oleh durasi yang berbeda-beda.
5. **Keputusan jangka panjang oleh manusia:** blokir yang lebih lama atau permanen dilakukan admin dari dashboard setelah meninjau alert (selaras dengan NIST SP 800-61, penahanan jangka panjang butuh analisis petugas).

**Nilai ini dapat dievaluasi di Bab 4:** catat apakah penyerang yang kembali setelah 30 menit terdeteksi dan diblokir lagi (uji ulang setelah `auto-expire`), serta apakah ada pengguna sah yang terkena (traffic normal). Bila hasilnya menunjukkan perlu penyesuaian, ubah durasi dan catat sebagai versi eksperimen baru.

### Menyamakan konfigurasi Wazuh (SQLi saat ini masih 10 menit)

Konfigurasi aktif memakai `timeout 600` untuk rule 110100 (SQLi) dan `1800` untuk rule lain. Agar sesuai keputusan di atas, di **EC2 Wazuh**:

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-timeout
sudo nano /var/ossec/etc/ossec.conf
```

Cari blok Active Response yang `<rules_id>110100</rules_id>` dan ubah `<timeout>600</timeout>` menjadi `<timeout>1800</timeout>`. Lalu:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
sudo grep -F 'saladinshop-ip-control' /var/ossec/etc/shared/ar.conf
```

Setelah ini `ar.conf` tidak lagi memuat `saladinshop-ip-control600` bila tidak ada blok lain ber-timeout 600. Dashboard admin tetap aman karena n8n memanggil `!saladinshop-ip-control.py`, bukan nama command bertimeout.

---

## 3.5 Pemetaan pengujian ke model OSI 7 lapisan

Catatan: aplikasi web modern lebih tepat dipetakan ke model TCP/IP (lapisan 5–7 OSI digabung sebagai *Application*). Pemetaan ke OSI di bawah dipakai untuk menunjukkan cakupan dan batasan pengujian.

| Lapisan OSI | Yang diuji / diamankan | Tools | Parameter | Skenario / status |
|---|---|---|---|---|
| **7 Application** | Serangan pada logika dan input aplikasi: SQLi, XSS, brute force, credential stuffing, BOLA, fake order, voucher, webhook, enumeration; integritas file web | Next.js (validasi Zod, deteksi pola, cek kepemilikan objek), Cloudflare Turnstile, rate limiter aplikasi, Wazuh rules, Wazuh FIM, n8n, Telegram | Rule 110100–110541; rate limit (login 30/15 mnt, checkout 10/mnt, voucher 20/mnt, lupa password 5/10 mnt); pending 3/akun, 5/IP; FIM `realtime` | **S01–S10** |
| **6 Presentation** | Enkripsi transport, encoding data, tanda tangan data | TLS di Nginx (HTTPS), output encoding React, decode URL (`%3C` → `<`) sebelum deteksi, HMAC-SHA256 cookie perangkat, SHA-512 tanda tangan webhook Midtrans | HTTPS 443; decode hingga 3 putaran; HMAC ≥ 32 karakter kunci; SHA-512 + server key | S08 (encoding), S09 (tanda tangan), varian VPN (cookie bertanda tangan) |
| **5 Session** | Sesi login, pencabutan sesi, sesi perangkat | JWT HS256 (`jose`), cookie `HttpOnly`/`SameSite=Lax`/`Secure`, `sessionVersion` | Sesi 7 hari; ban akun menaikkan `sessionVersion`; reset password mencabut semua sesi | S05 (sesi akun B), S10 (pencabutan sesi), ban akun |
| **4 Transport** | Port yang terbuka ke internet | AWS Security Group | 80/443 publik; 22 hanya IP pemilik; 5432 (RDS) hanya dari SG aplikasi; 1514/1515 (agent) hanya antar-EC2 | **Verifikasi konfigurasi** (bukan skenario serangan): RDS tidak dapat dijangkau dari internet |
| **3 Network** | Identitas IP, isolasi jaringan | Nginx `deny` (via Wazuh AR), AWS VPC, Tailscale (jaringan privat ke homelab) | Hanya IPv4 publik yang diblokir; IP privat/Tailscale dikecualikan (allowlist); timeout 1800 s | Respons S01, S03, S04, S05, S08; varian VPN |
| **2 Data Link** | — | Dikelola AWS (jaringan virtual) | — | **Di luar cakupan** (tanggung jawab AWS, *shared responsibility model*) |
| **1 Physical** | — | Pusat data AWS | — | **Di luar cakupan** (tanggung jawab AWS) |

---

## 3.6 Alasan pemilihan teknologi

| Komponen | Alasan dipilih | Alternatif yang dipertimbangkan | Mengapa tidak |
|---|---|---|---|
| **AWS EC2** (aplikasi) | Akses penuh ke sistem operasi: dapat memasang Wazuh Agent, Nginx, dan script Active Response yang mengubah konfigurasi server. Lingkungan cloud publik nyata dengan IP publik | Vercel/AWS Amplify (PaaS) | PaaS tidak mengizinkan agent keamanan atau perubahan konfigurasi web server, sehingga Active Response tidak bisa diterapkan |
| **Amazon RDS** (PostgreSQL) | Database terkelola (backup, patch otomatis), **tanpa akses publik**, hanya menerima koneksi dari Security Group aplikasi. Data terpisah dari server aplikasi: kompromi server tidak otomatis berarti database terbuka lewat internet | PostgreSQL di EC2 yang sama | Database dan aplikasi dalam satu server memperbesar dampak bila server diretas; backup/patch dikelola manual |
| **EC2 terpisah untuk Wazuh** | Wazuh Manager + Indexer + Dashboard membutuhkan sumber daya besar; **isolasi SIEM** dari server yang dipantau sehingga penyerang yang menguasai server aplikasi tidak bisa menghapus alert yang sudah tersimpan | Wazuh di server aplikasi | Bersaing sumber daya dengan aplikasi; integritas log tidak terjaga |
| **Wazuh** | SIEM/XDR **open source**: analisis log, *custom rules*, korelasi, **FIM**, dan **Active Response** dalam satu platform; gratis | Splunk, IBM QRadar | Berbayar/lisensi mahal |
| | | AWS CloudWatch + GuardDuty | Fokus pada infrastruktur AWS, tidak memahami logika aplikasi (BOLA, voucher, checkout) tanpa banyak pengembangan; berbayar per data; tidak ada mekanisme Active Response bawaan ke Nginx |
| **Nginx** | Reverse proxy ringan, mendukung `deny` per IP yang dapat diubah script, rate limiting, TLS, dan log JSON | Apache | Fungsi serupa; Nginx lebih ringan dan umum dipakai sebagai reverse proxy aplikasi Node.js |
| **n8n** (di homelab) | Otomasi alur kerja **low-code** yang dapat **di-host sendiri** (data alert tidak keluar ke layanan pihak ketiga); memisahkan logika notifikasi dan kontrol IP dari Wazuh sehingga mudah diubah tanpa menulis ulang integrasi | Zapier, Make | Layanan cloud berbayar; data alert melewati pihak ketiga |
| | | Script integrasi langsung di Wazuh | Sulit dipelihara dan diubah; tidak ada riwayat eksekusi visual |
| **Homelab + Tailscale** | Menghemat biaya AWS dan menunjukkan arsitektur **hibrid** (cloud + on-premise). Tailscale (berbasis WireGuard) membuat jaringan privat terenkripsi tanpa membuka port n8n ke internet | n8n di EC2 Wazuh | Menambah biaya/beban EC2; webhook n8n harus diamankan sendiri bila terbuka |
| **Telegram** | **Bot API gratis**, notifikasi *push* real-time ke ponsel admin, integrasi HTTP sederhana, umum dipakai di Indonesia | Email | Lebih lambat, sering masuk spam, kurang cocok untuk respons cepat |
| | | Slack/Discord | Setara secara teknis; Telegram dipilih karena lebih umum dipakai admin toko kecil di Indonesia |
| **Cloudflare Turnstile** | CAPTCHA gratis yang menghambat bot tanpa teka-teki gambar | Google reCAPTCHA | Turnstile tidak memerlukan teka-teki dan lebih ramah privasi |
| **Midtrans (Sandbox)** | Payment gateway Indonesia; mode Sandbox memungkinkan uji pembayaran tanpa uang nyata; mendukung verifikasi tanda tangan webhook | Xendit | Setara; Midtrans dipilih untuk uji integrasi pembayaran |

### Jawaban singkat bila ditanya dosen

- **"Kenapa tidak pakai satu server saja?"** — Memisahkan aplikasi, database, dan SIEM membatasi dampak bila salah satu diretas (*defense in depth*) dan menjaga integritas alert.
- **"Kenapa Wazuh, bukan CloudWatch/GuardDuty?"** — Wazuh gratis, bisa membaca log aplikasi dengan *custom rules* untuk serangan logika bisnis, punya FIM dan Active Response bawaan yang dapat memerintahkan Nginx memblokir IP.
- **"Kenapa n8n, tidak langsung Wazuh ke Telegram?"** — n8n memisahkan orkestrasi: memformat pesan, memilih jalur per rule, dan menangani perintah block/unblock dari dashboard ke Wazuh API, tanpa mengubah konfigurasi Wazuh setiap kali alur berubah.
- **"Kenapa n8n di homelab?"** — Hemat biaya, data tetap di bawah kendali sendiri, dan terhubung privat lewat Tailscale tanpa port publik.
- **"Kenapa Telegram?"** — Gratis, real-time, langsung ke ponsel admin.

---

## 3.7 Mekanisme per skenario

Setiap skenario dijelaskan dalam empat tahap: **pencegahan** (oleh aplikasi/Nginx), **deteksi** (event + rule Wazuh), **notifikasi** (n8n → Telegram), dan **respons** (siapa yang menindak, dengan parameter apa).

| ID | Pencegahan (tool : parameter) | Deteksi (event → rule) | Respons (pelaksana : parameter) | OSI |
|---|---|---|---|---|
| **S01 SQLi** | Next.js: deteksi pola SQL di query/form (URL di-decode dulu) → 400; query DB memakai Prisma (parameterized) | `sql_injection_attempt` → **110100** | **Nginx deny** via Wazuh AR (timeout 1800 s, disarankan) + **ban perangkat** 30 mnt (middleware) | L7, L3 |
| **S02 Defacement** | — (simulasi perubahan file di server) | Wazuh **FIM realtime** pada folder web → **110200** (modified) / **110201** (added), mencatat hash MD5/SHA1/SHA256 dan diff | Notifikasi; pemulihan manual oleh admin | L7 (host) |
| **S03 Brute force** | Rate limit login (customer 30/15 mnt; admin 5/15 mnt + Nginx 5/mnt burst 3), Turnstile | Detektor: 5 gagal ke 1 akun dalam 10 mnt (sliding window) → `user_bruteforce_attempt` → **110401** / admin **110411** | Nginx deny 1800 s + ban **perangkat** saja (akun korban tidak diban) | L7, L5, L3 |
| **S04 Credential stuffing** | Turnstile; login dengan password benar pun ditolak (429) bila IP yang sama baru saja mencoba ≥ 5 akun berbeda dalam 10 mnt | 5 email berbeda dari 1 IP dalam 10 mnt → `credential_stuffing_attempt` → **110420** | Nginx deny 1800 s + ban perangkat | L7, L3 |
| **S05 BOLA** | Setiap query pesanan mensyaratkan **pemilik = akun login** → 404 tanpa data | `unauthorized_object_access_attempt` → **110500**; berulang dari IP sama → **110501** (`frequency`/`timeframe` sesuai rule aktif; panduan: 3× dalam 300 s) | Nginx deny 1800 s (110501) + ban **perangkat dan akun** setelah 3× dalam 10 mnt | L7, L5, L3 |
| **S06 Fake order** | Maks. 3 pending/akun, 5/IP; kedaluwarsa 15 mnt; Turnstile; Nginx `checkout_limit` 10/mnt burst 5 | `checkout_abuse` → **110510**; `bot_order_attempt` → **110512** | Pembatasan (429/400) + notifikasi; **tanpa blokir** | L7 |
| **S07 Voucher** | Validasi server: login, masa berlaku, min. subtotal, **sekali pakai per akun**, kunci transaksi; diskon dihitung server | `voucher_abuse_attempt` (`reason=reuse`) → **110520** + **110521** | Penolakan (400) + notifikasi; tanpa blokir | L7 |
| **S08 XSS** | Deteksi pola XSS (URL di-decode) → 400; **output encoding React** | `xss_attempt` → **110110** | Nginx deny 1800 s + ban perangkat 30 mnt | L7, L6, L3 |
| **S09 Webhook** | Tanda tangan **SHA-512** (order_id + status_code + gross_amount + server key), perbandingan timing-safe; cek nominal; klaim status atomik | `invalid_payment_callback` → **110530** (tanda tangan) / **110531** (nominal) | Penolakan (403/400) + alert prioritas tinggi; **tanpa blokir otomatis** (agar IP Midtrans tidak terblokir bila salah konfigurasi) | L7, L6 |
| **S10 Enumeration** | Pesan respons identik; waktu respons minimum ±0,9–1,1 s; rate limit 5/10 mnt; Turnstile | `user_password_reset_abuse` → **110540** / banjir **110541** | Pembatasan (429) + notifikasi; tanpa blokir | L7 |

**Kebijakan respons bertingkat:** serangan teknis yang jelas berniat jahat (S01, S03, S04, S05, S08) **diblokir**; perilaku yang juga dapat dilakukan pelanggan biasa (S06, S07, S10) **dibatasi dan dilaporkan**; webhook pembayaran (S09) **ditolak dan dilaporkan** tanpa blokir otomatis.

### Langkah umum yang sama untuk setiap skenario (prosedur uji)

1. Catat versi kode/konfigurasi dan pastikan layanan aktif (aplikasi, Nginx, agent, manager, n8n).
2. Pastikan IP dan perangkat penguji tidak sedang diblokir.
3. Kirim stimulus serangan; catat waktu, IP, `request_id`, dan respons HTTP.
4. Periksa event di `security_events.log` (aplikasi).
5. Periksa alert di Wazuh (`alerts.json` / dashboard) dan rule yang terpicu.
6. Periksa notifikasi Telegram (dan eksekusi n8n).
7. Untuk skenario yang memblokir: periksa `deny` di Nginx, log Active Response, akses penguji (403), dan varian VPN.
8. Tunggu pemulihan otomatis (auto-expire) sebelum percobaan berikutnya.
9. Ulangi 10× dan jalankan traffic normal sebagai kontrol false positive.

---

## Rujukan yang perlu dicek dan dikutip

- PCI Security Standards Council, *PCI DSS v4.0*, Requirement 8.3.4.
- NIST SP 800-63B, *Digital Identity Guidelines: Authentication and Lifecycle Management*, bagian rate limiting (throttling).
- NIST SP 800-61, *Computer Security Incident Handling Guide* (fase containment).
- OWASP *Authentication Cheat Sheet* dan *Credential Stuffing Prevention Cheat Sheet*.
- OWASP *XSS Prevention Cheat Sheet*; OWASP API Security Top 10 2023 (API1 BOLA, API6).
- Dokumentasi Fail2ban (`jail.conf`: `bantime`, `findtime`, `maxretry`).
- Dokumentasi Wazuh: *Active Response*, *File Integrity Monitoring*, *Rules syntax* (`frequency`, `timeframe`, `same_field`).
- AWS *Shared Responsibility Model*; dokumentasi Amazon RDS (akses publik dan Security Group).
- Dokumentasi Midtrans: verifikasi `signature_key` pada HTTP notification.
