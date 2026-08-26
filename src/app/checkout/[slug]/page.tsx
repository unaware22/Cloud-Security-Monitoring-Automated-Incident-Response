'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  X,
  Upload,
  Trash2,
  MessageSquare,
  FileText,
  Info,
  Star,
} from 'lucide-react';
import { formatIDR } from '@/lib/utils';
import { ProductItem } from '@/lib/types';

interface PaymentMethodItem {
  id: string;
  name: string;
  category: 'qris' | 'ewallet' | 'va' | 'retail';
  logo: React.ReactNode;
}

// Payment Logo Components
function QRISLogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200 px-1">
      <span className="text-[10px] font-black text-rose-600 tracking-tight font-sans">
        QR<span className="text-neutral-900">IS</span>
      </span>
    </div>
  );
}

function OVOLogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[11px] font-black text-[#4c2a86] tracking-tighter lowercase font-sans">
        ovo
      </span>
    </div>
  );
}

function DANALogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[10px] font-black text-[#118eea] tracking-tight uppercase font-sans">
        dana
      </span>
    </div>
  );
}

function ShopeePayLogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[9px] font-black text-[#ee4d2d] tracking-tighter font-sans">
        Shopee<span className="text-amber-500 font-bold">Pay</span>
      </span>
    </div>
  );
}

function BRIVALogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[9px] font-black text-[#00529c] tracking-tight font-sans">
        BRIVA
      </span>
    </div>
  );
}

function MandiriLogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[9px] font-black text-[#003d79] tracking-tight font-sans">
        mandiri
      </span>
    </div>
  );
}

function BSILogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[10px] font-black text-[#00a39d] tracking-tight font-sans">
        BSI
      </span>
    </div>
  );
}

function BCALogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[10px] font-black text-[#005baa] tracking-tight font-sans">
        BCA
      </span>
    </div>
  );
}

function AlfamartLogo() {
  return (
    <div className="w-10 h-7 bg-white rounded flex items-center justify-center border border-neutral-200">
      <span className="text-[9px] font-black text-[#e11b22] tracking-tighter font-sans">
        Alfa<span className="text-[#005baa]">mart</span>
      </span>
    </div>
  );
}

const DEFAULT_SKIN_TEMPLATE = `a) Kepala 🧑
1. Rambut
   - Warna: 
   - Penjelasan: 
2. Mata
   - Warna: 
   - Penjelasan: 

b) Badan 💪
1. Kulit
   - Warna: 
   - Penjelasan: 

c) Pakaian 👚
1. Baju
   - Warna: 
   - Penjelasan: 
2. Celana
   - Warna: 
   - Penjelasan: 
3. Sepatu
   - Warna: 
   - Penjelasan: 

d) Aksesoris 🧢
- Topi / Sayap / Jubah: 
- Detail Lainnya: `;

export default function CheckoutPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);

  // Custom Skin Form State (for Pembuatan Cepat / Skin products)
  const [skinDescription, setSkinDescription] = useState(DEFAULT_SKIN_TEMPLATE);
  const [skinSize, setSkinSize] = useState<'32x32' | '64x64'>('64x64');
  const [skinModel, setSkinModel] = useState<'wide' | 'slim'>('wide');
  const [referenceImage, setReferenceImage] = useState<string>('');
  const [referenceFileName, setReferenceFileName] = useState<string>('');
  const [referenceFileSize, setReferenceFileSize] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Customer Form Data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Selected Payment Method ID (defaults to 'qris')
  const [selectedMethodId, setSelectedMethodId] = useState<string>('qris');

  // Accordion open/close state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    qris: true,
    ewallet: true,
    va: true,
    retail: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Confirmation Dialog State
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Fetch product detail
  useEffect(() => {
    async function loadProduct() {
      try {
        const res = await fetch(`/api/products/${slug}`);
        const json = await res.json();
        if (json.success) {
          setProduct(json.data);
        } else {
          setErrorMessage('Produk tidak ditemukan atau tidak aktif');
        }
      } catch {
        setErrorMessage('Gagal memuat detail produk');
      } finally {
        setLoadingProduct(false);
      }
    }
    loadProduct();
  }, [slug]);

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Check if current product is a Custom Skin / Pembuatan Cepat product
  const isCustomSkinProduct =
    product?.serviceTag === 'pembuatan-cepat' ||
    product?.subCategory1 === 'skins' ||
    product?.slug.includes('skin') ||
    product?.name.toLowerCase().includes('skin');

  // Handle reference image upload (Max 10MB)
  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Ukuran gambar referensi maksimal 10MB');
      return;
    }

    setReferenceFileName(file.name);
    setReferenceFileSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReferenceImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Payment Methods Definitions
  const PAYMENT_METHODS: PaymentMethodItem[] = [
    // 1. QRIS
    {
      id: 'qris',
      name: 'QRIS',
      category: 'qris',
      logo: <QRISLogo />,
    },
    // 2. E-wallet
    {
      id: 'ovo',
      name: 'OVO',
      category: 'ewallet',
      logo: <OVOLogo />,
    },
    {
      id: 'dana',
      name: 'DANA',
      category: 'ewallet',
      logo: <DANALogo />,
    },
    {
      id: 'shopeepay',
      name: 'ShopeePay',
      category: 'ewallet',
      logo: <ShopeePayLogo />,
    },
    // 3. Virtual Account
    {
      id: 'va_bri',
      name: 'BRI Virtual Account',
      category: 'va',
      logo: <BRIVALogo />,
    },
    {
      id: 'va_mandiri',
      name: 'Mandiri Virtual Account',
      category: 'va',
      logo: <MandiriLogo />,
    },
    {
      id: 'va_bsi',
      name: 'BSI Virtual Account',
      category: 'va',
      logo: <BSILogo />,
    },
    {
      id: 'va_bca',
      name: 'BCA Virtual Account',
      category: 'va',
      logo: <BCALogo />,
    },
    // 4. Retail
    {
      id: 'alfamart',
      name: 'Alfamart',
      category: 'retail',
      logo: <AlfamartLogo />,
    },
  ];

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === selectedMethodId) || PAYMENT_METHODS[0];
  const productSubtotal = product?.price || 0;
  const adminFee = Math.round(750 + productSubtotal * 0.007);
  const totalPrice = productSubtotal + adminFee;

  const handleFormValidation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!product) return;

    if (product.stock <= 0) {
      setErrorMessage('Maaf, stok produk ini sedang habis dan tidak dapat dipesan.');
      return;
    }

    if (isCustomSkinProduct) {
      if (!skinDescription.trim() || skinDescription.trim().length < 20) {
        setErrorMessage('Deskripsi skin impian minimal 20 karakter agar hasil pembuatan sesuai.');
        return;
      }
    }

    if (!customerName.trim()) {
      setErrorMessage('Nama lengkap wajib diisi');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setErrorMessage('Alamat email valid wajib diisi untuk notifikasi & pengiriman');
      return;
    }
    if (!customerPhone.trim() || customerPhone.length < 8) {
      setErrorMessage('Nomor Telepon / WhatsApp wajib diisi');
      return;
    }

    // Show confirmation dialog before redirect
    setShowConfirmation(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirmation(false);
    if (!product) return;

    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          quantity: 1,
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim(),
          customer_phone: customerPhone.trim(),
          payment_method: selectedMethodId,
          notes: customerNotes.trim() || undefined,
          skin_description: isCustomSkinProduct ? skinDescription.trim() : undefined,
          skin_size: isCustomSkinProduct ? skinSize : undefined,
          skin_model: isCustomSkinProduct ? skinModel : undefined,
          skin_reference_image: isCustomSkinProduct && referenceImage ? referenceImage : undefined,
          custom_skin_details: isCustomSkinProduct
            ? {
                description: skinDescription.trim(),
                skinSize,
                skinModel,
                referenceImageUrl: referenceImage || null,
              }
            : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.message || 'Gagal memproses pesanan');
        setSubmitting(false);
        return;
      }

      const orderData = json.data;

      // Save order info to localStorage for easy lookup
      if (typeof window !== 'undefined') {
        localStorage.setItem(`order_email_${orderData.order_code}`, customerEmail.trim());
      }

      // Redirect directly to Xendit hosted payment page
      if (orderData.payment_url) {
        window.location.href = orderData.payment_url;
      } else {
        setErrorMessage('URL pembayaran tidak tersedia. Silakan coba lagi.');
        setSubmitting(false);
      }
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan saat checkout.');
      setSubmitting(false);
    }
  };

  if (loadingProduct) {
    return (
      <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center gap-3 text-neutral-400">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-xs font-medium">Memuat formulir checkout SALADINSHOP...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#111111] text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full p-8 rounded-none bg-[#181818] border border-neutral-700 text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h2 className="minecraft-font-folder text-xl text-white">PRODUK TIDAK DITEMUKAN</h2>
          <p className="text-xs text-neutral-400">{errorMessage || 'Produk mungkin sudah tidak aktif.'}</p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-none text-xs font-black bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white uppercase tracking-wider"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  const isAvailable = (product.stock ?? 0) > 0;
  const discountPercent = product.discountPercent || (product.slug.includes('skin') ? 60 : product.slug.includes('bundle') ? 55 : 56);
  const originalPrice = product.originalPrice || Math.round((product.price / Math.max(1, 100 - discountPercent)) * 100);

  const categories: Array<{ key: 'qris' | 'ewallet' | 'va' | 'retail'; title: string }> = [
    { key: 'qris', title: 'QRIS' },
    { key: 'ewallet', title: 'E-wallet' },
    { key: 'va', title: 'Virtual Account' },
    { key: 'retail', title: 'Retail' },
  ];

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-8 sm:pt-12 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Dedicated Checkout Header */}
        <div className="flex items-center justify-between pb-6 border-b border-neutral-800">
          <Link href="/" className="flex items-center group select-none">
            <img
              src="/images/logo2.png"
              alt="SALADINSHOP"
              className="h-12 sm:h-14 md:h-16 w-auto max-h-[64px] object-contain drop-shadow transition-transform duration-150 group-hover:scale-105"
            />
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-none bg-[#181818] hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 text-xs font-bold transition-all uppercase tracking-wider shadow-md"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            <span>Kembali ke Beranda</span>
          </Link>
        </div>

        {/* Out of Stock Notice */}
        {!isAvailable && (
          <div className="p-4 rounded-none bg-rose-950/80 border-2 border-rose-500 text-rose-200 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <div>
              <p className="font-bold uppercase tracking-wide">STOK PRODUK INI SEDANG HABIS</p>
              <p className="text-[11px] text-rose-300">Mohon maaf, Anda tidak dapat melanjutkan proses checkout untuk produk ini.</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-none bg-rose-950/70 border border-rose-600/60 text-xs text-rose-200 flex items-center gap-2.5 font-medium shadow-md">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Form Container */}
        <form onSubmit={handleFormValidation} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ================= LEFT COLUMN: PRODUCT PREVIEW (5 cols) ================= */}
          <div className="lg:col-span-5 space-y-4 bg-[#181818] border border-neutral-700/80 rounded-none p-6 shadow-2xl h-fit">
            
            {/* Product Image */}
            <div className="relative aspect-square w-full rounded-none overflow-hidden bg-[#0c1220] border border-neutral-800 shadow-md">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className={`w-full h-full object-cover object-top ${!isAvailable ? 'grayscale-[40%]' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-500 font-mono text-xs">
                  SALADINSHOP
                </div>
              )}

              {/* Discount Badge */}
              {discountPercent > 0 && (
                <div className="absolute top-2 right-2">
                  <span className="px-2 py-0.5 rounded-none text-[11px] font-black bg-rose-600 text-white shadow-lg tracking-tight">
                    -{discountPercent}%
                  </span>
                </div>
              )}
            </div>

            {/* Title & Price */}
            <div className="space-y-2">
              <h1 className="minecraft-font-folder text-lg sm:text-xl text-white font-normal leading-snug">
                {product.name}
              </h1>

              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 line-through font-mono">
                  {formatIDR(originalPrice)}
                </span>
                <span className="text-[10px] font-black text-rose-400 bg-rose-950/60 border border-rose-800/40 px-1.5 py-0.5 rounded-none">
                  HEMAT {discountPercent}%
                </span>
              </div>

              <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                {formatIDR(product.price)}
              </p>
            </div>

            {/* Service Tag Badge Info */}
            <div className="p-3 bg-[#111111] border border-neutral-800 flex items-center gap-2.5">
              {isCustomSkinProduct ? (
                <>
                  <img
                    src="/images/tag-pembuatan-cepat.png"
                    alt="Pembuatan Cepat"
                    className="h-4 w-auto object-contain flex-shrink-0"
                  />
                  <span className="text-[11px] font-semibold text-purple-300">
                    Layanan Pembuatan Cepat (Estimasi ~5 Menit oleh Desainer)
                  </span>
                </>
              ) : (
                <>
                  <img
                    src="/images/tag-proses-instant.png"
                    alt="Proses Instant"
                    className="h-4 w-auto object-contain flex-shrink-0"
                  />
                  <span className="text-[11px] font-semibold text-cyan-300">
                    Proses Instant (Pengiriman Akun Otomatis Seketika)
                  </span>
                </>
              )}
            </div>

            {/* Description Box */}
            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 text-xs text-neutral-300 space-y-2">
              <h4 className="font-bold text-white text-[11px] uppercase tracking-wider font-config-text">
                Deskripsi Produk:
              </h4>
              <p className="text-[12px] leading-relaxed text-neutral-300 font-config-text">
                {product.description ||
                  (isCustomSkinProduct
                    ? 'Desain skin Minecraft custom HD 3D eksklusif sesuai keinginan Anda. Dikerjakan langsung oleh tim desainer profesional dengan waktu pengerjaan sekitar 5 menit.'
                    : 'Produk resmi bergaransi 100% Full Access. Data akun / lisensi akan otomatis dikirimkan ke layar Anda seketika setelah pembayaran berhasil dikonfirmasi.')}
              </p>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: FORM & PAYMENT ACCORDIONS (7 cols) ================= */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* ================= STEP 1: CERITAKAN SKIN IMPIANMU (Shown for Custom Skin / Pembuatan Cepat) ================= */}
            {isCustomSkinProduct && (
              <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl overflow-hidden animate-fadeIn">
                <div className="bg-[#202020] border-b border-neutral-700 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded bg-[#0284c7] text-white font-black text-xs flex items-center justify-center shadow-md">
                      1
                    </div>
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                      CERITAKAN SKIN IMPIANMU
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSkinDescription(DEFAULT_SKIN_TEMPLATE)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 underline underline-offset-2 transition-colors"
                  >
                    Gunakan Format Template
                  </button>
                </div>

                <div className="p-6 space-y-6 text-xs">
                  {/* Deskripsi skin yang kamu inginkan */}
                  <div className="space-y-1.5">
                    <label className="block text-neutral-200 font-bold uppercase tracking-wider">
                      Deskripsi skin yang kamu inginkan <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={10}
                      required
                      disabled={!isAvailable}
                      value={skinDescription}
                      onChange={(e) => setSkinDescription(e.target.value)}
                      placeholder="Jelaskan secara detail bagian Kepala (Rambut, Mata), Badan (Kulit), Pakaian (Baju, Celana, Sepatu), dan Aksesoris..."
                      className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 font-mono text-xs leading-relaxed disabled:opacity-50"
                    />
                    <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                      <span>💡 Semakin detail, semakin sesuai hasilnya. Minimal 20 karakter.</span>
                    </p>
                  </div>

                  {/* Ukuran Skin */}
                  <div className="space-y-2">
                    <label className="block text-neutral-200 font-bold uppercase tracking-wider">
                      Ukuran Skin <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* 32x32 px */}
                      <div
                        onClick={() => setSkinSize('32x32')}
                        className={`p-4 rounded-none border-2 text-center cursor-pointer transition-all select-none ${
                          skinSize === '32x32'
                            ? 'border-sky-500 bg-[#09172e] text-white shadow-lg ring-1 ring-sky-500/50'
                            : 'border-neutral-700 hover:border-neutral-600 bg-[#111111] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="block text-sm sm:text-base font-black tracking-tight text-white font-mono">
                          32×32 px
                        </span>
                        <span className="block text-[10px] sm:text-[11px] text-neutral-400 mt-0.5">
                          Java &amp; Bedrock
                        </span>
                      </div>

                      {/* 64x64 px */}
                      <div
                        onClick={() => setSkinSize('64x64')}
                        className={`p-4 rounded-none border-2 text-center cursor-pointer transition-all select-none ${
                          skinSize === '64x64'
                            ? 'border-sky-500 bg-[#09172e] text-white shadow-lg ring-1 ring-sky-500/50'
                            : 'border-neutral-700 hover:border-neutral-600 bg-[#111111] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="block text-sm sm:text-base font-black tracking-tight text-white font-mono">
                          64×64 px
                        </span>
                        <span className="block text-[10px] sm:text-[11px] text-neutral-400 mt-0.5">
                          Java &amp; Bedrock
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Model Skin */}
                  <div className="space-y-2">
                    <label className="block text-neutral-200 font-bold uppercase tracking-wider">
                      Model Skin <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Wide (Steve) */}
                      <div
                        onClick={() => setSkinModel('wide')}
                        className={`p-4 rounded-none border-2 text-center cursor-pointer transition-all select-none ${
                          skinModel === 'wide'
                            ? 'border-sky-500 bg-[#09172e] text-white shadow-lg ring-1 ring-sky-500/50'
                            : 'border-neutral-700 hover:border-neutral-600 bg-[#111111] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="block text-sm sm:text-base font-black tracking-tight text-white">
                          Wide
                        </span>
                        <span className="block text-[10px] sm:text-[11px] text-neutral-400 mt-0.5">
                          Steve
                        </span>
                      </div>

                      {/* Slim (Alex) */}
                      <div
                        onClick={() => setSkinModel('slim')}
                        className={`p-4 rounded-none border-2 text-center cursor-pointer transition-all select-none ${
                          skinModel === 'slim'
                            ? 'border-sky-500 bg-[#09172e] text-white shadow-lg ring-1 ring-sky-500/50'
                            : 'border-neutral-700 hover:border-neutral-600 bg-[#111111] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="block text-sm sm:text-base font-black tracking-tight text-white">
                          Slim
                        </span>
                        <span className="block text-[10px] sm:text-[11px] text-neutral-400 mt-0.5">
                          Alex
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Referensi Gambar (opsional) */}
                  <div className="space-y-2">
                    <label className="block text-neutral-200 font-bold uppercase tracking-wider">
                      Referensi Gambar <span className="text-neutral-400 font-normal normal-case">(opsional)</span>
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleReferenceFileChange}
                      accept="image/png, image/jpeg, image/webp"
                      className="hidden"
                    />

                    {referenceImage ? (
                      <div className="p-4 rounded-none bg-[#111111] border border-sky-500/50 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-14 h-14 rounded-none overflow-hidden bg-neutral-900 border border-neutral-700 flex-shrink-0">
                            <img src={referenceImage} alt="Referensi Skin" className="w-full h-full object-cover" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="font-bold text-white text-xs truncate">{referenceFileName || 'Gambar Referensi'}</p>
                            <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{referenceFileSize}</p>
                            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                              <Check className="w-3 h-3" /> Berhasil Diupload
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-600 transition-colors"
                          >
                            Ganti
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImage('');
                              setReferenceFileName('');
                              setReferenceFileSize('');
                            }}
                            className="p-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 border border-rose-600/40 transition-colors"
                            title="Hapus gambar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-8 px-4 rounded-none border-2 border-dashed border-neutral-700 hover:border-sky-500 bg-[#111111]/70 hover:bg-[#151b28] flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-all group"
                      >
                        <Upload className="w-6 h-6 text-neutral-400 group-hover:text-sky-400 transition-colors mb-1" />
                        <p className="font-bold text-neutral-200 group-hover:text-white text-xs sm:text-sm">
                          Klik untuk upload gambar
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          JPG, PNG, WEBP — Maks 10MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================= STEP 2: DATA PEMESAN ================= */}
            <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl overflow-hidden">
              <div className="bg-[#202020] border-b border-neutral-700 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-[#0284c7] text-white font-black text-xs flex items-center justify-center shadow-md">
                    {isCustomSkinProduct ? 2 : 1}
                  </div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                    DATA PEMESAN
                  </h3>
                </div>
              </div>

              <div className="p-6 space-y-4 text-xs">
                {/* WhatsApp Delivery Notice Banner */}
                <div className="p-3.5 rounded-none bg-sky-950/40 border border-sky-500/40 text-sky-200 text-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0 text-sky-300 mt-0.5">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <p className="leading-relaxed text-[11px] sm:text-xs">
                    {isCustomSkinProduct ? (
                      <>
                        Tim kami akan mengirim hasil skin melalui <strong>WhatsApp</strong> &amp; <strong>Email</strong> setelah proses pembuatan selesai (estimasi ~5 menit). Pastikan nomor WhatsApp kamu aktif agar pengiriman lancar.
                      </>
                    ) : (
                      <>
                        Data akun game akan langsung tampil di layar Anda seketika setelah pembayaran dan bukti transaksi juga otomatis dikirimkan ke Email Anda.
                      </>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                      Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!isAvailable}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                      className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                      Alamat Email *
                    </label>
                    <input
                      type="email"
                      required
                      disabled={!isAvailable}
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                    Nomor WhatsApp / HP *
                  </label>
                  <input
                    type="tel"
                    required
                    disabled={!isAvailable}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider flex items-center justify-between">
                    <span>Catatan Tambahan</span>
                    <span className="text-[10px] text-neutral-400 font-normal normal-case">(Opsional)</span>
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAvailable}
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    placeholder="Tambahkan catatan khusus untuk penjual jika diperlukan (opsional)..."
                    className="w-full px-3.5 py-2.5 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 disabled:opacity-50 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* ================= STEP 3: PILIH METODE PEMBAYARAN ================= */}
            <div className="space-y-4">
              <div className="bg-[#202020] border border-neutral-700 px-6 py-4 rounded-none flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-[#0284c7] text-white font-black text-xs flex items-center justify-center shadow-md">
                  {isCustomSkinProduct ? 3 : 2}
                </div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                  PILIH METODE PEMBAYARAN
                </h3>
              </div>

              {categories.map((cat) => {
                const items = PAYMENT_METHODS.filter((m) => m.category === cat.key);
                const isOpen = openSections[cat.key] ?? true;

                return (
                  <div
                    key={cat.key}
                    className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-xl overflow-hidden"
                  >
                    {/* Category Header with Chevron */}
                    <div
                      onClick={() => toggleSection(cat.key)}
                      className="px-5 py-3.5 bg-[#1e1e1e] hover:bg-[#252525] transition-colors cursor-pointer flex items-center justify-between select-none border-b border-neutral-800"
                    >
                      <span className="font-bold text-xs sm:text-sm text-white tracking-wide">
                        {cat.title}
                      </span>
                      <div className="w-6 h-6 rounded-full border border-neutral-600 bg-neutral-800/80 flex items-center justify-center text-neutral-300">
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {/* Category Items List */}
                    {isOpen && (
                      <div className="p-3.5 sm:p-4 space-y-2.5 bg-[#141414]">
                        {items.map((method) => {
                          const isSelected = selectedMethodId === method.id;

                          return (
                            <div
                              key={method.id}
                              onClick={() => {
                                if (isAvailable) setSelectedMethodId(method.id);
                              }}
                              className={`p-3 sm:p-3.5 rounded-md border-2 transition-all flex items-center justify-between cursor-pointer select-none ${
                                !isAvailable
                                  ? 'opacity-40 cursor-not-allowed border-neutral-800 bg-[#181818]'
                                  : isSelected
                                  ? 'border-blue-500 bg-[#1a2333] shadow-md ring-1 ring-blue-500/50'
                                  : 'border-neutral-800 hover:border-neutral-700 bg-[#1b1b1b] hover:bg-[#202020]'
                              }`}
                            >
                              {/* Left: Logo, Name & Fee Info */}
                              <div className="flex items-center gap-3">
                                {method.logo}
                                <div>
                                  <p className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                                    <span>{method.name}</span>
                                    {isSelected && (
                                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                    )}
                                  </p>
                                  <p className="text-[10px] text-amber-400 font-medium">
                                    Biaya Layanan: +{formatIDR(adminFee)} <span className="text-neutral-500 font-mono text-[9px]">(Rp 750 + 0.7%)</span>
                                  </p>
                                </div>
                              </div>

                              {/* Right: Total Price */}
                              <div className="text-right">
                                <span className="font-mono font-bold text-xs sm:text-sm text-[#22c55e] block">
                                  {formatIDR(totalPrice)}
                                </span>
                                <span className="text-[9px] text-neutral-400 block font-normal">
                                  Total Tagihan
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ================= STEP 4: RINGKASAN TOTAL & TOMBOL BELI ================= */}
            <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl p-6 space-y-4">
              <div className="space-y-2 text-xs pb-3 border-b border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Harga Produk:</span>
                  <span className="font-mono text-neutral-200">{formatIDR(productSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Biaya Layanan (Rp 750 + 0.7%):</span>
                  <span className="font-mono text-amber-400 font-semibold">+{formatIDR(adminFee)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                  <div>
                    <span className="text-neutral-400 block">Metode Pembayaran:</span>
                    <span className="font-bold text-amber-400 uppercase text-xs">{selectedMethod?.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-neutral-400 block">Total Tagihan:</span>
                    <span className="text-xl font-mono font-black text-[#22c55e]">{formatIDR(totalPrice)}</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !isAvailable}
                className={`w-full py-4 px-6 rounded-none text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all select-none ${
                  isAvailable
                    ? 'text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-4 border-[#b87e00] active:border-b-0 active:translate-y-1 shadow-2xl'
                    : 'text-neutral-500 bg-neutral-900 border border-neutral-800 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>MEMPROSES PESANAN...</span>
                  </>
                ) : isAvailable ? (
                  <>
                    <span>LANJUTKAN PEMBAYARAN &rarr;</span>
                  </>
                ) : (
                  <span>STOK HABIS (TIDAK DAPAT DIPESAN)</span>
                )}
              </button>

              <p className="text-[10px] text-center text-neutral-400">
                🔒 Data transaksi dilindungi dengan enkripsi SSL 256-bit dan diproses resmi oleh Midtrans.
              </p>
            </div>

          </div>

        </form>
      </div>

      {/* ================= CONFIRMATION DIALOG/MODAL ================= */}
      {showConfirmation && product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1c1c1e] border border-[#2e2e34] rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md overflow-hidden p-6 sm:p-7 space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#22c55e] flex items-center justify-center text-white flex-shrink-0 shadow-sm">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                  KONFIRMASI PEMBAYARAN
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="text-neutral-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction Description */}
            <p className="text-xs text-neutral-300 leading-relaxed font-normal">
              Anda akan diarahkan ke portal pembayaran <span className="text-white font-medium">Midtrans</span> untuk menyelesaikan pembayaran. Pastikan data pesanan Anda sudah benar:
            </p>

            {/* Key-Value Details List */}
            <div className="space-y-2 text-xs">
              <p>
                <strong className="text-white font-bold">Produk:</strong>{' '}
                <span className="text-neutral-200">{product.name}</span>
              </p>

              <p>
                <strong className="text-white font-bold">Harga Produk:</strong>{' '}
                <span className="text-neutral-200 font-mono">{formatIDR(productSubtotal)}</span>
              </p>

              <p>
                <strong className="text-white font-bold">Biaya Layanan:</strong>{' '}
                <span className="text-amber-400 font-mono">+{formatIDR(adminFee)}</span>
              </p>

              <p>
                <strong className="text-white font-bold">Metode:</strong>{' '}
                <span className="text-[#38bdf8] font-bold">{selectedMethod?.name}</span>
              </p>

              <p>
                <strong className="text-white font-bold">Total Tagihan:</strong>{' '}
                <span className="text-[#22c55e] font-bold font-mono">{formatIDR(totalPrice)}</span>
              </p>

              <div className="pt-1.5" />

              <p>
                <strong className="text-white font-bold">Nama:</strong>{' '}
                <span className="text-neutral-200">{customerName}</span>
              </p>

              <p>
                <strong className="text-white font-bold">Email:</strong>{' '}
                <span className="text-neutral-200">{customerEmail}</span>
              </p>

              <p>
                <strong className="text-white font-bold">WhatsApp:</strong>{' '}
                <span className="text-neutral-200">{customerPhone}</span>
              </p>

              {/* Custom Skin Specific Details */}
              {isCustomSkinProduct && (
                <>
                  <p>
                    <strong className="text-white font-bold">Ukuran Skin:</strong>{' '}
                    <span className="text-[#38bdf8] font-bold font-mono">
                      {skinSize === '32x32' ? '32x32 px' : '64x64 px'}
                    </span>
                  </p>

                  <p>
                    <strong className="text-white font-bold">Model Skin:</strong>{' '}
                    <span className="text-[#c084fc] font-bold">
                      {skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}
                    </span>
                  </p>

                  <p>
                    <strong className="text-white font-bold">Gambar Referensi:</strong>{' '}
                    <span className={referenceImage ? 'text-[#22c55e] font-medium' : 'text-[#22c55e] font-medium'}>
                      {referenceImage ? 'Tersedia' : 'Tidak ada'}
                    </span>
                  </p>
                </>
              )}

              <p>
                <strong className="text-white font-bold">Catatan:</strong>{' '}
                <span className="text-[#fbbf24] font-medium">
                  {customerNotes.trim() || '-'}
                </span>
              </p>
            </div>

            {/* Note Box with Justified Text */}
            <div className="bg-[#241a06] border border-[#6b470a] rounded-xl p-3.5 sm:p-4 flex items-start gap-3">
              <div className="text-amber-500 flex-shrink-0 mt-0.5">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
              </div>
              <p className="text-xs text-amber-200/90 text-justify leading-relaxed">
                {isCustomSkinProduct
                  ? 'Setelah membayar, notifikasi akan langsung masuk ke email Anda dan desainer kami akan mulai membuat skin impian Anda (~5 menit).'
                  : 'Setelah membayar di Midtrans, Anda akan otomatis kembali ke toko kami dan data akun game langsung tampil di layar Anda.'}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="px-5 py-2.5 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-white font-bold text-xs uppercase tracking-wider transition-colors border border-neutral-700/60"
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg bg-[#15803d] hover:bg-[#16a34a] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg flex items-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>YA, LANJUTKAN</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
