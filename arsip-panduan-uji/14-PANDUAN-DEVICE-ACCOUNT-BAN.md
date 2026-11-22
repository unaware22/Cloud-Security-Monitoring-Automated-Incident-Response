# Panduan Deploy dan Uji Device & Account Ban (anti-ganti-IP/VPN)

Branch: `codex/homelab-staging`. Uji hanya sistem milik penelitian, memakai akun uji sendiri, dan lakukan dengan izin penguji (teman yang membantu).

## 0. Ringkasan perubahan

Blokir IP di Nginx tidak menghentikan pelaku yang berganti IP (VPN). Lapisan baru menambahkan **pembatasan sementara 30 menit (60 menit bila mengulang dalam 24 jam)** yang menempel pada:

| Lapisan | Identitas | Kapan dipasang |
|---|---|---|
| Perangkat | Cookie `sv_did` (UUID + HMAC-SHA256, HttpOnly) yang dipasang middleware pada kunjungan pertama | Setiap event serangan (SQLi, XSS, scan path sensitif, brute force, credential stuffing, BOLA, checkout/voucher abuse, dll.) |
| Akun customer | Akun yang **sedang login** saat menyerang | Event yang dilakukan dari akun sendiri (BOLA, checkout/voucher abuse, SQLi saat login). Sesi dicabut, login ditolak sampai ban berakhir |

- Brute force / credential stuffing / account takeover **hanya mem-ban perangkat**, bukan akun target, agar korban tidak ikut terkunci.
- Akses pesanan orang lain (BOLA) baru mem-ban setelah **3 kali dalam 10 menit**, agar salah ketik kode pesanan sekali tidak menghukum pelanggan.
- Semua log keamanan kini memuat `device_ref` (hash pendek, bukan isi cookie), sehingga Wazuh dapat menghubungkan serangan dari beberapa IP yang berasal dari perangkat sama.

Alur:

```text
Serangan dari IP A ──> event (sql_injection_attempt, dst.) ──> security_events.log ──> Wazuh (rule lama: blokir IP A)
                   └─> tabel security_penalties: device (+ akun) diban 30 menit ──> event device_banned / account_banned

Pelaku ganti ke VPN (IP B), browser sama ──> middleware membaca sv_did ──> 403
                   └─> event banned_device_request (IP B) ──> Wazuh rule 110603 ──> (opsional) Active Response blokir IP B
```

Event baru di `security_events.log`:

| event_type | Arti |
|---|---|
| `device_banned` | Perangkat diban; `payload_snippet` berisi `subject_ref`, pemicu, strike, durasi |
| `account_banned` | Akun customer diban |
| `banned_device_request` | Perangkat yang sedang diban mencoba akses lagi (maks. 1 log/menit/perangkat) — indikasi ganti IP/VPN |
| `banned_account_request` | Login ke akun yang sedang diban |
| `penalty_lifted` | Admin membuka ban dari dashboard |

Migrasi baru: `20261018000000_add_security_penalties` (tabel `security_penalties`). Tidak ada perubahan pada n8n, Nginx, atau script Active Response.

## 1. Deploy di EC2 aplikasi

SSH melalui Tailscale seperti biasa.

### 1.1 Pastikan relay token ada di `.env`

Middleware memakai `SECURITY_EVENT_RELAY_TOKEN` untuk bertanya ke endpoint internal apakah perangkat sedang diban. **Tanpa token ini, pengecekan ban diam-diam tidak aktif.**

```bash
cd ~/ecommerce-security
grep -c '^SECURITY_EVENT_RELAY_TOKEN=' .env
```

- Hasil `1`: sudah ada, lanjut ke 1.2. Jangan tampilkan nilainya.
- Hasil `0`: tambahkan token acak (nilai tidak ditampilkan di layar):

```bash
cp .env .env.backup-device-ban
printf '\nSECURITY_EVENT_RELAY_TOKEN="%s"\n' "$(openssl rand -hex 24)" >> .env
grep -c '^SECURITY_EVENT_RELAY_TOKEN=' .env
```

Variabel opsional (default sudah sesuai, tidak wajib ditambahkan):

| Variabel | Default | Fungsi |
|---|---|---|
| `DEVICE_COOKIE_SECRET` | memakai `CUSTOMER_JWT_SECRET` | Kunci HMAC cookie perangkat (min. 32 karakter) |
| `DEVICE_BAN_ENABLED` | `true` | `false` untuk mematikan fitur |
| `DEVICE_BAN_BASE_MINUTES` | `30` | Lama ban pertama |
| `DEVICE_BAN_REPEAT_MINUTES` | `60` | Lama ban bila mengulang dalam 24 jam |
| `DEVICE_BAN_ALLOW_PRIVATE_IP` | `false` | **Jangan diisi di AWS.** Hanya untuk uji lokal/LAN |

### 1.2 Pull, build, dan jalankan ulang

```bash
cd ~/ecommerce-security
git status --short
git pull --ff-only origin codex/homelab-staging
sudo docker compose -f docker-compose.aws.yml build app
sudo docker compose -f docker-compose.aws.yml up -d --force-recreate app order-expiry-worker
sudo docker compose -f docker-compose.aws.yml logs --tail=60 app
```

Jika `git status` memperlihatkan perubahan pada file yang akan diperbarui atau pull gagal, jangan memakai `reset --hard`; simpan perubahan tersebut terlebih dahulu.

Migrasi ke RDS berjalan otomatis saat container start (`npx prisma migrate deploy` pada `CMD` Dockerfile). Pada log, cari baris `20261018000000_add_security_penalties` atau `No pending migrations to apply`. Jika ada error migrasi, hentikan uji dan catat pesan errornya.

### 1.3 Verifikasi cepat

```bash
# Cookie perangkat dipasang (ganti dengan domain/URL yang biasa dipakai)
curl -sI https://DOMAIN-ANDA/ | grep -i 'set-cookie: sv_did'

# Status migrasi dari dalam container
sudo docker compose -f docker-compose.aws.yml exec app npx prisma migrate status
```

Hasil yang dicari: header `set-cookie: sv_did=...; HttpOnly` muncul, dan migrate status menyatakan `Database schema is up to date!`.

Login dashboard admin → menu baru **Device & Akun Ban** harus terbuka tanpa error (masih kosong).

> [Screenshot: log migrasi, header set-cookie sv_did (sensor nilai cookie), halaman Device & Akun Ban kosong.]

## 2. Konfigurasi di EC2 Wazuh

### 2.1 Tambahkan rule

Pastikan ID belum dipakai, lalu backup:

```bash
sudo grep -R -n 'id="11060[0-3]"' /var/ossec/etc/rules
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml \
  /var/ossec/etc/rules/saladinshop_rules.xml.backup-device-ban
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

Tambahkan blok berikut **setelah grup terakhir yang sudah ditutup**. Jangan hapus rule yang sudah ada.

```xml
<group name="saladinshop,web_security,device_ban,">
  <rule id="110601" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^device_banned$</field>
    <description>SALADINSHOP: Device temporarily banned after attack from $(ip_address)</description>
    <group>active_response_app,device_ban,</group>
  </rule>

  <rule id="110602" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^account_banned$</field>
    <description>SALADINSHOP: Customer account temporarily banned after attack from $(ip_address)</description>
    <group>active_response_app,account_ban,</group>
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

Validasi dan restart:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t
echo "analysisd exit code: $?"
sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

Uji rule dengan contoh log (tanpa menyerang):

```bash
sudo /var/ossec/bin/wazuh-logtest
```

Tempel satu baris ini, lalu tekan Enter. Hasil yang dicari: `id: '110603'`.

```json
{"event_type":"banned_device_request","severity":"medium","ip_address":"203.0.113.50","method":"GET","endpoint":"/","user_agent":"test","payload_snippet":"device_banned_until=2026-10-18T12:00:00.000Z","status_code":403,"request_id":"req-logtest","created_at":"2026-10-18T11:30:00.000Z","device_ref":"abc123def456"}
```

Keluar dengan Ctrl+C.

> [Screenshot: blok rule, analysisd exit code 0, wazuh-logtest menunjukkan rule 110603.]

### 2.2 (Disarankan) Blokir juga IP VPN yang baru

Agar IP VPN baru ikut masuk deny list Nginx selama 30 menit, tambahkan `110603` ke **blok Active Response yang memakai timeout 1800** (bukan blok SQL yang manual). Contoh sebelum → sesudah:

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-device-ban
sudo nano /var/ossec/etc/ossec.conf
```

```xml
<!-- sebelum -->
<rules_id>110401,110411,110420,110421,110501</rules_id>
<!-- sesudah -->
<rules_id>110401,110411,110420,110421,110501,110603</rules_id>
```

Pertahankan isi lain seperti yang sudah aktif. Lalu:

```bash
sudo /var/ossec/bin/wazuh-analysisd -t
sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

Jangan tambahkan `110601`/`110602` ke Active Response: IP pada event itu sudah diblokir oleh rule pemicunya, sehingga hanya menghasilkan aksi ganda.

### 2.3 (Opsional) Notifikasi Telegram via n8n

Jika integrasi n8n memakai `<rule_id>` tertentu, tambahkan `110601,110602,110603` pada blok `<integration>` yang sama, lalu tambahkan cabang Switch di n8n untuk `event_type` baru. Ini hanya notifikasi; ban tetap dijalankan oleh aplikasi.

## 3. Skenario uji VPN (bersama penguji)

Persiapan:
- **PENGUJI**: laptop/HP teman, satu browser (mis. Chrome), aplikasi VPN, WiFi yang sama seperti sebelumnya.
- **ADMIN**: dashboard admin dibuka dari jaringan/Tailscale Anda sendiri, bukan dari perangkat penguji.
- Catat waktu tiap langkah dan cek IP publik penguji (mis. buka `https://ifconfig.me`) sebelum dan sesudah VPN.

### Skenario A — Serangan, lalu ganti IP dengan VPN (perangkat yang sama)

1. PENGUJI tanpa VPN (IP A) membuka halaman utama website sekali (cookie `sv_did` terpasang).
2. PENGUJI membuka URL uji SQLi:
   `https://DOMAIN-ANDA/products?q=1 UNION SELECT password FROM users`
   Hasil: 400. Rule SQL lama memblokir IP A di Nginx.
3. ADMIN: menu **Device & Akun Ban** menampilkan 1 perangkat, pemicu `sql_injection_attempt`, IP awal = IP A, sisa ±30 menit. Menu IP Response menampilkan IP A terblokir.
4. PENGUJI menyalakan VPN (IP B), tunggu ±15 detik, lalu buka halaman utama dengan **browser yang sama**.
   Hasil yang diharapkan: **403** dengan pesan "Akses perangkat ini dibatasi sementara…".
5. ADMIN: kolom "IP Terakhir Ditolak" = IP B dengan tanda **"IP berubah — kemungkinan VPN"**, jumlah ditolak bertambah. Wazuh menampilkan alert **110603** dengan IP B. Jika 2.2 diterapkan, IP B juga masuk deny Nginx.
6. PENGUJI ganti server VPN lagi (IP C) → tetap 403.

Cek di APP:

```bash
cd ~/ecommerce-security
sudo grep -E '"event_type":"(sql_injection_attempt|device_banned|banned_device_request)"' \
  runtime-logs/security_events.log | tail -n 5
```

> [Screenshot: (a) 400 SQLi dari IP A, (b) 403 dari IP B dengan browser sama, (c) halaman Device & Akun Ban dengan "IP berubah", (d) alert 110603 di Wazuh, (e) baris log di atas.]

### Skenario B — Ban akun (pelaku login)

1. Siapkan akun uji A (punya pesanan) dan akun uji B (milik penguji). Catat satu kode pesanan akun A.
2. PENGUJI login sebagai akun B, lalu mencoba membuka detail pesanan akun A **3 kali** dalam 10 menit (endpoint riwayat pesanan / `/api/user/orders/KODE-A`).
3. Hasil: event `unauthorized_object_access_attempt` ×3, lalu `device_banned` dan `account_banned`. Sesi akun B langsung keluar.
4. PENGUJI menyalakan VPN **dan** membuka jendela incognito/browser lain (perangkat dianggap baru), lalu login sebagai akun B.
   Hasil yang diharapkan: **403** "Akun ini dibatasi sementara…" dan event `banned_account_request`.
5. ADMIN: Device & Akun Ban menampilkan baris jenis **Akun** dengan email akun B.

> [Screenshot: tiga percobaan ditolak, baris Akun di dashboard, login akun B ditolak dari IP/browser baru.]

### Skenario C — Kontrol (tidak boleh terkena dampak)

- Perangkat lain di jaringan berbeda yang tidak menyerang tetap bisa membuka website (200).
- Akun A (korban) tetap bisa login dan melihat pesanannya.
- Salah ketik kode pesanan **1 kali** tidak menimbulkan ban.

### Skenario D — Pembukaan

1. **Manual**: ADMIN klik **Buka** pada baris ban → event `penalty_lifted`. Dalam ±10 detik perangkat penguji dapat mengakses lagi (selama IP-nya tidak sedang di deny Nginx; buka IP lewat IP Response bila perlu).
2. **Otomatis**: biarkan ban lain berjalan 30 menit tanpa restart container → status berubah "Berakhir" dan akses pulih. Catat durasi sebenarnya.

> [Screenshot: tombol Buka/riwayat "Dibuka admin", dan riwayat "Berakhir" setelah timeout.]

## 4. Troubleshooting

| Gejala | Penyebab umum | Pemeriksaan |
|---|---|---|
| Tidak ada `set-cookie: sv_did` | Secret HMAC kosong/terlalu pendek | `CUSTOMER_JWT_SECRET` atau `DEVICE_COOKIE_SECRET` ≥ 32 karakter |
| Ban tercatat tetapi IP baru tetap 200 | `SECURITY_EVENT_RELAY_TOKEN` kosong/<32 karakter, atau belum lewat cache 10 detik | Langkah 1.1; tunggu 15 detik lalu ulangi |
| Tidak ada baris di Device & Akun Ban | Event dari IP private/Tailscale (sengaja diabaikan), atau migrasi belum jalan | Uji dari IP publik penguji; `prisma migrate status` |
| Alert 110603 tidak muncul | Rule belum dimuat atau log tidak terbaca agent | `wazuh-analysisd -t`, `wazuh-logtest`, cek `security_events.log` di APP |
| Payload `' OR 1=1--` dari address bar tidak terdeteksi | Middleware memeriksa query string yang masih ter-encode; payload `UNION SELECT` terdeteksi | Gunakan payload pada skenario A. Ini keterbatasan deteksi yang sudah ada sebelumnya |

## 5. Keterbatasan (untuk bab pembahasan)

- Server tidak dapat melihat IP asli di balik VPN; yang dikenali adalah **perangkat** (cookie) dan **akun**, bukan jaringan WiFi.
- Menghapus cookie, mode incognito, atau browser lain membuat perangkat dianggap baru. Lapisan akun menutup celah ini bila pelaku login; IP baru tetap dapat diblokir Wazuh (bagian 2.2) begitu pelaku menyerang lagi.
- Ban di middleware memakai cache ±10 detik per proses, sehingga berlaku penuh beberapa detik setelah dibuat.
- Pengecekan bersifat fail-open: jika database/endpoint internal gagal, pelanggan sah tidak dikunci.
- Ban hanya berlaku untuk event dari IP publik; IP private, loopback, dan Tailscale dikecualikan agar akses administrator tidak terkunci.
