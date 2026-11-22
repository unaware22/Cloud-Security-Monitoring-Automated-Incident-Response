# Panduan Uji 10 Skenario (satu file)

Semua panduan skenario dan konfigurasinya digabung di sini. File lama dipindahkan ke folder `arsip-panduan-uji/` (isinya tidak dihapus).

Tiap skenario ditulis dengan urutan yang sama, supaya Anda bisa **menjelaskan, bukan hanya menjalankan**:

1. **Apa serangannya dan kenapa bisa terjadi**: akar masalahnya.
2. **Apa yang menutup akar masalah itu**: tools dan parameter.
3. **Deteksi dan respons**: event, rule Wazuh, dan siapa yang bertindak.
4. **Langkah uji**: perintah dan hasil yang diharapkan.
5. **Penjelasan singkat untuk dosen.**

Konsep besar yang dipakai semua skenario (siapa yang memblokir, identitas penyerang dan VPN, alasan 30 menit, 7 lapisan OSI, alasan memilih teknologi) ada di `22-BAHAN-BAB-3-KONSEP-SISTEM.md`. Versi lisannya ada di `23-LATIHAN-TANYA-JAWAB-BIMBINGAN-BAB-3.md`.

> **Catatan S02:** S02 di bawah adalah **pemindaian jalur sensitif**, usulan pengganti dari "web defacement/FIM" dan **menunggu persetujuan dosen**. Jika tidak disetujui, kembali ke versi FIM di **Lampiran A**.

---

## Bagian 1 — Konsep inti dalam satu halaman

### Tiga lapis pemblokiran

| Lapis | Yang dikenali | Yang menolak | Durasi |
|---|---|---|---|
| **IP** | Alamat IP penyerang | **Nginx** (`deny <IP>`), ditulis oleh script Active Response atas perintah Wazuh | 30 menit |
| **Perangkat** | Cookie `sv_did` (UUID + tanda tangan HMAC) di browser | **Middleware aplikasi** (cek ke database RDS) | 30 menit, 60 menit jika mengulang dalam 24 jam |
| **Akun** | Akun yang sedang login | **Aplikasi** (sesi dicabut, login ditolak) | 30 menit, 60 menit jika mengulang |

**Siapa yang memblokir:** Wazuh Manager memutuskan, Wazuh Agent (lewat script) melaksanakan, Nginx yang menolak. Blokir perangkat dan akun dilakukan aplikasi sendiri.

### Mengapa blokir 30 menit

- **Ada acuan standar:** PCI DSS v4.0 Req. 8.3.4 menetapkan penguncian minimal 30 menit setelah percobaan gagal berulang. Dipakai sebagai acuan praktik industri pembayaran, bukan kewajiban kepatuhan (data kartu ditangani Midtrans), dan aslinya untuk akun, di sini diterapkan pada sumber serangan.
- **Lebih lama dari jendela deteksi (10 menit)**, kalau tidak penyerang bisa kembali sebelum hitungannya habis.
- **Pulih sendiri**, jadi salah blokir tidak permanen. Blokir permanen hanya manual oleh admin karena IP bukan identitas tetap (CGNAT, VPN bersama).

### Mengapa VPN di Chrome yang sama tetap terblokir

VPN hanya mengganti **IP**. Cookie `sv_did` tersimpan di dalam **browser**, bukan di jaringan, jadi tetap terkirim. Server mengenali perangkat yang sama dan menolaknya (403 dari middleware). Kalau penyerang pindah ke browser lain atau incognito tanpa login, cookie-nya baru dan ia lolos. Itu batasan yang ditulis jujur. Jika ia login dengan akun yang sama, ban akun tetap berlaku.

---

## Bagian 2 — Persiapan sekali

### 2.1 EC2 App: deploy kode terbaru

```bash
cd ~/ecommerce-security
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app order-expiry-worker
sudo docker compose -f docker-compose.aws.yml logs --tail=60 app
```

Pastikan `.env` berisi `SECURITY_EVENT_RELAY_TOKEN` (≥ 32 karakter) dan `CUSTOMER_JWT_SECRET` (≥ 32 karakter). Tanpa relay token, event dari middleware tidak tercatat. Jangan isi `DEVICE_BAN_ALLOW_PRIVATE_IP` di AWS. Migrasi database berjalan otomatis saat container start.

```bash
for k in SECURITY_EVENT_RELAY_TOKEN CUSTOMER_JWT_SECRET MIDTRANS_SERVER_KEY; do
  v=$(grep -E "^$k=" .env | head -1 | cut -d= -f2- | tr -d '"'); echo "$k: ${#v} karakter"
done
```

### 2.2 EC2 App: cakupan FIM

Konfigurasi FIM yang memantau folder source (`src`, `public`, folder aplikasi) membuat setiap deploy sah memicu alert palsu. Ubah `syscheck` di `/var/ossec/etc/ossec.conf`:

- **Hapus** tiga baris yang memantau `/home/ubuntu/ecommerce-security` (level 0), `.../src`, dan `.../public`.
- **Tambahkan** satu baris untuk file konfigurasi penting:

```xml
<directories check_all="yes" realtime="yes">/home/ubuntu/ecommerce-security/.env,/home/ubuntu/ecommerce-security/docker-compose.aws.yml,/home/ubuntu/ecommerce-security/Dockerfile</directories>
```

Pertahankan `/etc/nginx`, `fim-test`, dan pemindaian terjadwal. Lalu:

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-fim
sudo systemctl restart wazuh-agent
sudo grep -E 'Monitoring path' /var/ossec/logs/ossec.log | tail -n 12
```

### 2.3 EC2 Wazuh: semua rule baru dalam satu blok

Rule untuk SQLi (110100), auth (110401, 110411, 110420, 110421), BOLA (110500, 110501), dan FIM (110200, 110201) sudah ada dari minggu-minggu sebelumnya. Yang baru ditambahkan:

```bash
sudo grep -R -n -E 'id="1101(10|30|31)"|id="1105(10|12|20|21|24|30|31|40|41)"|id="11060[1-4]"' /var/ossec/etc/rules
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml /var/ossec/etc/rules/saladinshop_rules.xml.backup-skenario
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

Jika perintah `grep` menampilkan ID yang sudah ada, jangan menimpa: sesuaikan nomornya. Tambahkan setelah grup terakhir yang sudah ditutup:

```xml
<group name="saladinshop,web_security,">

  <!-- S08 XSS -->
  <rule id="110110" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^xss_attempt$</field>
    <description>SALADINSHOP: XSS attempt blocked from $(ip_address)</description>
    <mitre><id>T1059.007</id></mitre>
    <group>attack,xss,</group>
  </rule>

  <!-- S02 pemindaian jalur sensitif -->
  <rule id="110130" level="5">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^sensitive_path_scan$</field>
    <description>SALADINSHOP: Sensitive path probe from $(ip_address)</description>
    <mitre><id>T1595.003</id></mitre>
    <group>recon,web_scan,</group>
  </rule>
  <rule id="110131" level="10" frequency="5" timeframe="60">
    <if_matched_sid>110130</if_matched_sid>
    <same_field>ip_address</same_field>
    <description>SALADINSHOP: Repeated sensitive path scanning from $(ip_address)</description>
    <mitre><id>T1595.003</id></mitre>
    <group>recon,web_scan,repeated_scan,</group>
  </rule>

  <!-- S06 checkout -->
  <rule id="110510" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^checkout_abuse$</field>
    <description>SALADINSHOP: Checkout limited (pending limit) from $(ip_address)</description>
    <group>business_logic,checkout_abuse,</group>
  </rule>
  <rule id="110512" level="6">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^bot_order_attempt$</field>
    <description>SALADINSHOP: Checkout without valid anti-bot verification from $(ip_address)</description>
    <group>bot,fake_order,</group>
  </rule>

  <!-- S07 voucher -->
  <rule id="110520" level="5">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^voucher_abuse_attempt$</field>
    <description>SALADINSHOP: Voucher rejected from $(ip_address)</description>
    <group>business_logic,voucher_abuse,</group>
  </rule>
  <rule id="110521" level="8">
    <if_sid>110520</if_sid>
    <field name="payload_snippet" type="pcre2">reason=reuse</field>
    <description>SALADINSHOP: Single-use voucher reuse attempt from $(ip_address)</description>
    <group>business_logic,voucher_abuse,voucher_reuse,</group>
  </rule>
  <rule id="110524" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^checkout_tampering_attempt$</field>
    <description>SALADINSHOP: Checkout price/discount tampering rejected from $(ip_address)</description>
    <group>business_logic,price_tampering,</group>
  </rule>

  <!-- S09 webhook pembayaran -->
  <rule id="110530" level="12">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^invalid_payment_callback$</field>
    <description>SALADINSHOP: Rejected payment webhook (invalid signature) from $(ip_address)</description>
    <mitre><id>T1565.002</id></mitre>
    <group>payment_fraud,webhook,</group>
  </rule>
  <rule id="110531" level="13">
    <if_sid>110530</if_sid>
    <field name="payload_snippet" type="pcre2">gross_amount=</field>
    <description>SALADINSHOP: Payment webhook amount mismatch from $(ip_address)</description>
    <group>payment_fraud,webhook,amount_mismatch,</group>
  </rule>

  <!-- S10 lupa password -->
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

  <!-- Blokir perangkat/akun oleh aplikasi (pemantauan) -->
  <rule id="110601" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^device_banned$</field>
    <description>SALADINSHOP: Device temporarily banned after attack from $(ip_address)</description>
    <group>device_ban,</group>
  </rule>
  <rule id="110602" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^account_banned$</field>
    <description>SALADINSHOP: Customer account temporarily banned from $(ip_address)</description>
    <group>account_ban,</group>
  </rule>
  <rule id="110603" level="12">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^banned_device_request$</field>
    <description>SALADINSHOP: Banned device returned from new IP $(ip_address) (possible VPN/IP change)</description>
    <group>ip_evasion,possible_vpn,</group>
  </rule>
  <rule id="110604" level="8">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^banned_account_request$</field>
    <description>SALADINSHOP: Login attempt on temporarily banned account from $(ip_address)</description>
    <group>ip_evasion,</group>
  </rule>

</group>
```

### 2.4 EC2 Wazuh: Active Response dan notifikasi

Di `/var/ossec/etc/ossec.conf`:

1. **Active Response (blokir IP 30 menit).** Satukan semua rule yang memblokir dalam **satu blok** `<timeout>1800</timeout>`:

   ```xml
   <rules_id>110100,110110,110131,110401,110411,110420,110421,110501,110603</rules_id>
   <timeout>1800</timeout>
   ```

   Ini sekaligus menaikkan timeout SQLi (110100) dari 600 ke 1800 detik, sesuai keputusan di dokumen 22. Pastikan blok lama ber-timeout 600 dihapus atau tidak lagi memuat 110100. **Jangan** memasukkan rule S06, S07, S09, dan S10 ke Active Response.

2. **Integrasi n8n.** Tambahkan semua rule baru ke `<rule_id>` blok `<integration>` custom-n8n:
   `110110,110130,110131,110510,110512,110520,110521,110524,110530,110531,110540,110541,110601,110602,110603,110604`.

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-skenario
sudo nano /var/ossec/etc/ossec.conf
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
sudo grep -F 'saladinshop-ip-control' /var/ossec/etc/shared/ar.conf
```

### 2.5 n8n (homelab)

- **Workflow pertama** (Webhook → Edit Fields → Switch → Telegram): tambahkan satu output Switch per rule baru, lalu sambungkan ke **Send a text message**. Nama output yang disarankan: `110110 — XSS Attempt`, `110130 — Path Probe`, `110131 — Repeated Path Scan`, `110510 — Checkout Limited`, `110512 — Bot Order`, `110521 — Voucher Reuse`, `110524 — Price Tampering`, `110530 — Fake Payment Webhook`, `110531 — Payment Amount Mismatch`, `110541 — Reset Flood`, `110603 — Banned Device Returned`.
- **Workflow kedua** (kontrol IP dari dashboard): node `HTTP Request1` memakai `"command": "!saladinshop-ip-control.py"`.

---

## Bagian 3 — Aturan uji yang berlaku untuk semua skenario

| Hal | Aturan |
|---|---|
| **Peran** | **PENGUJI**: Kali atau perangkat lain dengan IP publik. **ADMIN**: Anda, dengan dashboard dan SSH ke EC2 App dan EC2 Wazuh |
| **Jam** | Sinkronkan jam laptop. Selisih jam membuat waktu di lembar uji tidak cocok dengan log server |
| **Pengulangan** | Varian inti diulang **10 kali**, ditambah **traffic normal** di endpoint yang sama untuk menghitung false positive |
| **Skenario yang memblokir** (S01, S02, S03, S04, S05, S08) | **Jangan membuka blokir manual** di antara percobaan. Script respons mengabaikan blokir baru (`duplicate_ignored`) bila timer lama masih berjalan. Tunggu `unblocked` oleh `wazuh:auto-expire` (30 menit) atau pakai IP lain. Lalu buka ban perangkat di dashboard (**Device & Akun Ban**) |
| **Lembar uji** | Test ID, versi konfigurasi, waktu serangan, HTTP, event aplikasi, waktu alert Wazuh, waktu Telegram, waktu blokir, akses setelahnya. Contoh ID: `S08-V2-03` |
| **Kode pesanan** | Tulis **tanpa tanda `#`**, misalnya `ORD-G4MHN2Z5` |

Metrik yang dihitung: detection rate, false positive, waktu deteksi (serangan → alert), waktu notifikasi (alert → Telegram), waktu respons (alert → blokir).

---

## Bagian 4 — Skenario

### Peta 7 lapisan untuk 10 skenario

● = lapisan utama tempat serangan atau pertahanan bekerja, ○ = pendukung, — = tidak terlibat.

| Skenario | 7 App | 6 Pres | 5 Sess | 4 Trans | 3 Net | 2–1 |
|---|---|---|---|---|---|---|
| S01 SQL injection | ● | ○ | ○ | — | ● | — |
| S02 Pemindaian jalur | ● | — | — | — | ● | — |
| S03 Brute force | ● | ○ | ○ | — | ● | — |
| S04 Credential stuffing | ● | — | ○ | — | ● | — |
| S05 BOLA | ● | — | ● | — | ● | — |
| S06 Fake order | ● | — | ○ | — | ○ | — |
| S07 Voucher | ● | — | ○ | — | — | — |
| S08 XSS | ● | ● | ○ | — | ● | — |
| S09 Webhook | ● | ● | — | — | — | — |
| S10 Enumeration | ● | ○ | ○ | — | ○ | — |

**Catatan cara membaca:**
- **Alat bersama di semua skenario** (tidak diulang di tiap tabel): Wazuh Agent (membaca log, TCP 1514), Wazuh Manager (mencocokkan rule), n8n, dan Telegram sebagai jalur deteksi dan notifikasi.
- **Lapisan 4 (Transport)** bukan bagian skenario serangan. Ia diperiksa lewat konfigurasi AWS Security Group: 443 terbuka ke publik, 5432 (RDS) hanya dari Security Group aplikasi, 1514 hanya antar-EC2.
- **Lapisan 2 dan 1** dikelola AWS (*shared responsibility model*), di luar cakupan.
- **Blokir IP dicatat di lapisan 3** karena yang diblokir adalah identitas jaringan (alamat IP). Secara teknis Nginx menegakkannya di lapisan aplikasi (membaca IP lalu menolak request), jadi ini penyederhanaan pemetaan, bukan klaim bahwa Nginx bekerja sebagai firewall lapisan 3.
- **Lapisan 5** mencakup cookie sesi login dan cookie perangkat (`sv_did`), yang dipakai untuk mengenali pengguna di antara request.


### S01 — SQL Injection

**Apa dan kenapa bisa terjadi.** Aplikasi yang menyusun query database dengan menempelkan input pengguna langsung ke teks SQL membuat input itu bisa **mengubah arti query**. Contoh `' OR 1=1 --` membuat syarat pencarian selalu benar, sedangkan `UNION SELECT` bisa membaca tabel lain. Akar masalahnya: **data dan perintah tidak dipisahkan**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Menolak input berpola SQL dan mencegah input mengubah query | Middleware Next.js, API (`detectSQLi`), Prisma ORM | Pola `UNION…SELECT`, `OR 1=1`, `--`, `SLEEP()`; respons 400 |
| 6 Presentation | Mengurai input yang di-encode browser sebelum dicek | `query-inspection` (decode URL) | Decode hingga 3 putaran (`%27` menjadi `'`) |
| 5 Session | Mengenali perangkat penyerang walau IP berubah | Cookie `sv_did`, tabel `security_penalties` (RDS) | Ban 30 menit, 60 menit jika mengulang < 24 jam |
| 3 Network | Memblokir IP penyerang | Wazuh Active Response + script, Nginx `deny` | Rule 110100; timeout 1800 detik; hanya IPv4 publik |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan utama | **Prisma ORM** memakai *parameterized query*: input selalu diperlakukan sebagai data, bukan perintah SQL | Tidak ada penggabungan string ke query |
| Pemantauan | Deteksi pola SQL di middleware (query URL, di-decode dulu) dan API (`detectSQLi`) → 400 | Pola: `UNION…SELECT`, `OR 1=1`, `--`, `SLEEP()`, dll. |
| Respons | Rule Wazuh **110100** → Active Response | Blokir IP 1800 detik + ban perangkat 30 menit |

**Deteksi dan respons.** `sql_injection_attempt` → rule 110100 → Nginx `deny` → 403.

**Langkah uji.**

1. PENGUJI catat IP dan waktu: `date -Is; curl -4 -s https://checkip.amazonaws.com`. Buka halaman utama di browser uji (cookie perangkat terpasang).
2. Kirim serangan (pilih salah satu):

   ```bash
   curl -i --get --data-urlencode "search=' OR 1=1 --" https://saladinshop.duckdns.org/api/products
   ```

   atau di browser: `https://saladinshop.duckdns.org/products?q=1 UNION SELECT password FROM users`
   **Hasil:** **400**. Catat `x-request-id`.
3. ADMIN:

   ```bash
   # EC2 App
   grep -E '"event_type":"(sql_injection_attempt|device_banned)"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3 | cut -c1-230
   read -r -p "IP penguji: " IP_UJI
   sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
   sudo tail -n 3 /var/ossec/logs/saladinshop-active-response.log
   # EC2 Wazuh
   sudo grep -F '"id":"110100"' /var/ossec/logs/alerts/alerts.json | tail -n 2 | cut -c1-230
   ```

4. Telegram masuk. PENGUJI buka halaman utama → **403**.
5. **Varian VPN:** nyalakan VPN, buka halaman utama dengan **browser yang sama** → tetap **403** (ban perangkat). Dashboard: Device & Akun Ban menandai "IP berubah".
6. Kontrol normal: `/api/products?search=diamond` → 200, tanpa event.

**Penjelasan untuk dosen.** "SQL injection terjadi karena input dicampur dengan perintah SQL. Di sistem ini, pencegahan utamanya Prisma yang memisahkan data dari perintah. Deteksi pola menjadi lapisan pemantauan, sehingga percobaannya tercatat, Wazuh memblokir IP selama 30 menit, dan perangkatnya ikut dibatasi."

---

### S02 — Pemindaian Jalur Sensitif (usulan, menunggu persetujuan dosen)

**Apa dan kenapa bisa terjadi.** Server sering secara tidak sengaja meninggalkan file atau panel di jalur yang bisa dibuka publik (`/.env`, `/.git`, `/wp-login.php`, `/phpmyadmin`, `/actuator/env`, `backup.sql`). Bot memakai daftar kata (*wordlist*) untuk mencoba ribuan jalur dan mencari yang terbuka. Akar masalahnya: **konfigurasi default atau file sisa yang terekspos**. Ini tahap pengintaian (MITRE T1595.003) yang biasanya mendahului serangan lain.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Menolak jalur sensitif dan mengenali pola pemindaian | Nginx `location`, middleware, Wazuh rule 110130/110131 | Daftar jalur sensitif; 5 jalur dalam 60 detik per IP (`frequency=5`, `timeframe=60`) |
| 3 Network | Memblokir IP pemindai | Wazuh Active Response + script, Nginx `deny` | Rule 110131; timeout 1800 detik |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan | **Nginx**: `location ~ /\.(env\|git\|aws\|svn\|DS_Store)` dan `wp-admin\|phpmyadmin\|pma\|backup.*` → 404. **Middleware**: `/wp-login`, `/adminer`, `/actuator`, `/cgi-bin`, `/config.json`, `/db_backup`, `/telescope` → 404 | File sensitif tidak pernah dilayani |
| Deteksi | Rule **110130** (satu kejadian, alert) dan **110131** (5 jalur dalam 60 detik dari IP yang sama) | `frequency=5`, `timeframe=60`, `same_field ip_address` |
| Respons | Active Response untuk 110131 | Blokir IP 1800 detik |

Satu jalur tidak langsung memblokir karena manusia bisa salah ketik. Pemindai selalu mencoba banyak jalur sekaligus.

**Langkah uji (10×).** Dari Kali:

```bash
for p in /wp-login.php /adminer /actuator/env /cgi-bin/test /config.json /db_backup.sql /telescope /debug/default/view; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://saladinshop.duckdns.org$p"
  sleep 1
done
curl -s -o /dev/null -w "Halaman utama -> %{http_code}\n" https://saladinshop.duckdns.org/
```

**Hasil:** jalur 1–4 dijawab **404** (alert 110130), setelah jalur ke-5 muncul alert **110131**, IP diblokir, jalur berikutnya dan halaman utama **403**. Jalur seperti `/.env` dan `/wp-admin` ditolak Nginx sebelum sampai ke aplikasi, jadi tidak menghasilkan event aplikasi. Karena itu varian inti memakai jalur yang ditangani middleware.

```bash
# EC2 App
grep -F '"event_type":"sensitive_path_scan"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3 | cut -c1-220
read -r -p "IP penguji: " IP_UJI
sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
# EC2 Wazuh
sudo grep -E '"id":"11013[01]"' /var/ossec/logs/alerts/alerts.json | tail -n 3 | cut -c1-220
```

**Demo (1×).** Teman Anda memindai website Anda **dengan izin Anda**:

```bash
gobuster dir -u https://saladinshop.duckdns.org -w /usr/share/wordlists/dirb/common.txt -t 5
# atau
nikto -h https://saladinshop.duckdns.org
```

Opsi dapat berbeda antarversi, jadi cek `--help`. Pembatas Nginx (30 request per detik, burst 50) bisa menjawab 503 bila pemindai terlalu cepat. Yang diamati: alert, Telegram, lalu pemindai mulai menerima 403.

**Kontrol normal.** Membuka halaman produk, login, dan checkout: tanpa event. Satu jalur sensitif saja: alert 110130 tanpa blokir.

**Batasan.** Pemindai yang memakai banyak IP atau sangat lambat (satu jalur per beberapa menit) tidak mencapai ambang. Deteksi hanya mencakup jalur di daftar. Pemindai biasanya tidak menyimpan cookie, sehingga yang efektif adalah blokir IP, bukan ban perangkat.

**Penjelasan untuk dosen.** "Pemindaian jalur sensitif adalah pengintaian: bot mencoba daftar jalur yang sering salah konfigurasi. Sistem menutupnya di dua tempat, Nginx dan aplikasi, lalu Wazuh mengenali pola 5 jalur dalam 60 detik dan memblokir IP-nya selama 30 menit."

---

### S03 — Brute Force (customer dan admin)

**Apa dan kenapa bisa terjadi.** Penyerang mencoba banyak password pada **satu akun** sampai ada yang cocok. Ini bisa berhasil bila login tidak membatasi percobaan dan password pengguna lemah. Akar masalahnya: **tidak ada batas percobaan dan tidak ada pemantauan pola**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Membatasi dan mendeteksi tebakan password | Pembatas login, Turnstile, detektor (`credential-stuffing-detector`), Wazuh 110401/110411 | Customer 30 per 15 menit; admin 5 per 15 menit + Nginx 5 per menit (burst 3); 5 gagal per akun dalam 10 menit |
| 6 Presentation | Password disimpan sebagai hash, bukan teks asli | bcrypt (`bcryptjs`) | Salt 10 putaran |
| 5 Session | Membatasi perangkat penyerang (akun korban tidak diban) | Cookie `sv_did`, RDS | Ban perangkat 30 menit |
| 3 Network | Memblokir IP penyerang | Wazuh Active Response + script, Nginx `deny` | Timeout 1800 detik |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Memperlambat | Pembatas request login; **bcrypt** untuk hash password; **Cloudflare Turnstile**; pesan gagal seragam ("Email atau password salah") | Customer 30 request per 15 menit; admin 5 per 15 menit + Nginx 5 per menit (burst 3) |
| Deteksi | Detektor aplikasi: **5 kegagalan ke 1 akun dalam jendela geser 10 menit** | `user_bruteforce_attempt` → rule **110401**; admin → **110411** |
| Respons | Active Response + ban perangkat | Blokir IP 1800 detik. Yang diban perangkat, **bukan akun korban**, supaya korban tidak ikut terkunci |

**Langkah uji.**

1. Siapkan akun customer uji terverifikasi.
2. Di halaman login (browser PENGUJI), masukkan email akun uji dengan **password salah**, selesaikan CAPTCHA setiap kali, ulangi **5 kali**. Hasil: 401, lalu 429 setelah ambang.
3. ADMIN:

   ```bash
   sudo grep -E 'user_login_failed|user_bruteforce_attempt|device_banned' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 8 | cut -c1-230
   ```

   Alert **110401**, Telegram, `deny` di Nginx, PENGUJI **403**. Varian VPN: tetap 403.
4. Untuk admin: ulangi di `/admin/login` dengan akun admin uji. Rule **110411**. Jangan lakukan ini dari jaringan atau Tailscale yang dipakai administrasi.
5. Kontrol normal: salah password 1–2 kali lalu benar → berhasil, tanpa alert.

**Penjelasan untuk dosen.** "Brute force bisa terjadi karena password dapat ditebak berulang. Sistem membatasi laju login dan menghitung kegagalan dalam jendela 10 menit. Lima kegagalan memicu rule 110401 dan IP diblokir 30 menit. Yang dibatasi perangkat penyerang, bukan akun korban."

---

### S04 — Credential Stuffing

**Apa dan kenapa bisa terjadi.** Banyak orang memakai password yang sama di banyak situs. Penyerang membawa daftar email dan password hasil kebocoran situs lain, lalu mencobanya ke banyak akun, **masing-masing sekali**. Pembatas per akun tidak terpicu karena tiap akun hanya dicoba satu kali. Akar masalahnya: **pemakaian ulang password** ditambah **tidak ada pemantauan lintas akun**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Mendeteksi banyak akun berbeda dari satu sumber | Turnstile, detektor jendela geser, Wazuh 110420 | 5 email berbeda per IP dalam 10 menit; login benar pun dijawab 429 bila IP mencurigakan |
| 5 Session | Membatasi perangkat penyerang | Cookie `sv_did`, RDS | Ban perangkat 30 menit |
| 3 Network | Memblokir IP penyerang | Wazuh Active Response + script, Nginx `deny` | Timeout 1800 detik |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan | Turnstile. Login dengan password benar pun **ditolak (429)** jika IP yang sama baru saja mencoba ≥ 5 akun berbeda | Jendela geser 10 menit |
| Deteksi | **5 email berbeda dari 1 IP dalam 10 menit** | `credential_stuffing_attempt` → rule **110420** |
| Respons | Active Response + ban perangkat | Blokir IP 1800 detik |

**Langkah uji.**

1. Mulai dari jendela bersih (≥ 10 menit sejak uji login terakhir dari IP yang sama).
2. Di form login, masukkan **5 email berbeda** (boleh tidak terdaftar) dengan password salah, CAPTCHA diselesaikan tiap kali.
3. ADMIN: `grep -F 'credential_stuffing_attempt' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3`. Cari `distinct_accounts=5`. Alert **110420**, Telegram, blokir IP, PENGUJI 403, varian VPN tetap 403.
4. Kontrol normal: pengguna salah ketik email sekali lalu benar → tanpa alert.

**Batasan.** Dihitung per IP. Penyerang yang memutar IP **dan** perangkat setiap percobaan tidak dijamin terdeteksi.

**Penjelasan untuk dosen.** "Credential stuffing memanfaatkan password yang dipakai ulang. Karena tiap akun hanya dicoba sekali, pembatas per akun tidak berguna. Maka sistem menghitung jumlah akun berbeda per IP: lima akun dalam 10 menit memicu rule 110420 dan blokir 30 menit."

---

### S05 — BOLA (akses pesanan milik akun lain)

**Apa dan kenapa bisa terjadi.** *Broken Object Level Authorization* terjadi ketika API mengambil data berdasarkan ID di URL (kode pesanan) **tanpa memeriksa siapa pemiliknya**. Akun B yang sah bisa membaca pesanan akun A hanya dengan mengganti ID. Ini peringkat #1 di OWASP API Security Top 10 2023. Akar masalahnya: **pemeriksaan kepemilikan dilewatkan**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Memeriksa kepemilikan pesanan pada setiap query | Prisma (`orderCode` + `userId`), pembatas `order_detail`, Wazuh 110500/110501 | Respons 404 tanpa data; 30 request per menit; 110501: berulang dari IP sama (panduan: 3 kali dalam 300 detik) |
| 5 Session | Sesi menentukan pemilik; sesi akun penyerang dicabut | JWT HS256 (`jose`), cookie `customer_session_token`, `sessionVersion` | Sesi 7 hari; ban akun menaikkan `sessionVersion`; ban setelah 3 kali dalam 10 menit |
| 3 Network | Memblokir IP penyerang | Wazuh Active Response + script, Nginx `deny` | Rule 110501; timeout 1800 detik |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan utama | Setiap query pesanan memakai syarat **kode pesanan DAN pemilik = akun yang login**. Jika tidak cocok, jawabannya **404 tanpa data** (sama dengan pesanan yang tidak ada, supaya tidak membocorkan keberadaannya) | `where: { orderCode, userId }` |
| Deteksi | `unauthorized_object_access_attempt` → **110500**; berulang dari IP yang sama → **110501** | Panduan: 3 kali dalam 300 detik |
| Respons | Active Response (110501) + ban perangkat **dan akun** setelah 3 kali dalam 10 menit | Blokir IP 1800 detik, sesi akun B dicabut |

**Langkah uji.**

1. Siapkan **akun A** (punya pesanan sandbox, catat kode pesanannya) dan **akun B** (penyerang), di profil browser berbeda.
2. Kontrol normal: A membuka pesanannya sendiri → 200.
3. PENGUJI login sebagai B, F12 → **Console** (bukan terminal), jalankan:

   ```javascript
   (async () => {
     const orderCodeA = 'GANTI_KODE_PESANAN_A';
     for (let attempt = 1; attempt <= 5; attempt++) {
       const r = await fetch('/api/user/orders/' + encodeURIComponent(orderCodeA),
         { credentials: 'same-origin', cache: 'no-store' });
       console.log({ attempt, status: r.status, requestId: r.headers.get('x-request-id'), time: new Date().toISOString() });
       if (r.status !== 404) break;
       await new Promise(res => setTimeout(res, 1500));
     }
   })();
   ```

   **Hasil:** **404** tanpa data pesanan A. Setelah ambang, request berikutnya 401/403 (sesi dicabut, perangkat diban, atau IP diblokir).
4. ADMIN: `grep -E 'unauthorized_object_access_attempt|device_banned|account_banned' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 8 | cut -c1-230`. Alert **110500** dan **110501**, Telegram, deny, Device & Akun Ban menampilkan perangkat dan akun B.
5. **Varian VPN dan akun:** B nyalakan VPN, buka incognito, login sebagai B → **403 "Akun dibatasi sementara"**.
6. Kontrol normal: salah ketik kode pesanan **1 kali** dari akun sendiri → 404 biasa, tanpa ban.

**Penjelasan untuk dosen.** "BOLA terjadi kalau server percaya pada ID dari pengguna tanpa memeriksa pemiliknya. Di sistem ini setiap query pesanan mensyaratkan pemilik sama dengan akun yang login, sehingga akun B hanya dapat 404. Percobaan berulang terdeteksi Wazuh, IP diblokir, dan akun penyerang ikut dibatasi."

---

### S06 — Fake Order (checkout abuse)

**Apa dan kenapa bisa terjadi.** Checkout adalah alur bisnis yang tidak mengikat pembeli untuk membayar. Penyerang (atau bot) bisa membuat banyak pesanan tanpa membayar, menahan stok, dan membebani gateway pembayaran. Tidak ada celah teknis yang dibobol, sehingga WAF biasa sering tidak mendeteksinya. Akar masalahnya: **alur bisnis tanpa batas**. Rujukan: OWASP API6:2023 dan OWASP Automated Threats OAT-021.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Membatasi alur checkout | Turnstile, `checkout-abuse.ts`, pembatas `checkout`, worker kedaluwarsa, Wazuh 110510/110512 | Pending 3 per akun dan 5 per IP; kedaluwarsa 15 menit; 10 request per menit |
| 5 Session | Batas per akun memakai akun dari sesi login | JWT sesi | ID akun dari sesi |
| 3 Network | Batas per IP di pintu depan (tanpa blokir) | Nginx `limit_req` (`checkout_limit`) | 10 request per menit, burst 5; lewat dari itu dijawab 503 |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan | Turnstile; **batas pesanan menunggu bayar** 3 per akun dan 5 per IP; pesanan tak dibayar kedaluwarsa 15 menit; Nginx `checkout_limit` | 429 `ACTIVE_PENDING_LIMIT`; 10 request per menit, burst 5 |
| Deteksi | `checkout_abuse` → **110510**; `bot_order_attempt` → **110512** | — |
| Respons | **Batasi + notifikasi, tanpa blokir** (pelanggan biasa juga bisa lupa bayar) | — |

**Langkah uji (varian inti: pesanan ke-4 ditolak).**

1. Login akun uji C. Buat **3 pesanan** Sandbox lewat halaman checkout (CAPTCHA diselesaikan), **jangan dibayar**.
2. Buat pesanan **ke-4** → alert di halaman, Network `POST /api/orders` → **429** `ACTIVE_PENDING_LIMIT`. Riwayat tetap 3 pending.
3. ADMIN: `grep -F '"event_type":"checkout_abuse"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 1 | cut -c1-230`. Alert **110510**, Telegram. Akun C **tetap bisa** membuka website.
4. Setelah ±15 menit ketiga pesanan `expired` dan akun C bisa checkout lagi.
5. **Bukti tambahan (1×), tanpa CAPTCHA:**

   ```bash
   curl -s -w "\n%{http_code}\n" -H 'Content-Type: application/json' \
     -d '{"product_id":"GANTI_SLUG","quantity":1,"customer_name":"Bot Uji","customer_email":"bot.uji@example.com","customer_phone":"081200000000","payment_method":"va_bca"}' \
     https://saladinshop.duckdns.org/api/orders
   ```

   **Hasil:** **400**, tidak ada pesanan, alert **110512**.

Untuk 10 percobaan, pakai beberapa akun uji bergantian atau tunggu 15 menit agar pesanan kedaluwarsa. Banjir request ditahan Nginx (request ke-7 sudah ditolak), tidak diuji sebagai varian terpisah.

**Penjelasan untuk dosen.** "Fake order memanfaatkan checkout yang tidak mewajibkan bayar di awal. Sistem membatasi pesanan menunggu bayar per akun dan per IP, serta memakai CAPTCHA. Wazuh hanya memberi notifikasi, tidak memblokir, karena pelanggan biasa juga bisa lupa membayar."

---

### S07 — Voucher Abuse

**Apa dan kenapa bisa terjadi.** Aturan voucher (sekali pakai per akun, minimal belanja, masa berlaku) hanya aman bila **dipaksakan di server**. Jika hanya ada di tampilan, penyerang bisa melewatinya dengan request langsung. Jika pemeriksaan dan pemakaian tidak atomik, dua checkout bersamaan bisa sama-sama lolos (*race condition*). Nilai diskon dari klien juga tidak boleh dipercaya. Akar masalahnya: **logika bisnis yang bisa dilewati atau dibalap**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Memaksa aturan voucher di server | Route voucher dan order, Prisma transaction, `pg_advisory_xact_lock`, Wazuh 110520/110521/110524 | Sekali pakai per akun; 20 validasi per menit; field harga dari klien ditolak |
| 5 Session | Voucher hanya untuk akun yang login | JWT sesi | Wajib login |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan | Validasi di server (login, masa berlaku, minimal belanja, sekali pakai per akun); diskon dihitung server; **kunci transaksi per voucher+akun** (`pg_advisory_xact_lock`) menutup race condition; request yang membawa field harga (`total_amount`, `discount_amount`, dll.) **ditolak** | Voucher seed HEMAT5K: Rp5.000, minimal Rp30.000 |
| Deteksi | `voucher_abuse_attempt` (`reason=reuse`) → **110520** dan **110521**; manipulasi harga → **110524** | — |
| Respons | **Tolak + notifikasi, tanpa blokir** | — |

**Langkah uji (varian inti: pakai ulang voucher).**

1. Login **akun D** (belum pernah memakai HEMAT5K). Checkout produk ≥ Rp30.000 dengan HEMAT5K → diskon Rp5.000 diterapkan, pesanan dibuat. Bayar via Sandbox agar pemakaian berlaku permanen, atau biarkan pending (≤ 15 menit).
2. **Lewat tampilan:** terapkan HEMAT5K lagi → ditolak "sudah pernah digunakan" (400).
3. **Lewat API:** di halaman checkout (CAPTCHA diselesaikan, jangan klik bayar), F12 → **Console**:

   ```javascript
   (async () => {
     const r = await fetch('/api/orders', {
       method: 'POST', credentials: 'same-origin',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         product_id: 'GANTI_SLUG_PRODUK', quantity: 1,
         customer_name: 'Uji Voucher D', customer_email: 'GANTI_EMAIL_AKUN_D',
         customer_phone: '081200000002', payment_method: 'va_bca',
         voucher_code: 'HEMAT5K', turnstile_token: window.turnstile.getResponse()
       })
     });
     console.log(r.status, await r.json());
   })();
   ```

   **Hasil:** **400** "sudah pernah Anda gunakan", tanpa pesanan baru.
4. ADMIN: `grep -F 'reason=reuse' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 2 | cut -c1-230`. Dua event `reason=reuse`, alert **110521**, Telegram.
5. Kontrol normal: akun yang belum pernah memakai voucher → diskon diterapkan, tanpa event.

**Temuan (cukup disebut di pembahasan, tidak diuji 10×):** race condition pada pemakaian voucher ditutup dengan kunci transaksi, dan manipulasi harga dari klien (uji 3 November 2026: total tetap Rp196.108, bukan Rp1.000) kini ditolak dan dicatat sebagai `checkout_tampering_attempt` (rule 110524).

**Penjelasan untuk dosen.** "Penyalahgunaan voucher adalah serangan pada logika bisnis, bukan pada kode. Aturan sekali pakai dipaksakan di server dan dikunci per transaksi, sehingga request langsung maupun checkout bersamaan tidak bisa memakai voucher dua kali. Percobaannya tercatat dan diberitahukan ke admin."

---

### S08 — Cross-Site Scripting (XSS)

**Apa dan kenapa bisa terjadi.** Jika input pengguna ditampilkan kembali di halaman **sebagai HTML**, browser bisa menjalankannya sebagai kode. Penyerang menyisipkan `<script>`, lalu kode itu berjalan di browser korban, misalnya mencuri sesi atau mengubah halaman checkout (pola *Magecart*). Akar masalahnya: **output tidak di-encode**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Mendeteksi pola XSS dan menolak | Middleware (`query-inspection`), API (`detectXSS`), Wazuh 110110 | Respons 400; rule 110110 |
| 6 Presentation | Mencegah input dijalankan sebagai kode | **Output encoding React**, decode URL | Teks tampil apa adanya (`&lt;b&gt;`); decode hingga 3 putaran |
| 5 Session | Cookie tidak bisa dicuri skrip | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` | — |
| 3 Network | Memblokir IP penyerang | Wazuh Active Response + script, Nginx `deny` | Timeout 1800 detik; ditambah ban perangkat 30 menit |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan utama | **Output encoding React**: semua data ditampilkan sebagai teks | Tidak ada `dangerouslySetInnerHTML` pada data pengguna |
| Pengurang dampak | Cookie sesi dan perangkat `HttpOnly` | JavaScript tidak bisa membaca cookie |
| Pemantauan | Deteksi pola XSS di middleware dan API. URL **di-decode dulu** (`%3Cscript%3E` → `<script>`), sampai 3 putaran | Respons 400 |
| Respons | Rule **110110** → Active Response | Blokir IP 1800 detik + ban perangkat 30 menit |

**Langkah uji (varian inti: XSS di URL halaman, 10×).**

1. PENGUJI buka halaman utama (cookie perangkat terpasang), lalu: `https://saladinshop.duckdns.org/products?q=<script>alert('XSS-UJI')</script>`
   **Hasil:** **400** "Malicious or invalid request query parameters detected", **tanpa** pop-up.
2. Tunggu ±15 detik, buka halaman utama → **403**. Varian VPN dengan browser yang sama → tetap **403**.
3. ADMIN:

   ```bash
   grep -E '"event_type":"(xss_attempt|device_banned)"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 2 | cut -c1-230
   sudo grep -F '"id":"110110"' /var/ossec/logs/alerts/alerts.json | tail -n 1 | cut -c1-200
   ```

**Bukti tambahan (1×): output encoding.**

1. Login akun uji, checkout produk Sandbox, isi **Catatan Tambahan**: `<b>TEBAL-UJI</b> <i>miring</i>` (tanpa script, sehingga lolos deteksi).
2. Dalam **15 menit**, buka dashboard admin → **Semua Pesanan** → kolom **Catatan** (atau klik baris untuk kotak "Catatan Khusus dari Pembeli").
   **Hasil:** teks tampil **apa adanya** termasuk `<b>`, bukan huruf tebal. Inspect elemen: `&lt;b&gt;TEBAL-UJI&lt;/b&gt;`.

Kontrol normal: `/products?q=minecraft` → 200, tanpa event.

**Penjelasan untuk dosen.** "XSS terjadi bila input ditampilkan sebagai HTML. Pencegahan utamanya output encoding React, yang membuktikan payload tidak pernah dijalankan walaupun lolos deteksi. Deteksi pola adalah lapisan pemantauan yang membuat percobaannya tercatat dan IP-nya diblokir."

---

### S09 — Manipulasi Webhook Pembayaran

**Apa dan kenapa bisa terjadi.** Setelah pelanggan membayar, Midtrans memanggil endpoint webhook di server toko. Endpoint itu **harus publik** supaya bisa dipanggil Midtrans. Jika server percaya isi pesannya, siapa pun bisa mengirim "pesanan sudah dibayar" dan mendapat produk tanpa membayar. Akar masalahnya: **endpoint publik yang mempercayai data dari luar**.

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Menolak notifikasi pembayaran palsu | Route webhook, Prisma `updateMany` atomik, Wazuh 110530/110531 | 403 tanda tangan salah; 400 nominal beda; status `paid` diklaim sekali |
| 6 Presentation | Membuktikan keaslian pengirim dengan tanda tangan digital | SHA-512 + `MIDTRANS_SERVER_KEY`, `crypto.timingSafeEqual` | `SHA512(order_id + status_code + gross_amount + server key)`, 128 karakter heksadesimal |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Keaslian pengirim | **Tanda tangan SHA-512**: `SHA512(order_id + status_code + gross_amount + SERVER_KEY)`, dibandingkan secara *timing-safe*. `SERVER_KEY` hanya diketahui Midtrans dan server toko. Kalau kunci kosong, semua ditolak | Tanda tangan salah → 403 |
| Keutuhan data | `gross_amount` harus sama dengan total pesanan di database | Beda → 400 |
| Pengiriman ganda | Pesanan diklaim `paid` hanya sekali (atomik) | Replay tidak mengirim produk dua kali |
| Deteksi | `invalid_payment_callback` → **110530** (tanda tangan), **110531** (nominal) | — |
| Respons | **Tolak + alert prioritas tinggi, tanpa blokir otomatis**, supaya IP Midtrans tidak ikut terblokir bila terjadi salah konfigurasi | — |

**Persiapan.** Buat satu **pesanan uji pending** (jangan dibayar) dan catat kodenya **tanpa `#`** (mis. `ORD-G4MHN2Z5`) beserta totalnya. Di **EC2 App**, siapkan fungsi tanda tangan (server key tidak ditampilkan):

```bash
cd ~/ecommerce-security
sign() { sudo docker compose -f docker-compose.aws.yml exec -T app node -e '
const c=require("crypto"); const [o,s,g]=process.argv.slice(1);
console.log(c.createHash("sha512").update(o+s+g+process.env.MIDTRANS_SERVER_KEY).digest("hex"))' "$1" "$2" "$3"; }
WEBHOOK=https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

**Varian A: tanda tangan palsu** (dari **Kali**, penyerang tidak tahu server key):

```bash
ORDER_P=ORD-GANTI_KODE; TOTAL_P=GANTI_TOTAL    # contoh 35000.00
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"$TOTAL_P\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$(head -c 64 /dev/urandom | sha512sum | cut -d' ' -f1)\"}" \
  https://saladinshop.duckdns.org/api/payments/midtrans/webhook
```

**Hasil:** **403** "Invalid signature key". Pesanan tetap pending. Alert **110530**, Telegram.

**Varian B: tanda tangan sah, nominal dimanipulasi** (dari **EC2 App**, karena hanya di sana ada server key untuk membuat tanda tangan sah):

```bash
ORDER_P=ORD-GANTI_KODE
SIG=$(sign "$ORDER_P" 200 1000.00); echo "SIG panjang: ${#SIG}"     # harus 128
curl -i -H 'Content-Type: application/json' \
  -d "{\"order_id\":\"$ORDER_P\",\"status_code\":\"200\",\"gross_amount\":\"1000.00\",\"transaction_status\":\"settlement\",\"fraud_status\":\"accept\",\"payment_type\":\"bank_transfer\",\"signature_key\":\"$SIG\"}" \
  "$WEBHOOK"
```

**Hasil:** **400** "Payment amount mismatch". Pesanan tetap pending. Alert **110531**, Telegram.

> Jika hasilnya **200 OK "Webhook processed"**, kode pesanan tidak ditemukan (ada tanda `#`, salah ketik, atau pesanan sudah dihapus). Webhook sengaja menjawab 200 untuk pesanan tak dikenal agar Midtrans berhenti mengulang, dan tidak ada yang berubah.

**Verifikasi pesanan tidak berubah:**

```bash
sudo docker compose -f docker-compose.aws.yml exec -T app node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
p.order.findUnique({ where: { orderCode: process.argv[1] }, select: { paymentStatus: true, paidAt: true } })
 .then(r => { console.log(r); return p.\$disconnect(); });" "$ORDER_P"
```

**Hasil:** `paymentStatus: 'pending'`, `paidAt: null`. Kontrol normal: bayar satu pesanan lewat simulator Sandbox → webhook asli diterima, produk terkirim sekali, tanpa event.

**Penjelasan untuk dosen.** "Webhook harus publik, jadi server wajib memastikan pengirimnya asli. Tanda tangan SHA-512 memakai kunci rahasia yang hanya diketahui Midtrans dan toko. Varian A menguji notifikasi tanpa tanda tangan sah, ditolak. Varian B menguji tanda tangan sah tetapi nominal dimanipulasi, tetap ditolak karena nominal dicocokkan dengan database."

---

### S10 — Lupa Password dan Account Enumeration

**Apa dan kenapa bisa terjadi.** Jika form lupa password menjawab berbeda untuk email yang terdaftar dan yang tidak ("email tidak ditemukan"), atau menjawab dengan **waktu** yang berbeda, penyerang bisa mengecek email mana yang punya akun. Daftar itu dipakai untuk credential stuffing (S04) dan phishing. Akar masalahnya: **respons yang membedakan** (isi atau waktu).

**Pemetaan 7 lapisan, tools, dan parameter.**

| Lapisan | Peran di skenario ini | Tools yang terlibat | Parameter |
|---|---|---|---|
| 7 Application | Menyamakan respons dan membatasi permintaan | Route forgot-password, pembatas `forgot_password`, Turnstile, Wazuh 110540/110541 | Pesan identik; waktu respons minimum sekitar 0,9–1,1 detik; 5 permintaan per 10 menit |
| 6 Presentation | Token reset tidak bisa dibaca atau diulang | Token disimpan sebagai hash | Berlaku 1 jam, sekali pakai |
| 5 Session | Sesi lama dicabut setelah reset berhasil | `sessionVersion` | Naik satu setiap reset |
| 3 Network | Batas permintaan per IP (tanpa blokir) | Pembatas request aplikasi | 5 permintaan per 10 menit |

**Yang menutup akar masalah.**

| Lapisan | Tools | Parameter |
|---|---|---|
| Pencegahan | Pesan respons **identik**; **waktu respons minimum** sekitar 0,9–1,1 detik untuk kedua kasus; pembatas request; Turnstile; token reset di-hash, berlaku 1 jam, sekali pakai | Batas 5 permintaan per 10 menit per IP |
| Deteksi | `user_password_reset_abuse` → **110540**; banjir → **110541** | — |
| Respons | **Batasi + notifikasi, tanpa blokir** | — |

**Langkah uji (varian inti: enumeration, 10×).**

1. Siapkan **akun R** (terdaftar, emailnya bisa dibuka) dan **email X** yang tidak terdaftar (mis. `tidakada.s10@example.com`).
2. Buka halaman **Lupa Password**, F12 → tab **Network** (filter `forgot`). Selesaikan CAPTCHA, kirim email R, catat **Status**, **Time**, dan `message`. Muat ulang halaman (F5, supaya CAPTCHA baru), kirim email X, catat hal yang sama.
3. **Hasil yang diharapkan:** keduanya **200** dengan `message` **sama persis** ("Jika alamat email Anda terdaftar…"), waktu keduanya sekitar 0,9–1,2 detik tanpa pola "terdaftar selalu lebih lama". Hanya akun R yang menerima email.
4. Kuota: maksimal 5 permintaan per 10 menit per IP, dihitung bersama halaman reset. Satu percobaan memakai 2 permintaan, jadi beri jeda 10 menit setiap 2 percobaan atau pakai IP lain.
5. Hitung rata-rata waktu kelompok R dan kelompok X di lembar uji. Kesimpulan aman bila pesannya selalu sama dan selisih rata-rata kecil serta tidak konsisten.

**Bukti tambahan (1×): banjir permintaan** (setelah jeda 10 menit):

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "R-$i: %{http_code}\n" -H 'Content-Type: application/json' \
    -d '{"email":"tidakada.s10@example.com"}' https://saladinshop.duckdns.org/api/auth/forgot-password
done
```

**Hasil:** R-1..5 **403** (tanpa CAPTCHA), R-6..7 **429**. Alert **110541**, Telegram, website tetap bisa diakses.

**Batasan.** Waktu respons minimum mengurangi tetapi tidak menghilangkan seluruh sinyal waktu. **Halaman register masih membocorkan keberadaan akun** (email terdaftar → 409), dibatasi rate limit dan CAPTCHA. Dicatat sebagai temuan.

**Penjelasan untuk dosen.** "Enumeration terjadi karena respons berbeda untuk akun yang ada dan tidak ada, baik isi maupun waktunya. Sistem menyamakan pesan dan menjaga waktu respons minimum, sehingga penyerang tidak bisa menebak akun. Banjir permintaan dibatasi dan dilaporkan ke admin."

---

## Bagian 5 — Ringkasan 10 skenario

| ID | Skenario | Varian inti (10×) | Rule | Respons |
|---|---|---|---|---|
| S01 | SQL injection | Payload SQL di pencarian atau URL | 110100 | **Blokir** IP + ban perangkat |
| S02 | Pemindaian jalur sensitif *(usulan)* | 8 jalur dengan `curl` | 110130 / 110131 | **Blokir** IP (setelah 5 jalur dalam 60 detik) |
| S03 | Brute force | 5 password salah ke 1 akun | 110401 / 110411 | **Blokir** IP + ban perangkat |
| S04 | Credential stuffing | 5 email berbeda dari 1 IP | 110420 | **Blokir** IP + ban perangkat |
| S05 | BOLA | Akun B membuka pesanan akun A | 110500 / 110501 | **Blokir** IP + ban perangkat dan akun |
| S06 | Fake order | Pesanan pending ke-4 | 110510 / 110512 | Batasi + notifikasi |
| S07 | Voucher abuse | Pakai ulang voucher sekali-pakai | 110520 / 110521 | Tolak + notifikasi |
| S08 | XSS | `<script>` di URL halaman | 110110 | **Blokir** IP + ban perangkat |
| S09 | Webhook palsu | Tanda tangan palsu dan nominal salah | 110530 / 110531 | Tolak + alert prioritas tinggi |
| S10 | Enumeration | Lupa password: email terdaftar vs tidak | 110540 / 110541 | Batasi + notifikasi |

**Dasar kebijakan respons bertingkat:** serangan teknis yang jelas berniat jahat diblokir, perilaku yang juga bisa dilakukan pelanggan biasa dibatasi dan dilaporkan, dan webhook pembayaran ditolak tanpa blokir otomatis supaya IP Midtrans tidak ikut terblokir bila terjadi salah konfigurasi.

---

## Bagian 6 — Temuan dan perbaikan selama pengujian (untuk pembahasan)

| No | Temuan | Skenario | Perbaikan |
|---|---|---|---|
| 1 | Penyerang ganti IP dengan VPN dan kembali mengakses setelah diblokir | Lintas skenario | Ban sementara berbasis cookie perangkat bertanda tangan dan akun |
| 2 | Event dari middleware tidak tercatat: relay memakai `http://`, lalu redirect 301 mengubah POST menjadi GET | S01, S02, S08 | Relay internal ke `127.0.0.1:3000` |
| 3 | Payload yang di-encode browser (`%3Cscript%3E`, `%27%20OR`) tidak terdeteksi | S01, S08 | Query di-decode bertahap sebelum dicocokkan |
| 4 | Credential stuffing lolos bila rangkaian melewati batas jendela tetap 10 menit | S04 | Jendela geser (*sliding window*) |
| 5 | Unblock dari dashboard gagal (Wazuh error 1652) setelah timeout diubah | Respons | n8n memanggil script langsung (`!saladinshop-ip-control.py`) |
| 6 | Blokir baru diabaikan (`duplicate_ignored`) setelah unblock manual saat timer lama masih berjalan | Respons | Belum diperbaiki, prosedur uji menunggu auto-expire |
| 7 | Dua checkout paralel dapat memakai voucher sekali-pakai dua kali | S07 | Kunci transaksi per voucher+akun |
| 8 | Penolakan voucher dan manipulasi harga tidak meninggalkan jejak di Wazuh | S07 | Dicatat sebagai `voucher_abuse_attempt` / `checkout_tampering_attempt` |
| 9 | Tanda tangan webhook bisa dipalsukan bila server key kosong | S09 | Ditolak bila kunci kosong; perbandingan timing-safe |
| 10 | Lupa password menjawab lebih lambat untuk email terdaftar | S10 | Waktu respons minimum yang sama |
| 11 | Register membocorkan keberadaan email (409) | S10 | Belum diperbaiki, dicatat sebagai batasan |
| 12 | FIM memantau folder source secara realtime, sehingga setiap deploy sah memicu alert defacement (false positive) | FIM | Cakupan FIM dipersempit ke file yang tidak seharusnya berubah |

---

## Lampiran A — Perubahan file tanpa izin (FIM)

Dipakai bila S02 tetap "web defacement/FIM", atau sebagai **bukti tambahan 1×** untuk S02 pemindaian jalur.

**Kenapa bisa terjadi.** Server tidak bisa dijangkau orang luar langsung (akses hanya lewat Tailscale). File tetap bisa berubah tanpa izin bila perangkat atau kredensial admin dikuasai, kode berbahaya masuk lewat library (*supply chain*), atau ada celah eksekusi kode di aplikasi. Prinsipnya *assume breach*: kalau pertahanan di depan gagal, perubahan harus tetap ketahuan. PCI DSS v4.0 Req. 11.5.2 mewajibkan mekanisme deteksi perubahan pada file penting (cek nomornya ke dokumen asli).

**Model penyerang.** Pihak yang **sudah memiliki akses ke server**. Karena itu skenario ini menguji **deteksi pasca-kompromi**, bukan cara penyerang masuk. Simulasinya oleh admin pada folder uji `fim-test`.

**Langkah uji.**

```bash
# EC2 App: buat file uji di folder yang dipantau
mkdir -p ~/ecommerce-security/fim-test
FIM_DOC_DIR=$(mktemp -d ~/ecommerce-security/fim-test/doc-XXXXXX)
printf '<h1>Authorized FIM test</h1>\n' > "$FIM_DOC_DIR/index.html"; echo "$FIM_DOC_DIR"

# EC2 App: ubah file (simulasi defacement)
date -Is
printf '<p>DEFACED - authorized test</p>\n' >> "$FIM_DOC_DIR/index.html"

# EC2 Wazuh: alert perubahan
sudo grep -F '/fim-test/doc-' /var/ossec/logs/alerts/alerts.json | tail -n 5
```

**Hasil (pengujian 1 November 2026):** alert **110201** (file baru) pukul 16:11:34 dan **110200** (file diubah) pukul 16:12:02, kurang dari 1 detik setelah perubahan. Alert mencatat ukuran file (29 → 62 byte), hash MD5/SHA1/SHA256 sebelum dan sesudah, serta isi perubahan (diff). Level 12, MITRE T1565.001. Tanpa blokir, karena pelakunya ada di dalam server. Pemulihan dilakukan admin secara manual.

**Kontrol normal.** Setelah cakupan FIM dipersempit (bagian 2.2), `git pull` yang mengubah file di `src` **tidak** memicu alert.

**Batasan.** FIM di host tidak melihat isi kontainer Docker; mitigasi yang bisa disarankan adalah filesystem kontainer read-only (`read_only: true`), belum diterapkan. Kode berbahaya dari rantai pasok tidak tertangkap FIM karena tidak bisa dibedakan dari deploy sah; pertahanan yang tepat adalah review kode dan pengamanan akun GitHub.

---

## Lampiran B — Uji varian VPN (blokir perangkat dan akun)

Dijalankan pada skenario yang memblokir (S01, S03, S04, S05, S08).

1. Setelah terblokir, nyalakan VPN (IP berubah), tunggu ±15 detik.
2. Buka halaman utama dengan **browser yang sama**. **Hasil:** **403** "Akses perangkat ini dibatasi sementara", event `banned_device_request`, alert **110603**. Dashboard **Device & Akun Ban** menandai "IP berubah, kemungkinan VPN".
3. Dengan browser lain atau incognito tanpa login, penyerang lolos (cookie baru). Dengan login ke akun yang sama, ban akun berlaku (403 "Akun dibatasi sementara").
4. Dibandingkan dengan **V1** (hanya blokir IP): penyerang yang ganti IP langsung kembali mengakses.

Versi eksperimen: **V1** = blokir IP saja, **V2** = ditambah ban perangkat dan akun.

---

## Lampiran C — Memeriksa cookie di browser (untuk demo dan penjelasan)

Cookie adalah bukti paling mudah untuk menjelaskan **kenapa VPN di browser yang sama tetap terblokir**. Tunjukkan langsung ke dosen.

### Cara membuka daftar cookie

| Browser | Langkah |
|---|---|
| **Chrome / Edge** | Buka website, tekan **F12**, tab **Application**, menu kiri **Storage → Cookies**, pilih `https://saladinshop.duckdns.org` |
| **Firefox** | Buka website, tekan **F12**, tab **Storage**, menu kiri **Cookies**, pilih domain website |
| Cara cepat (Chrome) | Klik ikon gembok di sebelah alamat → **Cookies and site data** → **Manage on-device site data** |

### Kolom yang perlu dilihat

| Kolom | Arti | Nilai yang diharapkan pada `sv_did` |
|---|---|---|
| **Name** | Nama cookie | `sv_did` (perangkat), `customer_session_token` (sesi login customer), `admin_session_token` (sesi admin) |
| **Value** | Isi cookie | `UUID.tandatangan`, mis. `0e602530-ec94-….DniRtl…` |
| **HttpOnly** | Tidak bisa dibaca JavaScript | Tercentang |
| **Secure** | Hanya dikirim lewat HTTPS | Tercentang |
| **SameSite** | Pembatas pengiriman lintas situs | `Lax` |
| **Expires** | Masa berlaku | Sekitar 30 hari ke depan untuk `sv_did`; sekitar 7 hari untuk sesi login |

Sensor nilai cookie di screenshot untuk laporan. Cookie sesi (`customer_session_token`, `admin_session_token`) adalah kunci masuk akun, **jangan pernah dibagikan**.

### Demo 1: cookie perangkat tetap sama walaupun IP berubah

1. Buka website di Chrome, lihat `sv_did`, **salin 8 karakter pertama** nilainya (hanya untuk perbandingan).
2. Buka `https://ifconfig.me` di tab lain, catat IP (IP-A).
3. Lakukan serangan yang memblokir (mis. S08 XSS). Muat ulang daftar cookie: `sv_did` **tidak berubah**.
4. Nyalakan VPN, buka `https://ifconfig.me`: IP **berubah** (IP-B).
5. Buka website lagi, periksa cookie: `sv_did` **masih sama**, dan website menjawab **403**.

Kesimpulan yang bisa disebut: IP berubah, cookie tidak, dan server mengenali perangkat dari cookie.

### Demo 2: beda browser berarti beda cookie

1. Di Chrome catat 8 karakter pertama `sv_did`.
2. Buka website yang sama di Firefox atau di jendela incognito, lalu lihat cookie-nya: `sv_did` **berbeda**. Browser lain tidak membawa cookie Chrome.
3. Dari browser lain itu (tanpa login), website bisa dibuka lagi, selama IP-nya tidak sedang diblokir. Itulah batasan yang ditulis jujur di skripsi.

### Demo 3: menghapus cookie

1. Di daftar cookie, klik kanan `sv_did` → **Delete**, lalu muat ulang halaman.
2. Muncul `sv_did` **baru dengan nilai berbeda**. Perangkat dianggap baru, sehingga ban perangkat tidak berlaku lagi (kecuali IP-nya masih diblokir atau penyerang login ke akun yang sudah diban).

### Demo 4: `HttpOnly` melindungi cookie dari JavaScript

Di tab **Console** ketik `document.cookie` lalu Enter. `sv_did` dan cookie sesi **tidak muncul** di hasilnya, karena bertanda `HttpOnly`. Artinya, kalaupun ada celah XSS, skrip penyerang tidak bisa membaca cookie tersebut.

### Memeriksa lewat terminal (Kali)

```bash
# Lihat cookie yang dikirim server (nilai jangan dibagikan)
curl -sI https://saladinshop.duckdns.org/ | grep -i '^set-cookie'

# Simpan dan pakai ulang cookie, meniru browser yang sama
curl -s -c /tmp/jar.txt -o /dev/null https://saladinshop.duckdns.org/
cat /tmp/jar.txt
```

Perhatikan baris `sv_did` di `jar.txt`. Tanpa `-b /tmp/jar.txt` pada permintaan berikutnya, `curl` dianggap perangkat baru setiap kali.

### Hubungan dengan dashboard

Halaman **Device & Akun Ban** menampilkan referensi 12 karakter (`subjectRef`), yaitu hash dari ID perangkat, **bukan** isi cookie, sehingga tidak bisa dicocokkan langsung dengan nilai di browser. Cocokkan lewat **waktu** kejadian dan **IP awal**.
