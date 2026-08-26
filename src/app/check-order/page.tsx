'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
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
  Sparkles,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';
import { parseDeliveryContent, ParsedDeliveryItem } from '@/lib/delivery-parser';

function CheckOrderContent() {
  const searchParams = useSearchParams();
  const prefilledCode = searchParams.get('order_code') || '';
  const prefilledEmail = searchParams.get('email') || '';
  const statusParam = searchParams.get('status') || '';

  const [orderCode, setOrderCode] = useState(prefilledCode);
  const [email, setEmail] = useState(prefilledEmail);

  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(true);

  // Polling state for post-payment redirect
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFromPayment = statusParam === 'paid';

  const handleLookup = async (e?: React.FormEvent, silent = false) => {
    if (e) e.preventDefault();
    if (!silent) {
      setErrorMessage('');
      setOrderResult(null);
    }

    const code = orderCode.trim().toUpperCase();
    if (!code) {
      if (!silent) setErrorMessage('Harap masukkan Kode Transaksi');
      return;
    }

    if (!silent) setLoading(true);

    try {
      const res = await fetch('/api/orders/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: code,
          email: email.trim().toLowerCase() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (!silent) setErrorMessage(json.message || 'Pesanan tidak ditemukan. Periksa kembali kode transaksi Anda.');
        return;
      }

      setOrderResult(json.data);

      // Check if payment is confirmed - stop polling if so
      const payStatus = json.data?.payment_status;
      if (payStatus === 'paid' || payStatus === 'paid_manual') {
        stopPolling();
      }
    } catch {
      if (!silent) setErrorMessage('Terjadi gangguan jaringan saat memverifikasi pesanan.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  // Start polling when redirected from Xendit payment
  const startPaymentPolling = () => {
    setIsPolling(true);
    setPollCount(0);

    // Poll every 2 seconds for up to 30 attempts (60 seconds)
    pollIntervalRef.current = setInterval(() => {
      setPollCount((prev) => {
        const newCount = prev + 1;
        if (newCount >= 30) {
          stopPolling();
          return newCount;
        }
        return newCount;
      });
      handleLookup(undefined, true);
    }, 2000);
  };

  // Auto-lookup on mount if order_code is prefilled
  useEffect(() => {
    if (prefilledCode) {
      handleLookup();

      // If coming from Xendit payment redirect, start polling for delivery data
      if (isFromPayment) {
        // Small delay to let the initial lookup complete
        setTimeout(() => {
          startPaymentPolling();
        }, 1500);
      }
    }

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Parse delivery content into structured boxes (supporting multi-line / multi-unit accounts)
  const rawDelivery =
    orderResult?.delivery_content ||
    orderResult?.digital_delivery?.content ||
    orderResult?.deliveryContent ||
    '';

  const productName =
    orderResult?.product_name ||
    orderResult?.items?.[0]?.product_name ||
    'Produk Digital';

  const quantity = orderResult?.quantity || orderResult?.items?.[0]?.quantity || 1;
  const customerWhatsapp = orderResult?.customer_whatsapp || orderResult?.customer_phone || '-';

  const parsedAccounts: ParsedDeliveryItem[] = parseDeliveryContent(rawDelivery).slice(0, quantity);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Payment Success Banner (shown when redirected from Xendit) */}
      {isFromPayment && isPaid && (
        <div className="p-5 rounded-none bg-emerald-950/70 border-2 border-emerald-500 shadow-2xl flex items-start gap-4 animate-fadeIn">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-300">
              🎉 PEMBAYARAN BERHASIL!
            </h2>
            <p className="text-xs text-emerald-200/80">
              Pembayaran Anda telah terverifikasi. Data akun digital telah disiapkan di bawah ini. Silakan salin dan amankan data akun Anda.
            </p>
          </div>
        </div>
      )}

      {/* Polling/Waiting Banner (shown when waiting for webhook to process) */}
      {isFromPayment && !isPaid && isPolling && (
        <div className="p-5 rounded-none bg-amber-950/60 border-2 border-amber-500 shadow-2xl flex items-start gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 text-amber-400 flex-shrink-0 animate-spin mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-amber-300">
              ⏳ MEMVERIFIKASI PEMBAYARAN...
            </h2>
            <p className="text-xs text-amber-200/80">
              Sistem sedang memverifikasi pembayaran Anda dari Midtrans. Halaman ini akan otomatis memperbarui dalam beberapa detik...
            </p>
            <div className="w-full bg-amber-900/50 rounded-full h-1.5 mt-2">
              <div
                className="bg-amber-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((pollCount / 30) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Payment Failed Banner */}
      {statusParam === 'failed' && (
        <div className="p-5 rounded-none bg-rose-950/70 border-2 border-rose-500 shadow-2xl flex items-start gap-4">
          <AlertCircle className="w-8 h-8 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h2 className="text-sm font-black uppercase tracking-wider text-rose-300">
              PEMBAYARAN GAGAL / DIBATALKAN
            </h2>
            <p className="text-xs text-rose-200/80">
              Pembayaran Anda tidak berhasil atau telah dibatalkan. Silakan coba lagi atau hubungi customer service kami.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-none bg-[#181818] text-[#38bdf8] border border-cyan-900/60 text-xs font-bold shadow-sm">
          <Key className="w-3.5 h-3.5 text-cyan-400" />
          <span>SALADIN ORDER TRACKER</span>
        </div>
        <h1 className="minecraft-font-folder text-2xl sm:text-3xl text-white tracking-wide font-normal">
          LACAK &amp; AMBIL PESANAN
        </h1>
        <p className="text-xs sm:text-sm text-neutral-300 max-w-md mx-auto leading-relaxed">
          Masukkan kode transaksi dan email Anda untuk melihat status pesanan dan mengambil data akun digital yang telah disiapkan.
        </p>
      </div>

      {/* Lookup Card Form */}
      <div className="max-w-xl mx-auto rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-5">
        <form onSubmit={(e) => handleLookup(e)} className="space-y-4">
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
              <p className="font-bold text-white text-sm">{productName}</p>
              <p className="text-neutral-400">Jumlah: {quantity} unit</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Total Pembayaran</p>
              <p className="font-mono font-bold text-emerald-400 text-sm">{formatIDR(orderResult.total_amount)}</p>
              <p className="text-neutral-400">Metode: {orderResult.payment_method?.toUpperCase() || 'QRIS'}</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Email Pembeli</p>
              <p className="font-medium text-white">{orderResult.customer_email}</p>
              <p className="text-neutral-400">WhatsApp: {customerWhatsapp}</p>
            </div>

            <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Waktu Transaksi</p>
              <p className="text-neutral-300">{formatDate(orderResult.created_at)}</p>
              <p className="text-neutral-400">Tipe Kirim: {orderResult.delivery_type || 'Otomatis'}</p>
            </div>
          </div>

          {/* Delivery Content / Custom Skin Details */}
          {isPaid && (orderResult.custom_skin_details || orderResult.delivery_type === 'manual' || orderResult.product_name?.toLowerCase().includes('skin')) ? (
            <div className="space-y-4">
              {/* Custom Skin Status Card */}
              <div className="p-6 rounded-none bg-[#09172e] border-2 border-sky-500 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-sky-500/30 pb-3">
                  <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-400">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>STATUS PEMBUATAN SKIN CUSTOM</span>
                  </span>
                  {orderResult.delivery_status === 'delivered' ? (
                    <span className="px-2.5 py-1 text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      SELESAI (TERKIRIM)
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1.5">
                      <span>SEDANG DIKERJAKAN (~5 MENIT)</span>
                    </span>
                  )}
                </div>

                {orderResult.delivery_status === 'delivered' ? (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-200">
                      🎉 Skin custom Anda telah selesai! Silakan unduh file skin di bawah ini:
                    </p>
                    <div className="p-4 bg-black/60 border border-emerald-500/40 space-y-2">
                      <p className="font-mono text-xs text-neutral-200 break-all">{rawDelivery}</p>
                      {rawDelivery.includes('http') && (
                        <a
                          href={rawDelivery.match(/https?:\/\/[^\s|]+/)?.[0] || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#ffc825] text-black font-black text-xs uppercase tracking-wider border-b-2 border-[#b87e00] mt-2"
                        >
                          <span>Unduh File Skin (.PNG)</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-black/40 border border-sky-500/20 rounded-none space-y-1.5 text-xs text-neutral-300">
                    <p className="font-bold text-sky-300">💬 Pengiriman via WhatsApp &amp; Email</p>
                    <p className="text-[11px] leading-relaxed">
                      Desainer kami sedang merancang skin impian Anda (estimasi waktu pembuatan ~5 menit). Hasil file skin (.PNG) akan dikirimkan langsung ke Email <strong>{orderResult.customer_email}</strong> dan nomor WhatsApp <strong>{customerWhatsapp}</strong>.
                    </p>
                  </div>
                )}
              </div>

              {/* Rincian Desain Skin Box */}
              {orderResult.custom_skin_details && (
                <div className="bg-[#111111] border border-neutral-800 p-5 space-y-3 text-xs">
                  <p className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rincian Spesifikasi Skin yang Diminta:</span>
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 bg-black/50 border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Ukuran:</span>
                      <span className="font-mono font-bold text-sky-400">
                        {orderResult.custom_skin_details.skinSize === '32x32' ? '32×32 px' : '64×64 px'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-black/50 border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Model:</span>
                      <span className="font-bold text-purple-400">
                        {orderResult.custom_skin_details.skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}
                      </span>
                    </div>
                  </div>

                  {orderResult.custom_skin_details.referenceImageUrl && (
                    <div className="p-2.5 bg-black/50 border border-neutral-800 space-y-1.5">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Gambar Referensi:</span>
                      <img
                        src={orderResult.custom_skin_details.referenceImageUrl}
                        alt="Referensi"
                        className="w-20 h-20 object-cover rounded border border-neutral-700"
                      />
                    </div>
                  )}

                  {orderResult.custom_skin_details.description && (
                    <div className="p-2.5 bg-black/50 border border-neutral-800 space-y-1">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase block">Deskripsi:</span>
                      <pre className="font-mono text-[11px] text-neutral-300 whitespace-pre-wrap max-h-36 overflow-y-auto">
                        {orderResult.custom_skin_details.description}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isPaid && rawDelivery ? (
            <div className="p-6 rounded-none bg-[#09172e] border-2 border-cyan-500 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-cyan-500/30">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                  <Key className="w-4 h-4 text-cyan-400" />
                  <span>DATA PENGIRIMAN DIGITAL ({parsedAccounts.length} ITEM)</span>
                </div>
                <button
                  type="button"
                  onClick={() => copyDeliveryData(rawDelivery, 'all')}
              className="px-3.5 py-1.5 rounded-none text-xs font-bold text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-2 border-[#b87e00] transition-all flex items-center justify-center gap-1.5 uppercase self-start sm:self-auto"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === 'all' ? 'TERSEDIA DI CLIPBOARD' : 'SALIN SEMUA'}</span>
                </button>
              </div>

              {/* Render each Delivery Item by Category */}
              <div className="space-y-4">
                {parsedAccounts.map((item, accIdx) => (
                  <div key={accIdx} className="space-y-4">
                    
                    {/* ================= CATEGORY 1: AKUN GAME (Email + Password + Catatan) ================= */}
                    {item.category === 'account' && (
                      <div className="space-y-3.5 p-4 rounded-none bg-black/60 border border-emerald-500/40 shadow-lg">
                        {parsedAccounts.length > 1 && (
                          <div className="flex items-center justify-end pb-1 border-b border-emerald-950">
                            <span className="text-[10px] text-neutral-400 font-mono">Unit #{accIdx + 1}</span>
                          </div>
                        )}

                        {/* 1. Email / Username */}
                        {item.email && (
                          <div className="p-3.5 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                            <div className="space-y-1 overflow-hidden">
                              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Email / Username Akun</span>
                              </span>
                              <p className="font-mono text-xs sm:text-sm text-cyan-200 font-bold select-all truncate">
                                {item.email}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyDeliveryData(item.email || '', `email-${accIdx}`)}
                              className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                            >
                              {copiedKey === `email-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                            </button>
                          </div>
                        )}

                        {/* 2. Password */}
                        {item.password && (
                          <div className="p-3.5 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                            <div className="space-y-1 overflow-hidden">
                              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                                <span>Password Akun</span>
                              </span>
                              <p className="font-mono text-xs sm:text-sm text-amber-300 font-bold select-all truncate">
                                {showPassword ? item.password : '••••••••••••••••'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="p-1.5 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 transition-all"
                                title={showPassword ? 'Sembunyikan Password' : 'Lihat Password'}
                              >
                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyDeliveryData(item.password || '', `password-${accIdx}`)}
                                className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase transition-all"
                              >
                                {copiedKey === `password-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3. Catatan */}
                        {item.notes && (
                          <div className="p-3 bg-[#111111] border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <span className="font-semibold text-neutral-200">Catatan: </span>
                              <span>{item.notes}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ================= CATEGORY 2: KODE REDEEM (1 Single Box Kode + Catatan Bawah) ================= */}
                    {item.category === 'redeem_code' && (
                      <div className="space-y-3.5 p-4 rounded-none bg-black/60 border border-amber-500/40 shadow-lg">
                        {parsedAccounts.length > 1 && (
                          <div className="flex items-center justify-end pb-1 border-b border-amber-950">
                            <span className="text-[10px] text-neutral-400 font-mono">Unit #{accIdx + 1}</span>
                          </div>
                        )}

                        {/* 1. Kode Redeem (1 Kotak Kode Utama) */}
                        {item.code && (
                          <div className="p-3.5 rounded-none bg-black/80 border border-amber-500/50 flex items-center justify-between gap-3 shadow-inner">
                            <div className="space-y-1 overflow-hidden">
                              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Key className="w-3.5 h-3.5 text-amber-400" />
                                <span>Kode Redeem / Lisensi</span>
                              </span>
                              <p className="font-mono text-xs sm:text-sm text-amber-300 font-bold select-all truncate">
                                {item.code}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyDeliveryData(item.code || '', `code-${accIdx}`)}
                              className="px-3 py-1.5 rounded-none bg-amber-950 hover:bg-amber-900 border border-amber-500/60 text-amber-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                            >
                              {copiedKey === `code-${accIdx}` ? 'TERSALIN' : 'SALIN KODE'}
                            </button>
                          </div>
                        )}

                        {/* 2. Catatan / Panduan Redeem (Teks Panduan Rapi) */}
                        {item.notes && (
                          <div className="p-3 bg-[#111111] border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <span className="font-semibold text-white">Panduan Redeem: </span>
                              <span>{item.notes}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ================= CATEGORY 3: ROBLOX (Add Username + Link Private Server + Catatan) ================= */}
                    {item.category === 'roblox' && (
                      <div className="space-y-3.5 p-4 rounded-none bg-black/60 border border-cyan-500/50 shadow-lg">
                        {parsedAccounts.length > 1 && (
                          <div className="flex items-center justify-end pb-1 border-b border-cyan-950">
                            <span className="text-[10px] text-neutral-400 font-mono">Item #{accIdx + 1}</span>
                          </div>
                        )}

                        {/* 1. Username Roblox Admin */}
                        {item.robloxUsername && (
                          <div className="p-3.5 rounded-none bg-black/80 border border-amber-500/50 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="space-y-1 overflow-hidden">
                                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                  <Key className="w-3.5 h-3.5 text-amber-400" />
                                  <span>1. Username Roblox Penjual (Wajib Di-Add)</span>
                                </span>
                                <p className="font-mono text-xs sm:text-sm text-amber-300 font-bold select-all truncate">
                                  {item.robloxUsername}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyDeliveryData(item.robloxUsername || '', `roblox-user-${accIdx}`)}
                                className="px-3 py-1.5 rounded-none bg-amber-950 hover:bg-amber-900 border border-amber-500/60 text-amber-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                              >
                                {copiedKey === `roblox-user-${accIdx}` ? 'TERSALIN' : 'SALIN USERNAME'}
                              </button>
                            </div>
                            <p className="text-[10px] text-neutral-400">
                              *Silakan search dan kirim pertemanan (add friend) ke username Roblox di atas.
                            </p>
                          </div>
                        )}

                        {/* 2. Link World Private Server Roblox */}
                        {item.privateServerUrl && (
                          <div className="p-3.5 rounded-none bg-black/80 border border-cyan-500/50 flex items-center justify-between gap-3">
                            <div className="space-y-1 overflow-hidden">
                              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                                <span>2. Link World Private Server</span>
                              </span>
                              <p className="font-mono text-xs text-sky-300 select-all truncate">
                                {item.privateServerUrl}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <a
                                href={item.privateServerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-none bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold uppercase flex items-center justify-center gap-1 transition-all shadow-md"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Buka Server</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => copyDeliveryData(item.privateServerUrl || '', `roblox-link-${accIdx}`)}
                                className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase transition-all"
                              >
                                {copiedKey === `roblox-link-${accIdx}` ? 'TERSALIN' : 'SALIN LINK'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3. Catatan / Petunjuk Trade */}
                        {item.notes && (
                          <div className="p-3 bg-[#111111] border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
                            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <span className="font-semibold text-neutral-200">Petunjuk Trade: </span>
                              <span>{item.notes}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Harap segera klaim atau ikuti petunjuk pengiriman produk digital Anda di atas.</span>
              </div>
            </div>
          ) : isPaid && !rawDelivery && isPolling ? (
            <div className="p-5 rounded-none bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-amber-400 flex-shrink-0" />
              <span>Menunggu data akun digital dari sistem... Halaman akan otomatis diperbarui.</span>
            </div>
          ) : !isPaid ? (
            <div className="p-4 rounded-none bg-amber-950/60 border border-amber-600/40 text-amber-300 text-xs flex items-center justify-between gap-3">
              <span>Pesanan ini belum lunas atau sedang menunggu konfirmasi pembayaran.</span>
              {orderResult.payment_url && (
                <a
                  href={orderResult.payment_url}
                  className="px-4 py-2 rounded-none text-xs font-bold text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-2 border-[#b87e00] whitespace-nowrap uppercase"
                >
                  Bayar Sekarang &rarr;
                </a>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function CheckOrderPage() {
  return (
    <div className="min-h-screen bg-[#111111] text-white pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      }>
        <CheckOrderContent />
      </Suspense>
    </div>
  );
}
