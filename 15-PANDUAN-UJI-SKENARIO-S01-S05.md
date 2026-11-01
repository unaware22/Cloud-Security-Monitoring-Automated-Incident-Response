# Panduan Uji Skenario S01–S05 (yang sudah siap diuji)

Panduan ini menggabungkan langkah yang tersebar di minggu 3, 5, 7, 9, dan 10 (`13-PANDUAN-DOKUMENTASI-MINGGU-1-5.md`) menjadi **satu alur uji end-to-end per skenario**: serangan → respons aplikasi → event log → alert Wazuh → Telegram → respons (blokir) → pemulihan. Ditambah varian ganti IP/VPN dari `14-PANDUAN-DEVICE-ACCOUNT-BAN.md`.

## Status kesiapan 10 skenario

| ID | Skenario | Status | Dasar |
|---|---|---|---|
| S01 | SQL injection | **Siap** | Minggu 3 + 5 + 7 |
| S02 | Web defacement/FIM | **Siap** (deteksi + notifikasi; tidak ada blokir/pemulihan otomatis) | Minggu 3 + 4 |
| S03 | Brute force customer & admin | **Siap** | Minggu 9 |
| S04 | Credential stuffing | **Siap** | Minggu 9 |
| S05 | BOLA / akses pesanan tanpa hak | **Siap** | Minggu 10 |
| S06 | Bot, fake order, checkout abuse | Sebagian — kontrol aplikasi (429, batas pending) sudah, jalur Wazuh/n8n (rule 110510) belum tervalidasi | Minggu 11.7 |
| S07 | Voucher abuse | Belum — event ada di kode, rule/alur belum didokumentasikan | — |
| S08 | XSS | Belum didokumentasikan (deteksi `xss_attempt` sudah ada di kode) | — |
| S09 | Manipulasi webhook pembayaran | Belum didokumentasikan (event `invalid_payment_callback` ada) | — |
| S10 | Forgot/reset & enumeration | Belum didokumentasikan | — |

## A. Persiapan umum (lakukan sekali sebelum seri uji)

**Peran:**
- **PENGUJI** — laptop/HP teman atau perangkat Anda sendiri di jaringan uji (IP publik, bukan Tailscale). Satu browser khusus uji.
- **ADMIN** — Anda, akses dashboard admin, SSH ke APP (EC2 aplikasi) dan WAZUH lewat Tailscale.

**Cek awal:**

```bash
# APP
cd ~/ecommerce-security
git log --oneline -1                      # catat versi kode (versi eksperimen)
sudo docker compose -f docker-compose.aws.yml ps
sudo systemctl is-active nginx wazuh-agent

# WAZUH
sudo systemctl is-active wazuh-manager
sudo /var/ossec/bin/agent_control -l     # agent aplikasi Active
```

Pastikan n8n di homelab aktif dan workflow alert dalam kondisi Active.

**Lembar pencatatan** (satu baris per percobaan, simpan di spreadsheet):

| Test ID | Skenario | Varian | Waktu | IP penguji | request_id | HTTP | Event aplikasi | Rule Wazuh | Telegram | Blokir (IP/device/akun) | Akses penguji setelahnya | Catatan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Contoh Test ID: `S01-V2-03` = SQLi, versi konfigurasi 2 (dengan device ban), percobaan ke-3.

**Reset kondisi sebelum setiap percobaan** (agar percobaan berikutnya tidak tertahan blokir sebelumnya):
1. Dashboard admin → **IP Response** → Unblock IP penguji (bila terblokir).
2. Dashboard admin → **Device & Akun Ban** → **Buka** semua ban milik penguji.
3. Tunggu ±15 detik, pastikan penguji bisa membuka halaman utama (200).
4. Untuk S03/S04/S05: tunggu jendela deteksi selesai (10 menit) atau gunakan akun/email uji baru, karena hitungan detektor masih tersimpan di memori aplikasi.

**Traffic normal (kontrol false positive)** — di setiap skenario jalankan juga aktivitas wajar di endpoint yang sama (contoh di tiap bagian). Hasil yang benar: tidak ada alert, tidak ada blokir.

---

## S01 — SQL injection

**Rule terkait:** 110100 (SQLi, Active Response blokir IP **tanpa timeout** — dibuka manual), 110601/110603 (device ban & IP baru).

### Langkah

1. PENGUJI mencatat IP dan memastikan akses normal:

   ```bash
   date -Is
   curl -4 -s https://checkip.amazonaws.com
   curl -sI https://saladinshop.duckdns.org/ | head -1
   ```

   Atau buka `https://ifconfig.me` dan halaman utama di browser uji (cookie perangkat terpasang).

2. PENGUJI mengirim serangan (pilih salah satu, catat yang dipakai):

   ```bash
   curl -i --get --data-urlencode "search=' OR 1=1 --" \
     https://saladinshop.duckdns.org/api/products
   ```

   Lewat browser (untuk varian device ban, harus browser yang sama dengan langkah 1):
   `https://saladinshop.duckdns.org/products?q=1 UNION SELECT password FROM users`

   **Hasil yang diharapkan:** HTTP 400, pesan input ditolak, catat `x-request-id`.

3. ADMIN di APP — event aplikasi:

   ```bash
   sudo grep -E '"event_type":"(sql_injection_attempt|device_banned)"' \
     ~/ecommerce-security/runtime-logs/security_events.log | tail -n 4
   ```

4. ADMIN di WAZUH — alert:

   ```bash
   sudo grep -F '"id":"110100"' /var/ossec/logs/alerts/alerts.json | tail -n 2
   ```

   Dashboard Wazuh: filter `rule.id: 110100`, cocokkan IP dan request_id.

5. Telegram: pesan alert SQLi masuk. n8n → Executions: alur sampai node Telegram.

6. Respons — APP:

   ```bash
   read -r -p "IP penguji: " IP_UJI
   sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
   sudo grep -F -- "$IP_UJI" /var/ossec/logs/saladinshop-active-response.log | tail -n 3
   ```

7. PENGUJI mencoba membuka halaman utama → **403 Forbidden** (diblokir Nginx).

8. Dashboard admin: **IP Response** menampilkan IP penguji (mode permanen/manual), **Security Events** menampilkan `sql_injection_attempt`, **Device & Akun Ban** menampilkan perangkat penguji.

### Varian VPN (V2)

9. PENGUJI nyalakan VPN (IP baru), tunggu 15 detik, buka halaman utama **dengan browser yang sama** → **403** "Akses perangkat ini dibatasi sementara".
10. ADMIN: Device & Akun Ban menandai "IP berubah — kemungkinan VPN"; Wazuh alert **110603** dengan IP VPN (dan IP VPN ikut di-deny bila 110603 sudah ditambahkan ke Active Response).

### Pemulihan

11. ADMIN: Unblock IP di IP Response + Buka ban di Device & Akun Ban → penguji kembali 200.

### Kontrol normal

Cari produk biasa: `/api/products?search=diamond` → 200, tidak ada event/alert.

**Screenshot:** request + 400, event log, alert 110100, Telegram, deny/log AR, 403 penguji, 403 setelah VPN, IP Response & Device Ban, akses pulih.

---

## S02 — Web defacement / FIM

**Rule terkait:** 550 (bawaan, file berubah), 110200 (custom). Penyerangnya disimulasikan dari dalam server (file uji), jadi **tidak ada blokir IP/device** — yang diuji deteksi dan notifikasi.

### Langkah

1. ADMIN di APP — buat file uji di folder yang dipantau:

   ```bash
   mkdir -p ~/ecommerce-security/fim-test
   FIM_DOC_DIR=$(mktemp -d ~/ecommerce-security/fim-test/doc-XXXXXX)
   printf '<h1>Authorized FIM test</h1>\n' > "$FIM_DOC_DIR/index.html"
   echo "$FIM_DOC_DIR"
   ```

2. WAZUH — tunggu file baru dikenali:

   ```bash
   sudo grep -F '/fim-test/doc-' /var/ossec/logs/alerts/alerts.json | tail -n 3
   ```

3. APP — ubah file (simulasi defacement):

   ```bash
   date -Is
   printf '<p>DEFACED - authorized test</p>\n' >> "$FIM_DOC_DIR/index.html"
   ```

4. WAZUH — alert perubahan: lokasi file, `modified`, hash lama vs baru, rule 550/110200.

   ```bash
   sudo grep -F '/fim-test/doc-' /var/ossec/logs/alerts/alerts.json | tail -n 5
   ```

5. Telegram/n8n: notifikasi FIM masuk.

6. Pemulihan manual (catat sebagai langkah admin, bukan otomatis):

   ```bash
   printf '<h1>Authorized FIM test</h1>\n' > "$FIM_DOC_DIR/index.html"
   ```

### Kontrol normal

Perubahan sah (mis. blocklist Nginx oleh script respons) tidak boleh memicu alert defacement — sudah dikecualikan pada rule FIM.

**Screenshot:** isi file sebelum/sesudah, alert dengan hash berubah, Telegram, pemulihan.

---

## S03 — Brute force (customer dan admin)

**Rule terkait:** 110401 (customer), 110411 (admin), Active Response blokir sementara **1800 detik**.

### S03a — Customer

1. Siapkan akun uji customer terverifikasi (password diketahui).
2. PENGUJI di browser, halaman login: masukkan **email akun uji + password salah**, selesaikan CAPTCHA tiap kali. Ulangi sampai **5 kali** atau sampai ditolak. Catat status tiap percobaan (401, lalu 429).
   > CAPTCHA gagal = menguji jalur bot, bukan brute force. Jangan dihitung.
3. APP:

   ```bash
   sudo grep -E 'user_login_failed|user_bruteforce_attempt|device_banned' \
     ~/ecommerce-security/runtime-logs/security_events.log | tail -n 10
   ```

4. WAZUH: alert **110401**; Telegram masuk.
5. Respons: deny IP di Nginx (langkah 6 S01), penguji 403, IP Response menampilkan blokir **sementara** dengan hitung mundur 30 menit.
6. Varian VPN: ganti VPN dengan browser sama → 403 (device ban). Catatan: akun korban **tidak** diban, pemilik sah tetap bisa login dari perangkat lain.
7. Pemulihan: tunggu 30 menit (auto-unblock `wazuh:auto-expire`) **atau** unblock manual; catat cara yang dipakai.

### S03b — Admin

Sama seperti di atas pada `/admin/login` dengan akun admin uji dan password salah. Rule yang dicari **110411**. Jangan melakukan ini dari jaringan/Tailscale yang Anda pakai untuk administrasi.

### Kontrol normal

Login salah 1–2 kali lalu login benar → berhasil, tidak ada alert 110401.

**Screenshot:** 5 percobaan + status, event, alert 110401/110411, Telegram, deny + 403, IP Response sementara, pemulihan.

---

## S04 — Credential stuffing

**Rule terkait:** 110420, Active Response sementara 1800 detik.

1. Mulai dari jendela bersih (10 menit sejak uji login terakhir dari IP yang sama).
2. PENGUJI di form login: **5 email uji berbeda** (format valid, boleh tidak terdaftar, bukan email orang lain) dengan password salah, CAPTCHA diselesaikan tiap kali.
3. APP:

   ```bash
   sudo grep -F 'credential_stuffing_attempt' \
     ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3
   ```

   Cari `distinct_accounts=5`.
4. WAZUH: alert **110420**, Telegram, deny IP, IP Response sementara.
5. PENGUJI → 403. Varian VPN → tetap 403 di browser sama (device ban).
6. Pemulihan seperti S03.

### Kontrol normal

Satu pengguna salah ketik email lalu benar (≤2 email berbeda) → tidak ada alert.

**Batas klaim:** pola dihitung per IP sumber; penyerang yang memutar IP **dan** perangkat (cookie baru) tiap percobaan tidak dijamin terdeteksi.

---

## S05 — BOLA / akses pesanan akun lain

**Rule terkait:** 110500 (satu akses ditolak), 110501 (berulang dari IP sama → blokir sementara). Aplikasi: device + akun penyerang diban setelah 3 kali dalam 10 menit.

1. Siapkan **akun A** (punya pesanan sandbox, catat kode pesanan + email penerima) dan **akun B** (penyerang), di profil browser berbeda.
2. Kontrol normal: A membuka detail pesanannya → 200; riwayat B tidak memuat pesanan A.
3. PENGUJI login sebagai B, buka Console (F12) di domain website, jalankan:

   ```javascript
   (async () => {
     const orderCodeA = 'GANTI_DENGAN_KODE_PESANAN_A';
     for (let attempt = 1; attempt <= 5; attempt += 1) {
       const r = await fetch('/api/user/orders/' + encodeURIComponent(orderCodeA),
         { credentials: 'same-origin', cache: 'no-store' });
       console.log({ attempt, status: r.status,
         requestId: r.headers.get('x-request-id'), time: new Date().toISOString() });
       if (r.status !== 404) break;
       await new Promise(res => setTimeout(res, 1500));
     }
   })();
   ```

   **Hasil yang diharapkan:** 404 tanpa data pesanan A; setelah ambang, request berikutnya 401/403 (sesi B dicabut / perangkat diban / IP diblokir — catat mana yang terjadi lebih dulu).
4. APP:

   ```bash
   sudo grep -E 'unauthorized_object_access_attempt|device_banned|account_banned' \
     ~/ecommerce-security/runtime-logs/security_events.log | tail -n 8
   ```

5. WAZUH: alert **110500** per percobaan, **110501** saat ambang; Telegram; deny IP; IP Response sementara.
6. Varian VPN + akun: B nyalakan VPN, buka **incognito**, login sebagai B → **403 "Akun ini dibatasi sementara"** (event `banned_account_request`).
7. (Opsional) Jalur lain dengan kode + email A yang benar dari sesi B: `/api/orders/check`, `/api/orders/verify-payment`, `/api/orders/cancel` → semua 404, pesanan A tidak berubah (script di minggu 10.4).
8. Pemulihan: unblock IP, Buka ban perangkat + akun B. Setelah pulih, B **tetap** tidak bisa melihat pesanan A (404).

### Kontrol normal

Salah ketik kode pesanan **1 kali** dari akun sendiri → 404 biasa, tidak ada ban (ambang 3).

**Screenshot:** pesanan A normal, Console B (404 + request_id), event + alert 110500/110501, Telegram, deny + 403, Device & Akun Ban (perangkat + akun B), login B ditolak dari VPN/incognito, pemulihan dan 404 tetap berlaku.

---

## B. Setelah seri uji

- Ulangi tiap skenario **minimal 10 kali** dengan konfigurasi yang sama (proposal 3.2.8) dan **10 kali traffic normal**.
- Hitung per skenario: deteksi benar (TP), traffic normal yang ter-alert (FP), serangan lolos (FN), waktu dari serangan → alert → Telegram → blokir (ambil dari timestamp log).
- Jika rule/kode diubah di tengah seri, mulai versi eksperimen baru (V1 = blokir IP saja, V2 = + device/akun ban).
- Hapus file uji FIM dan batalkan pesanan sandbox uji setelah selesai.
