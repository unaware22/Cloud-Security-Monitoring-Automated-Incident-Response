# Panduan Uji S02 (usulan pengganti) — Pemindaian Jalur Sensitif

**Status: usulan.** Di proposal, S02 tertulis "Web defacement/FIM". Mengganti skenario perlu disetujui dosen pembimbing. Bila disetujui, S02 menjadi skenario ini, dan uji FIM (perubahan file di `fim-test`) tetap dipakai sebagai **bukti tambahan 1×** (lihat bagian 7).

Uji hanya pada website penelitian, oleh orang yang Anda izinkan, dengan pemindai yang diarahkan ke website sendiri.

## 1. Mengapa skenario ini dipilih

| Pertimbangan | Penjelasan |
|---|---|
| **Sangat umum** | Bot di internet terus mencoba jalur seperti `/.env`, `/wp-login.php`, `/phpmyadmin`, `/actuator/env`. Website yang baru online biasanya sudah dipindai dalam hitungan jam |
| **Bisa dilakukan orang luar** | Cukup `curl` atau pemindai seperti Nikto atau Gobuster dari Kali. Tidak butuh akses ke server |
| **Mudah didemokan** | Alert, notifikasi Telegram, dan blokir IP muncul dalam hitungan detik di depan penguji |
| **Sudah didukung sistem** | Middleware dan Nginx sudah menolak jalur ini (404) dan mencatatnya sebagai `sensitive_path_scan` |
| **Tahap awal serangan nyata** | Pemindaian (*reconnaissance*) biasanya mendahului serangan lain. Memutusnya di tahap ini mencegah serangan berikutnya |

Rujukan yang bisa dicek: MITRE ATT&CK T1595.003 (*Active Scanning: Wordlist Scanning*) dan OWASP Top 10 2021 A05 (*Security Misconfiguration*).

## 2. Ringkasan

| | |
|---|---|
| **Serangan** | Mencoba banyak jalur yang umum menyimpan file sensitif atau panel admin untuk mencari yang terbuka |
| **Pencegahan** | Nginx menolak `/.env`, `/.git`, `/.aws`, `/wp-admin`, `/phpmyadmin`, `/pma`, `backup.*` (404). Middleware aplikasi menolak jalur sensitif lain (404), misalnya `/wp-login`, `/adminer`, `/actuator`, `/cgi-bin`, `/config.json`, `/db_backup`, `/telescope` |
| **Respons** | Satu percobaan: **alert saja**. Berulang (5 jalur dalam 60 detik dari IP yang sama): **blokir IP 30 menit** |
| **Event / rule** | `sensitive_path_scan` → **110130** (satu kejadian), **110131** (berulang) |
| **Varian inti (10×)** | Pemindaian 8 jalur dengan `curl` |
| **Demo (1×)** | Pemindai otomatis (Nikto atau Gobuster) oleh teman |

Alasan satu kali tidak langsung diblokir: manusia bisa salah mengetik atau membuka tautan lama, sedangkan pemindai selalu mencoba banyak jalur sekaligus.

## 3. Konfigurasi sekali

**EC2 App** — deploy kode terbaru (pull, build, recreate). Penting: perbaikan relay middleware (commit `e3d11df` ke atas) harus sudah aktif, karena event ini dikirim lewat relay.

**EC2 Wazuh** — cek dulu ID belum dipakai, lalu tambahkan (backup dulu):

```bash
sudo grep -R -n 'id="11013[01]"' /var/ossec/etc/rules
sudo cp /var/ossec/etc/rules/saladinshop_rules.xml /var/ossec/etc/rules/saladinshop_rules.xml.backup-s02
sudo nano /var/ossec/etc/rules/saladinshop_rules.xml
```

```xml
<group name="saladinshop,web_security,recon,">
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
</group>
```

Tambahkan **`110131`** ke `<rules_id>` blok Active Response ber-timeout **1800**, dan `110130,110131` ke `<rule_id>` blok `<integration>`:

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup-s02
sudo nano /var/ossec/etc/ossec.conf
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
sudo systemctl is-active wazuh-manager
```

**n8n (workflow pertama)** — output Switch `110130 — Path Probe` dan `110131 — Repeated Path Scan` → Send a text message.

## 4. Varian inti — Pemindaian 8 jalur (dijalankan 10×)

Dari **Kali**. Delapan jalur berikut dipilih karena ditangani middleware aplikasi, sehingga event tercatat:

```bash
for p in /wp-login.php /adminer /actuator/env /cgi-bin/test /config.json /db_backup.sql /telescope /debug/default/view; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "https://saladinshop.duckdns.org$p"
  sleep 1
done
curl -s -o /dev/null -w "Halaman utama setelah pemindaian -> %{http_code}\n" https://saladinshop.duckdns.org/
```

**Hasil yang diharapkan:**
- Jalur ke-1 sampai ke-4: **404**, tiap jalur menghasilkan alert 110130.
- Setelah jalur ke-5 (dalam 60 detik): alert **110131** dan blokir IP, sehingga jalur berikutnya dan halaman utama dijawab **403** dari Nginx.

**ADMIN:**

```bash
# EC2 App
grep -c '"event_type":"sensitive_path_scan"' ~/ecommerce-security/runtime-logs/security_events.log
grep -F '"event_type":"sensitive_path_scan"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 3 | cut -c1-220
read -r -p "IP penguji: " IP_UJI
sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
# EC2 Wazuh
sudo grep -E '"id":"11013[01]"' /var/ossec/logs/alerts/alerts.json | tail -n 3 | cut -c1-220
```

Periksa juga Telegram dan dashboard admin (Security Events dan IP Response).

**Pengulangan:** tunggu blokir berakhir sendiri (30 menit, `wazuh:auto-expire`) atau pakai IP lain di antara percobaan. Jangan membuka blokir manual saat timer masih berjalan.

> Jalur seperti `/.env` atau `/wp-admin` ditolak oleh Nginx sebelum sampai ke aplikasi, sehingga tidak menghasilkan event aplikasi (hanya tercatat di log Nginx). Karena itu varian inti memakai jalur yang ditangani middleware.

## 5. Demo — Pemindai otomatis oleh teman (1×)

Teman Anda menjalankan pemindai ke website **milik Anda dengan izin Anda**:

```bash
# Gobuster (kecepatan dibatasi supaya tidak tertahan pembatas request Nginx)
gobuster dir -u https://saladinshop.duckdns.org -w /usr/share/wordlists/dirb/common.txt -t 5

# atau Nikto
nikto -h https://saladinshop.duckdns.org
```

Opsi dapat berbeda antarversi; cek `--help`. Pembatas Nginx (30 request per detik, burst 50) dapat menjawab 503 bila pemindai terlalu cepat, dan itu juga bagian dari pertahanan.

**Yang diamati bersama:** dalam beberapa detik muncul alert di Wazuh, pesan di Telegram, dan pemindai mulai menerima **403** karena IP-nya diblokir. Inilah tampilan yang paling meyakinkan untuk demo di depan dosen.

## 6. Kontrol normal (false positive)

- Pelanggan membuka halaman utama, produk, login, dan checkout seperti biasa: **tanpa** event.
- Satu kali salah ketik alamat biasa (mis. `/produk-tidak-ada`) menghasilkan 404 biasa dan **bukan** `sensitive_path_scan`.
- Satu jalur sensitif saja (mis. hanya `/wp-login.php`): alert **110130**, **tanpa** blokir.

## 7. Bukti tambahan (1×) — Perubahan file tanpa izin (FIM)

Untuk menunjukkan kemampuan FIM Wazuh, tetap jalankan uji dari panduan 15 bagian S02 (ubah file di `fim-test`, alert 110200 dalam kurang dari 1 detik, lengkap dengan hash dan diff). Tulis sebagai skenario pasca-kompromi (penyerang yang sudah punya akses), bukan sebagai serangan dari luar.

## 8. Bukti untuk laporan

Output `curl` 404 lalu 403 · event `sensitive_path_scan` · alert 110130 dan 110131 · Telegram · `deny` di Nginx · hasil Gobuster/Nikto saat diblokir · halaman IP Response.

## 9. Batasan

- Pemindai yang memakai banyak IP atau bergantian lambat (satu jalur per beberapa menit) tidak mencapai ambang 5 dalam 60 detik.
- Deteksi hanya mencakup daftar jalur di middleware dan Nginx; jalur sensitif lain yang tidak ada di daftar tidak tercatat.
- Ban perangkat (cookie) berlaku pada event ini, tetapi pemindai biasanya tidak menyimpan cookie, sehingga yang efektif adalah blokir IP.
- Pemindaian adalah tahap pengintaian. Menolaknya tidak membuktikan website bebas celah.
