'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Zap,
  CreditCard,
  QrCode,
  Building2,
  Wallet,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronRight,
  Package,
} from 'lucide-react';
import { formatIDR } from '@/lib/utils';
import { ProductItem } from '@/lib/types';

export default function CheckoutPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const slug = params.slug;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);

  // Customer Form Data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherApplied, setVoucherApplied] = useState(false);

  // Payment Selection
  const [paymentCategory, setPaymentCategory] = useState<'qris' | 'ewallet' | 'va' | 'manual'>('qris');
  const [paymentMethod, setPaymentMethod] = useState<'xendit_invoice' | 'manual_transfer' | 'manual_qris'>('xendit_invoice');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!product) return;

    if (product.stock <= 0) {
      setErrorMessage('Maaf, stok produk ini sedang habis dan tidak dapat dipesan.');
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage('Nama lengkap wajib diisi');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setErrorMessage('Alamat email valid wajib diisi untuk pengiriman akun');
      return;
    }
    if (!customerPhone.trim() || customerPhone.length < 8) {
      setErrorMessage('Nomor Telepon / WhatsApp wajib diisi');
      return;
    }

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
          payment_method: paymentMethod,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.message || 'Gagal memproses pesanan');
        setSubmitting(false);
        return;
      }

      const orderData = json.data;
      if (typeof window !== 'undefined') {
        localStorage.setItem(`order_email_${orderData.order_code}`, customerEmail.trim());
      }

      router.push(`/payment/${orderData.order_code}`);
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

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-8 sm:pt-12 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Dedicated Checkout Header with Large logo2.png and Back button */}
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
          <div className="p-4 rounded-none bg-rose-950/80 border-2 border-rose-600 flex items-center gap-3 text-xs text-rose-200 font-bold shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>PERINGATAN: Stok produk ini sedang habis (0 unit). Anda tidak dapat melanjutkan proses pemesanan.</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-none bg-rose-950/70 border border-rose-600/60 text-xs text-rose-200 flex items-center gap-2.5 font-medium shadow-md">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ================= LEFT COLUMN: PRODUCT INFO & BENEFITS (5 cols) ================= */}
          <div className="lg:col-span-5 bg-[#181818] border border-neutral-700/80 rounded-none p-6 shadow-2xl space-y-5 text-white">
            
            {/* Main Image Banner */}
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
                <span className={`px-2 py-0.5 text-[10px] font-bold border ${
                  isAvailable ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                }`}>
                  {isAvailable ? `Sisa ${product.stock} Unit` : 'STOK HABIS'}
                </span>
              </div>

              <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                {formatIDR(product.price)}
              </p>
            </div>

            {/* Description Box */}
            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 text-xs text-neutral-300 space-y-2">
              <h4 className="font-bold text-white text-[11px] uppercase tracking-wider font-config-text">
                Deskripsi Produk:
              </h4>
              <p className="text-[12px] leading-relaxed text-neutral-300 font-config-text">
                {product.description ||
                  'Produk resmi bergaransi 100% Full Access. Data akun / lisensi akan otomatis dikirimkan ke layar Anda seketika setelah pembayaran berhasil dikonfirmasi.'}
              </p>
            </div>

            {/* Features & Benefits */}
            <div className="space-y-2.5 pt-2 border-t border-neutral-800">
              <h4 className="font-bold text-neutral-300 text-xs uppercase tracking-wider font-config-text">
                Keunggulan Layanan:
              </h4>
              <ul className="space-y-2 text-xs text-neutral-300 font-config-text">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Akun resmi &amp; legal 100% Full Access</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Pengiriman instan otomatis 24 Jam</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Bisa ganti email, password, skin, &amp; gamertag</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>Garansi penuh &amp; CS Support via WhatsApp</span>
                </li>
              </ul>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: FORM & PAYMENT (7 cols) ================= */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Card 1: Data Pemesan */}
            <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl overflow-hidden">
              <div className="bg-[#222222] border-b border-neutral-700 px-6 py-3.5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  1. LENGKAPI DATA PEMESAN
                </h3>
              </div>

              <div className="p-6 space-y-4 text-xs">
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
                      placeholder="Masukkan nama Anda"
                      className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723] disabled:opacity-50"
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
                      className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723] disabled:opacity-50"
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
                    className="w-full px-3.5 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723] disabled:opacity-50"
                  />
                </div>

                {/* Voucher Code */}
                <div>
                  <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                    Kode Voucher (Opsional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      disabled={!isAvailable}
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                      placeholder="Ketik voucher diskon"
                      className="flex-grow px-3.5 py-2.5 rounded-none bg-[#111111] border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723] uppercase font-mono text-xs disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        if (voucherCode.trim()) setVoucherApplied(true);
                      }}
                      className="px-5 py-2.5 rounded-none bg-[#367723] hover:bg-[#418e2a] border-b-2 border-[#1f4813] text-white font-bold text-xs uppercase tracking-wider disabled:opacity-50"
                    >
                      Terapkan
                    </button>
                  </div>
                  {voucherApplied && (
                    <p className="text-[11px] text-emerald-400 font-bold mt-1.5">
                      ✓ Voucher "{voucherCode.toUpperCase()}" berhasil diterapkan!
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Metode Pembayaran */}
            <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl overflow-hidden">
              <div className="bg-[#222222] border-b border-neutral-700 px-6 py-3.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  2. PILIH METODE PEMBAYARAN
                </h3>
              </div>

              <div className="p-6 space-y-3">
                {/* 1. QRIS */}
                <div
                  onClick={() => {
                    if (isAvailable) {
                      setPaymentCategory('qris');
                      setPaymentMethod('manual_qris');
                    }
                  }}
                  className={`p-4 rounded-none border-2 transition-all ${
                    !isAvailable ? 'opacity-50 cursor-not-allowed border-neutral-900 bg-[#111111]' :
                    paymentCategory === 'qris'
                      ? 'border-[#367723] bg-[#1c1c1c] ring-1 ring-[#367723] cursor-pointer'
                      : 'border-neutral-800 hover:border-neutral-700 bg-[#111111] cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white flex items-center gap-2.5">
                      <QrCode className="w-4 h-4 text-emerald-400" />
                      <span>QRIS Standar Nasional (GoPay, OVO, DANA, BCA, ShopeePay)</span>
                    </span>
                    <span className="font-mono font-bold text-xs text-emerald-400">
                      {formatIDR(product.price)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1 pl-6">
                    Scan instan dari seluruh aplikasi mobile banking dan e-wallet di Indonesia.
                  </p>
                </div>

                {/* 2. E-Wallet & Bank Transfer */}
                <div
                  onClick={() => {
                    if (isAvailable) {
                      setPaymentCategory('ewallet');
                      setPaymentMethod('xendit_invoice');
                    }
                  }}
                  className={`p-4 rounded-none border-2 transition-all ${
                    !isAvailable ? 'opacity-50 cursor-not-allowed border-neutral-900 bg-[#111111]' :
                    paymentCategory === 'ewallet'
                      ? 'border-[#367723] bg-[#1c1c1c] ring-1 ring-[#367723] cursor-pointer'
                      : 'border-neutral-800 hover:border-neutral-700 bg-[#111111] cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white flex items-center gap-2.5">
                      <Wallet className="w-4 h-4 text-cyan-400" />
                      <span>Virtual Account / Payment Gateway Otomatis</span>
                    </span>
                    <span className="font-mono font-bold text-xs text-cyan-400">
                      {formatIDR(product.price)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1 pl-6">
                    BCA, BRI, BNI, Mandiri Virtual Account dengan konfirmasi otomatis seketika.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Ringkasan Total & Tombol Beli */}
            <div className="bg-[#181818] border border-neutral-700/80 rounded-none shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-neutral-800">
                <span className="text-neutral-400">Total Tagihan:</span>
                <span className="text-xl font-mono font-black text-white">{formatIDR(product.price)}</span>
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
                🔒 Data transaksi dilindungi dengan enkripsi SSL 256-bit berstandar perbankan.
              </p>
            </div>

          </div>

        </form>
      </div>
    </div>
  );
}
