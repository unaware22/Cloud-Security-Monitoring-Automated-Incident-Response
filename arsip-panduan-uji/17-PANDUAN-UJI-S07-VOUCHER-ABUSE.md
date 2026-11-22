# Panduan Uji S07 — Voucher Abuse (Pemakaian Ulang)

Uji hanya pada website penelitian dengan voucher uji, akun uji, dan **Midtrans Sandbox**.

## Ringkasan

| | |
|---|---|
| **Serangan** | Memakai voucher sekali-pakai lebih dari sekali, termasuk dengan melewati tampilan (request langsung ke API) |
| **Kontrol aplikasi** | Voucher diperiksa **di server**: wajib login, masa berlaku, minimal subtotal, **sekali pakai per akun**; diskon dihitung dari database |
| **Respons** | **Ditolak + notifikasi**, tanpa blokir |
| **Event / rule** | `voucher_abuse_attempt` (`reason=reuse`) → **110520** + **110521** |
| **Varian inti (10×)** | Pakai ulang HEMAT5K lewat tampilan dan lewat API |

Voucher seed: **HEMAT5K** — diskon Rp5.000, minimal belanja Rp30.000, wajib login, sekali pakai per akun.

## 1. Konfigurasi sekali

**EC2 App** — deploy kode terbaru (pull, build, recreate).

**EC2 Wazuh** — tambahkan (backup dulu; jangan menimpa ID yang sudah ada):

```xml
<group name="saladinshop,web_security,voucher_abuse,">
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
</group>
```

Tambahkan `110521` ke `<rule_id>` blok `<integration>` (Telegram). **Tidak** ke Active Response.

```bash
sudo /var/ossec/bin/wazuh-analysisd -t && sudo systemctl restart wazuh-manager
```

**n8n** — output Switch `110521 — Voucher Reuse` → Send a text message.

## 2. Varian inti — Pakai ulang voucher

1. Login **akun uji D** (belum pernah memakai HEMAT5K). Checkout produk ≥ Rp30.000 dengan voucher **HEMAT5K** → diskon Rp5.000 diterapkan, pesanan dibuat. Pesanan boleh dibayar via Sandbox atau dibiarkan pending (pending aktif dihitung terpakai).
2. **Lewat tampilan:** buka checkout lagi, masukkan **HEMAT5K**, klik terapkan.
   **Hasil:** ditolak "Anda sudah pernah menggunakan voucher HEMAT5K…" (Network `POST /api/vouchers/validate` → **400**).
3. **Lewat API (melewati tampilan):** di halaman checkout yang sama, selesaikan CAPTCHA (jangan klik bayar), F12 → **Console** (bukan terminal), tempel:

   ```javascript
   (async () => {
     const r = await fetch('/api/orders', {
       method: 'POST', credentials: 'same-origin',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         product_id: 'GANTI_SLUG_PRODUK', quantity: 1,
         customer_name: 'Uji Voucher D', customer_email: 'GANTI_EMAIL_AKUN_D',
         customer_phone: '081200000002', payment_method: 'va_bca',
         voucher_code: 'HEMAT5K',
         turnstile_token: window.turnstile.getResponse()
       })
     });
     console.log(r.status, await r.json());
   })();
   ```

   **Hasil:** **400** "Voucher HEMAT5K sudah pernah Anda gunakan sebelumnya." — tidak ada pesanan baru.
4. ADMIN:

   ```bash
   # APP
   grep -F 'reason=reuse' ~/ecommerce-security/runtime-logs/security_events.log | tail -n 2 | cut -c1-230
   # WAZUH
   sudo grep -F '"id":"110521"' /var/ossec/logs/alerts/alerts.json | tail -n 2 | cut -c1-200
   ```

   Dua event `reason=reuse` (dari validasi dan checkout), alert **110521**, Telegram.

**Pengulangan:** langkah 2–3 dapat diulang pada akun D yang sama selama pesanan pertama dibayar atau masih pending (≤ 15 menit). Paling mudah: **bayar** pesanan pertama via Sandbox agar pemakaian voucher berlaku permanen.

## 3. Kontrol normal

Akun yang belum pernah memakai HEMAT5K → diskon diterapkan, **tanpa** event. Pesanan dengan HEMAT5K yang dibiarkan kedaluwarsa → pelanggan boleh memakai HEMAT5K lagi.

## 4. Bukti untuk laporan

Pesanan pertama dengan diskon · penolakan di tampilan · respons Console 400 · event `reason=reuse` · alert 110521 · Telegram.

## 5. Batasan

- Respons sengaja penolakan + notifikasi, bukan pemblokiran.
- Batas sekali pakai berlaku per akun; satu orang dengan banyak akun dapat memakai voucher di tiap akun.

## Catatan temuan (tidak diuji 10×, cukup disebut di pembahasan)

Selama penyusunan S07 ditemukan dan diperbaiki: (1) penolakan voucher sebelumnya tidak tercatat sehingga tidak terlihat Wazuh; (2) dua checkout paralel dapat memakai voucher sekali-pakai dua kali (race condition) — ditutup dengan kunci transaksi per voucher+akun; (3) nilai harga/diskon palsu dari klien diabaikan diam-diam tanpa jejak — kini ditolak dan dicatat sebagai `checkout_tampering_attempt`. Uji manipulasi harga 3 November 2026 (sebelum perbaikan pemantauan): total tetap Rp196.108, bukan Rp1.000.
