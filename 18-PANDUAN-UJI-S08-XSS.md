# Panduan Uji S08 — Cross-Site Scripting (XSS)

Uji hanya pada website penelitian dengan penanda uji yang tidak berbahaya (`alert(...)`, teks tebal).

## Ringkasan

| | |
|---|---|
| **Serangan** | Menyisipkan skrip ke input agar dijalankan di browser pengguna lain |
| **Kontrol aplikasi** | (1) Deteksi pola XSS di URL dan form → ditolak 400; (2) **output encoding React**: data selalu tampil sebagai teks |
| **Respons** | **Diblokir**: alert → IP diblokir 30 menit (Active Response) + ban perangkat 30 menit |
| **Event / rule** | `xss_attempt` → **110110** |
| **Varian inti (10×)** | XSS di URL halaman |
| **Bukti tambahan (1×)** | Payload yang lolos deteksi tetap tampil sebagai teks |

## 1. Konfigurasi sekali

**EC2 App** — deploy kode terbaru (pull, build, recreate). Kode terbaru men-decode URL sebelum memeriksa pola, sehingga `<script>` dari address bar terdeteksi.

**EC2 Wazuh** — rule (lewati bila sudah ada):

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

Tambahkan `110110` ke `<rules_id>` Active Response **timeout 1800** dan ke `<rule_id>` `<integration>`. Validasi lalu restart manager. n8n: output `110110 — XSS Attempt`.

## 2. Varian inti — XSS di URL halaman

1. PENGUJI buka halaman utama di browser (cookie perangkat terpasang), lalu:

   ```
   https://saladinshop.duckdns.org/products?q=<script>alert('XSS-UJI')</script>
   ```

   **Hasil:** respons **400** "Malicious or invalid request query parameters detected", **tanpa** pop-up.
2. Tunggu ±15 detik, buka halaman utama → **403** (IP diblokir).
3. (V2) Nyalakan VPN, browser sama → tetap **403** (ban perangkat).
4. ADMIN:

   ```bash
   # APP
   grep -E '"event_type":"(xss_attempt|device_banned)"' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 2 | cut -c1-230
   read -r -p "IP penguji: " IP_UJI
   sudo grep -nF -- "deny $IP_UJI;" /etc/nginx/conf.d/90-saladinshop-blocklist.conf
   # WAZUH
   sudo grep -F '"id":"110110"' /var/ossec/logs/alerts/alerts.json | tail -n 1 | cut -c1-200
   ```

**Pengulangan — penting:** jangan buka blokir manual di antara percobaan. Script Active Response saat ini mengabaikan blokir baru (`duplicate_ignored`) bila timer 30 menit dari blokir sebelumnya masih berjalan, walaupun deny sudah dihapus manual. Untuk percobaan berikutnya: **tunggu sampai log berisi `unblocked` oleh `wazuh:auto-expire`**, atau gunakan IP lain (mis. hotspot HP), lalu buka ban perangkat di menu Device & Akun Ban.

## 3. Bukti tambahan (1×) — Output encoding

1. Login akun uji, checkout produk Sandbox, isi **catatan pesanan**: `<b>TEBAL-UJI</b> <i>miring</i>` (tanpa script/event handler, sehingga tidak ditolak deteksi).
2. Pesanan dibuat. Buka dashboard admin → **Semua Pesanan**, lihat kolom **Catatan** pada baris pesanan tersebut (atau klik baris untuk melihat kotak "Catatan Khusus dari Pembeli" di detail). Buka sebelum 15 menit; setelah kedaluwarsa pesanan pindah ke filter riwayat.
   **Hasil:** teks tampil **apa adanya** termasuk `<b>` dan `</b>`, **bukan** huruf tebal. Inspect elemen: `&lt;b&gt;TEBAL-UJI&lt;/b&gt;`.

Ini membuktikan pencegahan utama ada pada output encoding; deteksi pola adalah lapisan pemantauan.

## 4. Kontrol normal

`/products?q=minecraft` dan pencarian biasa → 200, tanpa event.

## 5. Bukti untuk laporan

URL payload + 400 tanpa pop-up · event & alert 110110 · Telegram · deny + 403 · 403 setelah ganti VPN · catatan `<b>` tampil sebagai teks.

## 6. Batasan

- Deteksi pola dapat dilewati variasi payload; pencegahan sebenarnya adalah output encoding React.
- Belum ada Content-Security-Policy (CSP) — perlu disusun hati-hati karena website memuat skrip Midtrans, Turnstile, dan Google Sign-In.
- Kalimat biasa yang mengandung pola tertentu (mis. `onclick=`) dapat tertolak sebagai false positive.
