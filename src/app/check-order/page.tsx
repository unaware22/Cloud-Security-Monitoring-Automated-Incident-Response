'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  ShieldCheck,
  Calendar,
  CreditCard,
  Copy,
  ExternalLink,
  Package,
  Mail,
  Lock,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';

function CheckOrderContent() {
  const searchParams = useSearchParams();
  const prefilledCode = searchParams.get('order_code') || '';
  const prefilledEmail = searchParams.get('email') || '';

  const [orderCode, setOrderCode] = useState(prefilledCode);
  const [email, setEmail] = useState(prefilledEmail);

  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(true);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setOrderResult(null);

    if (!orderCode.trim()) {
      setErrorMessage('Harap masukkan Kode Transaksi');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/orders/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: orderCode.trim().toUpperCase(),
          email: email.trim().toLowerCase() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMessage(json.message || 'Pesanan tidak ditemukan. Periksa kembali kode transaksi Anda.');
        return;
      }

      setOrderResult(json.data);
    } catch {
      setErrorMessage('Terjadi gangguan jaringan saat memverifikasi pesanan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefilledCode) {
      handleLookup();
    }
  }, [prefilledCode]);

  const copyDeliveryData = (text: string, fieldName = 'all') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(fieldName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isPaid =
    orderResult?.payment_status === 'paid' ||
    orderResult?.payment_status === 'paid_manual' ||
    orderResult?.paymentStatus === 'paid' ||
    orderResult?.paymentStatus === 'paid_manual';

  // Parse delivery content into 3 structured boxes
  const rawDelivery = orderResult?.delivery_content || '';
  let accEmail = '';
  let accPassword = '';
  let accKeterangan = '';

  if (rawDelivery) {
    const parts = rawDelivery.split('|').map((p: string) => p.trim());
    for (const part of parts) {
      if (/^(email|username|user|akun)\s*:\s*/i.test(part)) {
        accEmail = part.replace(/^(email|username|user|akun)\s*:\s*/i, '').trim();
      } else if (/^(pass|password|pwd|kata sandi)\s*:\s*/i.test(part)) {
        accPassword = part.replace(/^(pass|password|pwd|kata sandi)\s*:\s*/i, '').trim();
      } else if (/^(keterangan|ket|info|detail|note|notes)\s*:\s*/i.test(part)) {
        accKeterangan = part.replace(/^(keterangan|ket|info|detail|note|notes)\s*:\s*/i, '').trim();
      } else {
        accKeterangan = accKeterangan ? `${accKeterangan} | ${part}` : part;
      }
    }

    if (!accEmail && !accPassword && !accKeterangan) {
      accKeterangan = rawDelivery;
    } else if (!accEmail && parts.length >= 1) {
      accEmail = parts[0];
      if (parts.length >= 2) accPassword = parts[1];
      if (parts.length >= 3) accKeterangan = parts.slice(2).join(' | ');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      {/* Top Banner */}
      <div className="text-center space-y-2">
        <h1 className="minecraft-font-folder text-2xl sm:text-3xl text-white tracking-wide">
          LACAK &amp; AMBIL PESANAN
        </h1>
        <p className="text-xs text-neutral-400 max-w-md mx-auto">
          Masukkan kode transaksi Anda untuk melihat status pembayaran dan mengambil data akun digital secara instan.
        </p>
      </div>

      {/* Lookup Card Form */}
      <div className="max-w-xl mx-auto rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-5">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
              Kode Transaksi *
            </label>
            <input
              type="text"
              required
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value.toUpperCase())}
              placeholder="Contoh: ORD-178715..."
              className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white font-mono text-sm placeholder-neutral-500 focus:outline-none focus:border-emerald-500 uppercase transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
              Email Pembeli (Opsional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-white text-sm placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-none bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 uppercase tracking-wider select-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>MEMERIKSA DATABASE...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>CARI DATA PESANAN</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Result Card */}
      {orderResult && (
        <div className="max-w-2xl mx-auto rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6 text-white animate-fadeIn">
          {/* Header Result */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-800 gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">
                Kode Transaksi
              </span>
              <h2 className="text-xl sm:text-2xl font-mono font-black text-white">
                {orderResult.order_code}
              </h2>
            </div>
            <div>
              <StatusBadge status={orderResult.payment_status} />
            </div>
          </div>

          {/* Product & Order Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Produk Dipesan</p>
              <p className="font-bold text-white text-sm">{orderResult.product_name}</p>
              <p className="text-neutral-400">Jumlah: {orderResult.quantity} unit</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Total Pembayaran</p>
              <p className="font-mono font-bold text-emerald-400 text-sm">{formatIDR(orderResult.total_amount)}</p>
              <p className="text-neutral-400">Metode: {orderResult.payment_method?.toUpperCase() || 'QRIS'}</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Email Pembeli</p>
              <p className="font-medium text-white">{orderResult.customer_email}</p>
              <p className="text-neutral-400">WhatsApp: {orderResult.customer_whatsapp || '-'}</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Waktu Transaksi</p>
              <p className="text-neutral-300">{formatDate(orderResult.created_at)}</p>
              <p className="text-neutral-400">Tipe Kirim: {orderResult.delivery_type || 'Otomatis'}</p>
            </div>
          </div>

          {/* Delivery Content (Secret Keys / Accounts - 3 Structured Boxes) */}
          {isPaid && orderResult.delivery_content ? (
            <div className="p-6 rounded-none bg-[#09172e] border-2 border-cyan-500 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                  <Key className="w-4 h-4 text-cyan-400" />
                  <span>DATA PENGIRIMAN DIGITAL (3 DETAIL AKUN)</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyDeliveryData(orderResult.delivery_content, 'all')}
                  className="px-3.5 py-1.5 rounded-none text-xs font-bold text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-2 border-[#b87e00] transition-all flex items-center gap-1.5 uppercase"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === 'all' ? 'TERSEDIA DI CLIPBOARD' : 'SALIN SEMUA'}</span>
                </button>
              </div>

              {/* 3 Structured Boxes */}
              <div className="space-y-3">
                {/* Box 1: Email / Username */}
                {accEmail && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        <span>1. Email / Username Akun</span>
                      </span>
                      <p className="font-mono text-sm sm:text-base text-cyan-200 font-bold select-all truncate">
                        {accEmail}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyDeliveryData(accEmail, 'email')}
                      className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                    >
                      {copiedKey === 'email' ? 'TERSALIN' : 'SALIN'}
                    </button>
                  </div>
                )}

                {/* Box 2: Password */}
                {accPassword && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>2. Password Akun</span>
                      </span>
                      <p className="font-mono text-sm sm:text-base text-amber-300 font-bold select-all truncate">
                        {showPassword ? accPassword : '••••••••••••••••'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-2 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 transition-all"
                        title={showPassword ? 'Sembunyikan Password' : 'Lihat Password'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyDeliveryData(accPassword, 'password')}
                        className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase transition-all"
                      >
                        {copiedKey === 'password' ? 'TERSALIN' : 'SALIN'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Box 3: Keterangan / Detail Lisensi */}
                {accKeterangan && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-emerald-400" />
                        <span>3. Keterangan / Detail Lisensi</span>
                      </span>
                      <p className="text-xs text-neutral-200 font-medium leading-relaxed select-all">
                        {accKeterangan}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyDeliveryData(accKeterangan, 'keterangan')}
                      className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                    >
                      {copiedKey === 'keterangan' ? 'TERSALIN' : 'SALIN'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Harap segera login, ganti password, dan amankan akun Anda di portal resmi.</span>
              </div>
            </div>
          ) : !isPaid ? (
            <div className="p-4 rounded-none bg-amber-950/60 border border-amber-600/40 text-amber-300 text-xs flex items-center justify-between gap-3">
              <span>Pesanan ini belum lunas atau sedang menunggu konfirmasi pembayaran.</span>
              <Link
                href={`/payment/${orderResult.order_code}`}
                className="px-4 py-2 rounded-none text-xs font-bold text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-2 border-[#b87e00] whitespace-nowrap uppercase"
              >
                Bayar Sekarang &rarr;
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function CheckOrderPage() {
  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      }>
        <CheckOrderContent />
      </Suspense>
    </div>
  );
}
