# Frontend Specification — Digital Game Item Store

## 1. Tujuan Frontend
Frontend dibuat sebagai website penjualan produk digital/game item dengan alur cepat seperti toko digital modern: customer memilih kategori game, memilih sub-kategori, memilih produk, checkout tanpa login, membayar melalui Xendit/manual payment, lalu mengecek pesanan dengan order code + email.

Referensi visual/UX: `https://www.senovshop.com/`

Catatan penting:
- Gunakan website referensi sebagai inspirasi struktur dan flow, bukan menyalin brand, asset, logo, gambar, teks, atau identitasnya.
- Brand, warna, icon, gambar produk, dan copywriting harus dibuat sendiri.
- Website tidak boleh menjual akun/game item yang melanggar ToS platform secara nyata. Untuk skripsi/portfolio, produk dapat berupa dummy/sandbox digital products.

## 2. Frontend Style Direction
Gaya tampilan yang diinginkan:
- Modern digital item store.
- Clean, responsive, cepat dipahami.
- Customer side lebih visual dan game-like, tapi tetap profesional.
- Admin side berbentuk SaaS dashboard yang rapi.

Rekomendasi visual:
- Background: dark navy/black atau off-white modern. Pilih salah satu dan konsisten.
- Card produk: rounded, shadow halus, border tipis.
- Accent Minecraft: green/emerald.
- Accent Roblox: red/rose atau blue.
- Font: Inter atau Plus Jakarta Sans.
- CTA utama: jelas, misalnya `Beli Sekarang`, `Cek Pesanan`, `Bayar Sekarang`.

## 3. Frontend Stack Recommendation
Jika project dibuat baru:
```text
Next.js + Tailwind CSS + shadcn/ui
```

Jika backend REST API sudah ada:
```text
React + Vite + Tailwind CSS
```

Untuk project ini, gunakan salah satu. Jangan membuat dua frontend sekaligus.

## 4. Customer Page List
```text
/
/products
/products/:slug
/checkout/:productSlug
/payment/:orderCode
/check-order
/order/:orderCode
```

## 5. Admin Page List
```text
/admin/login
/admin/dashboard
/admin/products
/admin/orders
/admin/payments
/admin/security-events
/admin/audit-logs
```

## 6. Customer Homepage Layout
Homepage harus berisi:

### 6.1 Header/Navbar
- Logo toko.
- Menu: Home, Produk, Cek Pesanan, Bantuan.
- Tombol CTA: `Cek Pesanan`.

### 6.2 Hero Section
- Headline singkat, contoh: `Digital Game Store Cepat dan Aman`.
- Subheadline menjelaskan bahwa customer bisa beli produk digital tanpa akun.
- CTA:
  - `Lihat Produk`
  - `Cek Pesanan`

### 6.3 Game Category Selector
Tampilkan dua kategori utama:

```text
Minecraft
Roblox
```

Setiap kategori berupa card besar dengan:
- icon/illustration sendiri
- nama game
- deskripsi singkat
- tombol `Lihat Produk`

### 6.4 Featured Products
Tampilkan beberapa produk populer dari semua kategori.

### 6.5 How to Buy
Alur 4 langkah:
```text
1. Pilih game dan produk
2. Isi email/WhatsApp
3. Bayar via Xendit atau manual transfer
4. Produk dikirim dan bisa dicek dengan order code
```

### 6.6 FAQ
Contoh pertanyaan:
- Apakah perlu daftar akun?
- Bagaimana cara cek pesanan?
- Metode pembayaran apa saja?
- Kapan produk dikirim?

## 7. Category and Subcategory Structure

## 7.1 Main Game Categories
```text
minecraft
roblox
```

## 7.2 Minecraft Subcategories
Setelah customer memilih Minecraft, tampilkan sub kategori:
```text
Semua
Akun
Skins
Capes
Realms
Minecoins
```

Struktur data:
```json
{
  "game": "minecraft",
  "subCategory1": "akun | skins | capes | realms | minecoins"
}
```

Minecraft tidak perlu sub-category level kedua.

## 7.3 Roblox Subcategories Level 1
Setelah customer memilih Roblox, tampilkan sub kategori game Roblox:
```text
Semua
Fish It
Grow a Garden 2
Blox Fruit
```

## 7.4 Roblox Subcategories Level 2
Setelah memilih game Roblox tertentu, tampilkan sub kategori kedua:
```text
Semua
Akun
Items
```

Struktur data:
```json
{
  "game": "roblox",
  "subCategory1": "fish-it | grow-a-garden-2 | blox-fruit",
  "subCategory2": "akun | items"
}
```

Jika user memilih `Roblox -> Semua`, tampilkan semua produk Roblox dari semua subCategory1 dan subCategory2.

## 8. Product List UX
Halaman product list harus mendukung:
- filter game category: Minecraft/Roblox
- filter subcategory sesuai game
- search produk
- sort by:
  - terbaru
  - harga termurah
  - harga termahal
  - populer
- product card

Product card berisi:
- gambar produk
- nama produk
- game badge
- subcategory badge
- harga
- stok/status tersedia
- tombol `Detail`
- tombol `Beli Sekarang`

## 9. Product Detail UX
Halaman detail produk berisi:
- gambar produk
- nama produk
- kategori game
- sub kategori
- harga
- stok
- deskripsi produk
- catatan pembelian
- estimasi pengiriman
- tombol `Beli Sekarang`

Jika produk tidak aktif/stok habis:
- tampilkan badge `Tidak Tersedia`
- disable tombol beli

## 10. Checkout UX
Checkout tanpa customer login.

Input wajib:
```text
Nama
Email
Nomor WhatsApp
Quantity
Metode Pembayaran
```

Metode pembayaran:
```text
Xendit Invoice/QRIS/VA
Manual Transfer
Manual QRIS
```

Validasi frontend:
- nama tidak boleh kosong
- email harus valid
- nomor WA minimal format angka wajar
- quantity minimal 1
- payment method wajib dipilih

Setelah submit:
- backend membuat order
- frontend menampilkan order code
- jika Xendit: tampilkan tombol `Bayar Sekarang` ke payment_url
- jika manual: tampilkan instruksi transfer dan form konfirmasi manual

## 11. Payment Page UX
Route:
```text
/payment/:orderCode
```

Isi:
- order code
- total pembayaran
- batas waktu pembayaran
- status pembayaran
- tombol bayar Xendit jika ada payment_url
- instruksi manual jika manual payment
- link ke check order

## 12. Check Order UX
Route:
```text
/check-order
```

Input:
```text
Order code
Email
```

Output jika cocok:
- order code
- produk
- total
- payment status
- delivery status
- tanggal order
- catatan delivery

Security UX:
- jika salah, gunakan pesan umum: `Pesanan tidak ditemukan atau data tidak cocok.`
- jangan beri tahu apakah order code benar tapi email salah.
- beri cooldown/rate limit message jika terlalu sering mencoba.

## 13. Admin Frontend UX
Admin side harus berbeda dari customer side. Gunakan layout dashboard.

### 13.1 Admin Login
- email
- password
- error generic
- loading state

### 13.2 Admin Dashboard
Cards:
- total orders
- pending payment
- paid orders
- delivered orders
- revenue
- recent security events

### 13.3 Product Management
Admin bisa:
- tambah produk
- edit produk
- deactivate produk
- upload/ubah gambar produk
- set game category
- set subcategory Minecraft/Roblox
- set stok
- set harga

Form product harus mendukung category logic:
- Jika game = Minecraft, tampilkan Minecraft subcategories.
- Jika game = Roblox, tampilkan Roblox game subcategory level 1 dan subcategory level 2.

### 13.4 Order Management
Admin bisa:
- lihat list order
- filter payment status
- filter delivery status
- lihat detail order
- resend delivery

### 13.5 Payment Verification
Untuk manual payment:
- lihat order pending_manual
- lihat info transfer customer
- approve manual payment
- reject manual payment

Label action:
```text
Approve Manual Payment
Reject Payment
```

Jangan gunakan label `Set Paid`.

### 13.6 Security Events
Tampilkan tabel:
- timestamp
- severity
- event type
- IP address
- endpoint
- payload snippet

## 14. Frontend Components
Recommended components:
```text
components/layout/Navbar
components/layout/Footer
components/layout/AdminSidebar
components/product/GameCategoryCard
components/product/SubCategoryTabs
components/product/ProductCard
components/product/ProductGrid
components/product/ProductFilterBar
components/checkout/CheckoutForm
components/checkout/PaymentMethodSelector
components/order/OrderStatusCard
components/admin/StatCard
components/admin/DataTable
components/admin/StatusBadge
components/admin/ProductForm
components/admin/PaymentVerificationTable
components/security/SecurityEventTable
```

## 15. Category Data Model for Frontend
Use this config for rendering category filters:

```js
export const gameCategories = [
  {
    id: 'minecraft',
    name: 'Minecraft',
    accent: 'emerald',
    subcategories: [
      { id: 'all', name: 'Semua' },
      { id: 'akun', name: 'Akun' },
      { id: 'skins', name: 'Skins' },
      { id: 'capes', name: 'Capes' },
      { id: 'realms', name: 'Realms' },
      { id: 'minecoins', name: 'Minecoins' }
    ]
  },
  {
    id: 'roblox',
    name: 'Roblox',
    accent: 'rose',
    subcategories: [
      {
        id: 'all',
        name: 'Semua',
        childSubcategories: [
          { id: 'all', name: 'Semua' }
        ]
      },
      {
        id: 'fish-it',
        name: 'Fish It',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' }
        ]
      },
      {
        id: 'grow-a-garden-2',
        name: 'Grow a Garden 2',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' }
        ]
      },
      {
        id: 'blox-fruit',
        name: 'Blox Fruit',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' }
        ]
      }
    ]
  }
];
```

## 16. Product Object Shape
Frontend product object:
```ts
type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  stock: number;
  imageUrl: string;
  game: 'minecraft' | 'roblox';
  subCategory1: string;
  subCategory2?: string | null;
  isActive: boolean;
  deliveryType: 'manual' | 'automatic';
};
```

## 17. API Integration Points
Frontend harus menggunakan API berikut:
```text
GET /api/products
GET /api/products?game=minecraft&subCategory1=akun
GET /api/products?game=roblox&subCategory1=fish-it&subCategory2=items
GET /api/products/:slug
POST /api/orders
POST /api/orders/check
POST /api/orders/manual-payment
POST /api/admin/login
GET /api/admin/products
POST /api/admin/products
PUT /api/admin/products/:id
GET /api/admin/orders
POST /api/admin/orders/:id/approve-manual-payment
GET /api/admin/security-events
```

## 18. Security Requirements for Frontend
- Never store Xendit secret key in frontend.
- Never trust payment status from frontend.
- Admin token/session must be handled securely.
- Do not expose internal product delivery content before payment is paid.
- Check order requires order_code + email.
- Display generic error messages for sensitive actions.
- Sanitize/escape displayed user input.

## 19. Prompt for Claude Code / Antigravity Frontend
Use this after core backend/API is defined:

```text
Build the customer and admin frontend for this digital game item store.

Use the frontend specification in 09-FRONTEND-SPEC.md.
The customer UI should be inspired by modern digital product stores such as Senovshop, but do not copy any logo, image, brand asset, text, or proprietary design. Create an original design.

Customer side requirements:
- Homepage with hero, game category selector, featured products, how-to-buy section, FAQ.
- Main game categories: Minecraft and Roblox.
- Minecraft subcategories: Semua, Akun, Skins, Capes, Realms, Minecoins.
- Roblox subcategory level 1: Semua, Fish It, Grow a Garden 2, Blox Fruit.
- Roblox subcategory level 2: Semua, Akun, Items.
- Product list with filters, search, sort, product cards.
- Product detail page.
- Checkout without customer login.
- Payment page for Xendit/manual payment.
- Check order page requiring order code + email.

Admin side requirements:
- Admin login.
- Admin dashboard.
- Product management with dynamic category fields for Minecraft/Roblox.
- Order management.
- Manual payment verification.
- Security events page.
- Audit logs page.

Design requirements:
- Responsive mobile-first.
- Modern digital store look.
- Clean card layout.
- Distinct accent colors for Minecraft and Roblox.
- Use reusable components.
- Keep code modular.

Security UX requirements:
- Generic errors for login/check order.
- Do not expose paid product content before payment is confirmed.
- Do not put API secrets in frontend.
```
