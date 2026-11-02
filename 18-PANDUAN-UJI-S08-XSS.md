# Panduan Uji S08 — Cross-Site Scripting (XSS)

Uji hanya pada website penelitian dengan **penanda uji yang tidak berbahaya** (mis. `alert(1)`, teks tebal). Jangan memakai payload yang mencuri cookie atau menghubungi server luar. Kerangka: [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

## 0. Apa yang diuji dan kebijakan responsnya

XSS terjadi bila input pengguna tampil kembali di halaman sebagai **kode** yang dijalankan browser, bukan sebagai teks. Website memiliki **dua lapis** perlindungan:

| Lapis | Cara kerja | Perannya |
|---|---|---|
| **1. Deteksi pola (WAF aplikasi)** | Regex di middleware (query URL) dan di API (pencarian, register, login, lupa/reset password, checkout) menolak `<script>`, `onerror=`, `javascript:`, dll. | Menolak & **mencatat** percobaan → Wazuh → respons |
| **2. Output encoding (React)** | Semua data ditampilkan lewat JSX yang otomatis meng-escape HTML; tidak ada `dangerouslySetInnerHTML` pada data pengguna | **Pencegahan utama** — payload yang lolos lapis 1 tetap tampil sebagai teks |

Lapis 1 bisa dilewati dengan variasi payload; yang benar-benar mencegah eksekusi adalah lapis 2. Pengujian membuktikan keduanya.

**Kebijakan respons S08: diblokir** — XSS adalah serangan aktif, diperlakukan sama seperti SQLi: event `xss_attempt` → alert → blokir IP sementara (Active Response) + ban perangkat 30 menit (aplikasi).

| Varian | Lokasi | Hasil yang diharapkan |
|---|---|---|
| A. Reflected di URL halaman | `/products?q=<script>...` | 400 + `xss_attempt` → blokir |
| B. Reflected di API pencarian | `/api/products?search=<img onerror>` | 400 + `xss_attempt` |
| C. Stored (disimpan) | Nama saat register / data checkout | 400, tidak tersimpan |
| D. Payload yang lolos regex | Teks HTML tanpa event handler di catatan pesanan | Diterima, tetapi **tampil sebagai teks** di dashboard admin (tidak dieksekusi) |

## 1. Konfigurasi sekali

### 1.1 EC2 App

Deploy kode terbaru (pull, build, recreate) seperti panduan sebelumnya. Kode terbaru juga memperbaiki label event XSS pada lupa/reset password.

### 1.2 EC2 Wazuh — rule XSS

Cek apakah sudah ada rule untuk `xss_attempt`:

```bash
sudo grep -n -B2 -A6 'xss_attempt' /var/ossec/etc/rules/saladinshop_rules.xml
```

Jika belum ada, tambahkan (setelah grup terakhir; sesuaikan ID bila 110110 sudah terpakai):

```xml
<group name="saladinshop,web_security,xss,">
  <rule id="110110" level="10">
    <decoded_as>json</decoded_as>
    <field name="event_type" type="pcre2">^xss_attempt$</field>
    <description>SALADINSHOP: XSS attempt blocked from $(ip_address)</description>
    <mitre><id>T1059.007</id></mitre>
    <group>attack,xss,</group>
  </rule>
</group>
```

Tambahkan `110110` ke:
- `<rules_id>` blok **Active Response ber-timeout 1800** (blokir sementara), dan
- `<rule_id>` blok `<integration>` custom-n8n (Telegram).

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
```

### 1.3 n8n — workflow pertama

Tambahkan output Switch `110110 — XSS Attempt` → **Send a text message**.

## 2. Varian A — Reflected XSS di URL halaman

Dari browser PENGUJI (buka halaman utama dulu agar cookie perangkat terpasang), buka:

```
https://saladinshop.duckdns.org/products?q=<script>alert('XSS-UJI')</script>
```

**Hasil:** respons JSON **400** "Malicious or invalid request query parameters detected"; **tidak ada** pop-up alert. Beberapa detik kemudian halaman utama → **403** (IP diblokir); ganti VPN di browser sama → tetap **403** (ban perangkat).

```bash
# APP
cd ~/ecommerce-security
grep -E '"event_type":"(xss_attempt|device_banned)"' runtime-logs/security_events.log | tail -n 3 | cut -c1-230
# WAZUH
sudo grep -F '"id":"110110"' /var/ossec/logs/alerts/alerts.json | tail -n 2 | cut -c1-230
```

Pulihkan: unblock IP (IP Response) + buka ban (Device & Akun Ban) sebelum varian berikutnya.

## 3. Varian B — Reflected XSS di API pencarian

Dari Kali:

```bash
curl -i --get --data-urlencode 'search=<img src=x onerror=alert(1)>' \
  https://saladinshop.duckdns.org/api/products
```

**Hasil:** **400**, event `xss_attempt` endpoint `/api/products`, alert 110110, blokir IP sementara. Pulihkan setelahnya.

## 4. Varian C — Stored XSS (data yang disimpan)

1. Halaman **Daftar**: isi nama `<script>alert('XSS-UJI')</script>` dengan email uji baru → **400** "Karakter terlarang…", akun **tidak** dibuat.
2. (Opsional) Halaman checkout: isi nama pelanggan `<svg onload=alert(1)>` → **400**, pesanan tidak dibuat.

Cek event `xss_attempt` dengan endpoint `/api/auth/register` / `/api/orders`. Pulihkan blokir setelahnya.

## 5. Varian D — Payload yang lolos deteksi tetap aman (output encoding)

Membuktikan lapis 2. Gunakan teks HTML **tanpa** tag script/event handler, sehingga tidak ditolak regex:

1. Login akun uji, checkout produk Sandbox; di kolom **catatan pesanan** isi:
   ```
   <b>TEBAL-UJI</b> <i>miring</i> <u>garis</u>
   ```
2. Pesanan dibuat (201) — regex tidak menganggapnya serangan.
3. Buka dashboard admin → detail pesanan tersebut.
   **Hasil yang diharapkan:** teks tampil **apa adanya** termasuk tanda `<b>` dan `</b>`, **bukan** huruf tebal. Artinya browser tidak menafsirkan input sebagai HTML.
4. Klik kanan → *Inspect* pada teks itu: isinya `&lt;b&gt;TEBAL-UJI&lt;/b&gt;` (sudah di-escape).

Batalkan/biarkan pesanan uji kedaluwarsa.

## 6. Kontrol normal

- Pencarian biasa `/products?q=minecraft` dan `/api/products?search=diamond` → 200, tanpa event.
- Nama wajar saat daftar (mis. `Budi Santoso`) → berhasil.

## 7. Screenshot

(a) URL payload + respons 400 tanpa pop-up, (b) event + alert 110110 + Telegram, (c) 403 setelah blokir & setelah ganti VPN, (d) register ditolak, (e) catatan `<b>` tampil sebagai teks di admin + Inspect.

## 8. Batasan

- Deteksi regex dapat dilewati dengan encoding/variasi payload; pencegahan sebenarnya bergantung pada output encoding React. Halaman yang di masa depan memakai `dangerouslySetInnerHTML` atau menyisipkan HTML manual harus diuji ulang.
- Belum ada **Content-Security-Policy** (CSP). CSP adalah lapis tambahan yang direkomendasikan, tetapi harus disusun hati-hati karena website memuat skrip Midtrans Snap, Cloudflare Turnstile, dan Google Sign-In.
- Kata kunci tertentu di teks biasa (mis. kalimat yang mengandung `onclick=`) dapat ditolak sebagai false positive; catat bila terjadi saat traffic normal.
