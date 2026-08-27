'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  Copy,
  Info,
  Eye,
  EyeOff,
  Check,
  Radio,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Download,
  Clock,
  MessageSquare,
  Palette,
  Image as ImageIcon,
} from 'lucide-react';
import { formatIDR, formatDate } from '@/lib/utils';

interface CustomSkinDetails {
  description?: string;
  skinSize?: string;
  skinModel?: string;
  referenceImageUrl?: string | null;
}

interface OrderData {
  order_id?: string;
  order_code: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_whatsapp?: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  delivery_status: string;
  delivery_type?: string;
  payment_method?: string;
  payment_url?: string | null;
  product_name?: string;
  quantity?: number;
  created_at?: string;
  paid_at?: string | null;
  delivery_content?: string | null;
  customer_notes?: string | null;
  custom_skin_details?: CustomSkinDetails | null;
}

import { parseDeliveryContent, ParsedDeliveryItem } from '@/lib/delivery-parser';

export default function OrderSuccessPage({
  params,
}: {
  params: { orderCode: string };
}) {
  const orderCode = params.orderCode;
  const searchParams = useSearchParams();
  const isFailedParam = searchParams.get('status') === 'failed';

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAndVerifyOrder = async (isManual = false) => {
    if (isManual) setLoading(true);

    try {
      const res = await fetch('/api/orders/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_code: orderCode }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOrder(json.data);
        setErrorMsg('');

        if (
          json.data.payment_status === 'paid' ||
          json.data.payment_status === 'settlement' ||
          json.data.payment_status === 'capture' ||
          json.data.payment_status === 'paid_manual' ||
          json.data.order_status === 'completed'
        ) {
          setPolling(false);
        }
      } else if (!order) {
        setErrorMsg(json.error || 'Pesanan tidak ditemukan');
      }
    } catch {
      if (!order) setErrorMsg('Gagal memuat status pesanan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndVerifyOrder();
    const quickTimer = setTimeout(() => {
      fetchAndVerifyOrder();
    }, 800);
    return () => clearTimeout(quickTimer);
  }, [orderCode]);

  useEffect(() => {
    if (!polling) return;

    pollTimerRef.current = setInterval(() => {
      setPollAttempts((prev) => {
        if (prev >= 60) {
          setPolling(false);
          return prev;
        }
        fetchAndVerifyOrder();
        return prev + 1;
      });
    }, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [polling, orderCode]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isPaid =
    order?.payment_status === 'paid' ||
    order?.payment_status === 'settlement' ||
    order?.payment_status === 'capture' ||
    order?.payment_status === 'paid_manual' ||
    order?.order_status === 'completed' ||
    order?.delivery_status === 'delivered' ||
    order?.order_status === 'processing';

  const isCustomSkin =
    order?.custom_skin_details != null ||
    order?.delivery_type === 'manual' ||
    order?.product_name?.toLowerCase().includes('skin');

  const isDelivered = order?.delivery_status === 'delivered';

  const qty = order?.quantity || 1;
  const rawDelivery = order?.delivery_content || '';
  const parsedAccounts: ParsedDeliveryItem[] = parseDeliveryContent(rawDelivery).slice(0, qty);

  return (
    <div className="min-h-screen bg-[#111111] text-white flex flex-col justify-between selection:bg-[#367723] selection:text-white">
      
      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

        {/* Initial Loading Screen */}
        {loading && !order && (
          <div className="p-12 rounded-none bg-[#181818] border border-neutral-700 text-center space-y-4 shadow-2xl">
            <Loader2 className="w-10 h-10 text-[#367723] animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Memeriksa Pembayaran</h2>
            <p className="text-xs text-neutral-400">Menghubungkan ke gateway pembayaran...</p>
          </div>
        )}

        {/* Error Screen */}
        {errorMsg && !order && (
          <div className="p-8 rounded-none bg-[#181818] border border-rose-600/60 text-center space-y-4 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Pesanan Tidak Ditemukan</h2>
            <p className="text-xs text-neutral-400">{errorMsg}</p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/check-order"
                className="px-5 py-2.5 rounded-none text-xs font-semibold bg-[#111111] hover:bg-neutral-800 border border-neutral-700 text-white uppercase"
              >
                Cari Pesanan Manual
              </Link>
              <Link
                href="/"
                className="px-5 py-2.5 rounded-none text-xs font-bold bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white uppercase"
              >
                Kembali ke Toko
              </Link>
            </div>
          </div>
        )}

        {order && (
          <>
            {/* ================= SUCCESS / PAID STATE ================= */}
            {isPaid ? (
              <div className="space-y-6 animate-fadeIn">
                
                {/* 1. Top Success Badge & Titles */}
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-none bg-[#181818] border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    Pembayaran Berhasil!
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-400 max-w-sm mx-auto">
                    {isCustomSkin
                      ? 'Pembayaran telah dikonfirmasi. Skin impian Anda sedang dalam antrean pengerjaan.'
                      : 'Transaksi berhasil. Data aset digital Anda telah siap di bawah ini.'}
                  </p>
                </div>

                {/* ================= SPECIAL CUSTOM SKIN PROCESSING / DELIVERY CARD ================= */}
                {isCustomSkin ? (
                  <div className="space-y-6">
                    {/* Status Pengerjaan Banner */}
                    <div className="p-6 rounded-none bg-[#09172e] border-2 border-sky-500 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-sky-500/30 pb-3">
                        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-400">
                          <Palette className="w-4 h-4 text-sky-400" />
                          <span>Status Pembuatan Skin</span>
                        </span>
                        
                        {isDelivered ? (
                          <span className="px-2.5 py-1 text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            SELESAI (TERKIRIM)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>SEDANG DIBUAT (~5 MENIT)</span>
                          </span>
                        )}
                      </div>

                      {isDelivered ? (
                        <div className="space-y-3">
                          <p className="text-xs text-emerald-200 leading-relaxed">
                            🎉 Skin custom Anda telah selesai dibuat oleh desainer! Silakan unduh file skin (.PNG) di bawah ini:
                          </p>
                          <div className="p-4 bg-black/60 border border-emerald-500/40 space-y-2">
                            <p className="font-mono text-xs text-neutral-200 break-all">{order.delivery_content}</p>
                            {order.delivery_content?.includes('http') && (
                              <a
                                href={order.delivery_content.match(/https?:\/\/[^\s|]+/)?.[0] || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#ffc825] text-black font-black text-xs uppercase tracking-wider border-b-2 border-[#b87e00] mt-2"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Unduh File Skin (.PNG)</span>
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
                          <div className="p-3.5 bg-black/40 border border-sky-500/20 rounded-none space-y-2">
                            <div className="flex items-center gap-2 text-sky-300 font-bold">
                              <MessageSquare className="w-4 h-4 text-sky-400" />
                              <span>Pengiriman ke WhatsApp &amp; Email</span>
                            </div>
                            <p className="text-[11px] text-neutral-300">
                              Tim desainer SALADINSHOP sedang merancang skin impian Anda (estimasi waktu pembuatan ~5 menit). Hasil file skin (.PNG resolusi tinggi) akan otomatis dikirimkan ke Email <strong>{order.customer_email}</strong> dan nomor WhatsApp <strong>{order.customer_phone || order.customer_whatsapp}</strong>.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submitted Custom Skin Specs Card */}
                    {order.custom_skin_details && (
                      <div className="bg-[#181818] border border-neutral-700/80 rounded-none p-6 space-y-4 shadow-xl text-xs">
                        <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <span>Rincian Desain Skin yang Dipesan</span>
                        </h2>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-[#111111] border border-neutral-800">
                            <span className="text-[10px] text-neutral-400 block font-bold uppercase">Ukuran Skin</span>
                            <span className="font-mono font-bold text-sky-400 text-sm">
                              {order.custom_skin_details.skinSize === '32x32' ? '32×32 px' : '64×64 px'}
                            </span>
                            <span className="text-[10px] text-neutral-500 block">Java &amp; Bedrock</span>
                          </div>

                          <div className="p-3 bg-[#111111] border border-neutral-800">
                            <span className="text-[10px] text-neutral-400 block font-bold uppercase">Model Skin</span>
                            <span className="font-bold text-purple-400 text-sm">
                              {order.custom_skin_details.skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}
                            </span>
                            <span className="text-[10px] text-neutral-500 block">
                              {order.custom_skin_details.skinModel === 'slim' ? '3-Pixel Arm' : '4-Pixel Arm'}
                            </span>
                          </div>
                        </div>

                        {order.custom_skin_details.referenceImageUrl && (
                          <div className="p-3 bg-[#111111] border border-neutral-800 space-y-2">
                            <span className="text-[10px] text-neutral-400 block font-bold uppercase flex items-center gap-1">
                              <ImageIcon className="w-3 h-3 text-emerald-400" />
                              <span>Gambar Referensi</span>
                            </span>
                            <div className="w-24 h-24 rounded overflow-hidden border border-neutral-700 bg-neutral-900">
                              <img
                                src={order.custom_skin_details.referenceImageUrl}
                                alt="Referensi Skin"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </div>
                        )}

                        {order.custom_skin_details.description && (
                          <div className="p-3 bg-[#111111] border border-neutral-800 space-y-1.5">
                            <span className="text-[10px] text-neutral-400 block font-bold uppercase">
                              Deskripsi Skin Impian:
                            </span>
                            <pre className="font-mono text-[11px] text-neutral-200 whitespace-pre-wrap bg-black/50 p-2.5 rounded border border-neutral-800 max-h-48 overflow-y-auto">
                              {order.custom_skin_details.description}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ================= 3 STANDARDIZED DIGITAL DELIVERY CATEGORIES ================= */
                  <div className="bg-[#181818] border border-neutral-700/80 rounded-none p-6 space-y-5 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                      <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                        <Key className="w-5 h-5 text-emerald-400" />
                        <span>Data Pengiriman Produk Digital</span>
                      </h2>
                    </div>

                    {parsedAccounts.map((item, accIdx) => (
                      <div key={accIdx} className="space-y-4">
                        
                        {/* ================= CATEGORY 1: AKUN GAME (Email + Password + Catatan) ================= */}
                        {item.category === 'account' && (
                          <div className="space-y-3.5 p-4 rounded-none bg-black/50 border border-emerald-500/30">
                            {parsedAccounts.length > 1 && (
                              <div className="flex items-center justify-end pb-1 border-b border-emerald-950">
                                <span className="text-[10px] text-neutral-400 font-mono">Unit #{accIdx + 1}</span>
                              </div>
                            )}

                            {/* 1. Email / Username */}
                            {item.email && (
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                                  EMAIL / USERNAME AKUN
                                </label>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-[#111111] border border-neutral-700 rounded-none px-4 py-3 text-white font-mono text-xs sm:text-sm flex items-center select-all overflow-hidden truncate">
                                    {item.email}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(item.email || '', `email-${accIdx}`)}
                                    className="px-4 py-2.5 rounded-none bg-[#222222] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                                  >
                                    {copiedKey === `email-${accIdx}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Tersalin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Salin</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* 2. Password */}
                            {item.password && (
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 block">
                                  PASSWORD AKUN
                                </label>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-[#111111] border border-neutral-700 rounded-none px-4 py-3 text-white font-mono text-xs sm:text-sm flex items-center justify-between overflow-hidden">
                                    <span className="truncate select-all">
                                      {showPassword ? item.password : '••••••••••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setShowPassword(!showPassword)}
                                      className="text-neutral-400 hover:text-white transition-colors pl-2"
                                    >
                                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-emerald-400" />}
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(item.password || '', `password-${accIdx}`)}
                                    className="px-4 py-2.5 rounded-none bg-[#222222] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                                  >
                                    {copiedKey === `password-${accIdx}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Tersalin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Salin</span>
                                      </>
                                    )}
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
                          <div className="space-y-3.5 p-4 rounded-none bg-black/50 border border-amber-500/30">
                            {parsedAccounts.length > 1 && (
                              <div className="flex items-center justify-end pb-1 border-b border-amber-950">
                                <span className="text-[10px] text-neutral-400 font-mono">Unit #{accIdx + 1}</span>
                              </div>
                            )}

                            {/* 1. Kode Redeem / Lisensi (1 Data Box Utama) */}
                            {item.code && (
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5 block">
                                  KODE REDEEM / LISENSI
                                </label>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-[#111111] border border-amber-500/60 rounded-none px-4 py-3 text-amber-300 font-mono text-xs sm:text-sm font-bold flex items-center select-all overflow-hidden truncate shadow-inner">
                                    {item.code}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(item.code || '', `code-${accIdx}`)}
                                    className="px-4 py-2.5 rounded-none bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                                  >
                                    {copiedKey === `code-${accIdx}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Tersalin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Salin Kode</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* 2. Catatan / Link Penukaran (Format Panduan Teks) */}
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
                          <div className="space-y-3.5 p-4 rounded-none bg-black/50 border border-cyan-500/40">
                            {parsedAccounts.length > 1 && (
                              <div className="flex items-center justify-end pb-1 border-b border-cyan-950">
                                <span className="text-[10px] text-neutral-400 font-mono">Item #{accIdx + 1}</span>
                              </div>
                            )}

                            {/* 1. Catatan Instruksi Add Username Roblox */}
                            {item.robloxUsername && (
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1.5 block">
                                  1. USERNAME ROBLOX PENJUAL (WAJIB DI-ADD)
                                </label>
                                <div className="flex gap-2">
                                  <div className="flex-1 bg-[#111111] border border-amber-500/50 rounded-none px-4 py-3 text-amber-300 font-mono text-xs sm:text-sm font-bold flex items-center select-all overflow-hidden truncate">
                                    {item.robloxUsername}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(item.robloxUsername || '', `roblox-user-${accIdx}`)}
                                    className="px-4 py-2.5 rounded-none bg-[#222222] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                                  >
                                    {copiedKey === `roblox-user-${accIdx}` ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Tersalin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Salin Username</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <p className="text-[10px] text-neutral-400 mt-1">
                                  *Silakan cari dan kirim pertemanan (add friend) ke username Roblox di atas.
                                </p>
                              </div>
                            )}

                            {/* 2. Link World Private Server */}
                            {item.privateServerUrl && (
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1.5 block">
                                  2. LINK WORLD PRIVATE SERVER ROBLOX
                                </label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <div className="flex-1 bg-[#111111] border border-cyan-500/40 rounded-none px-4 py-3 text-sky-300 font-mono text-xs flex items-center select-all overflow-hidden truncate">
                                    {item.privateServerUrl}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={item.privateServerUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-4 py-2.5 rounded-none bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md flex-shrink-0"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span>Buka Server</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(item.privateServerUrl || '', `roblox-link-${accIdx}`)}
                                      className="px-4 py-2.5 rounded-none bg-[#222222] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
                                    >
                                      {copiedKey === `roblox-link-${accIdx}` ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                                          <span className="text-emerald-400">Tersalin</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>Salin Link</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 3. Catatan Trade */}
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

                    <div className="bg-[#111111] border border-neutral-700 rounded-none p-3.5 text-xs text-neutral-300 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        Harap segera simpan data produk digital Anda atau ikuti petunjuk pengiriman di atas. Bukti transaksi dan detail ini juga telah dikirimkan ke email Anda.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. Order Summary Card */}
                <div className="bg-[#181818] border border-neutral-700/80 rounded-none p-6 space-y-4 shadow-xl">
                  <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">
                    Ringkasan Transaksi
                  </h2>

                  <div className="space-y-3.5 text-xs sm:text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 font-medium">Kode Transaksi</span>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-[#111111] border border-neutral-700 rounded-none px-2.5 py-1 text-xs font-mono text-neutral-200 font-semibold">
                          {order.order_code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(order.order_code, 'order_code')}
                          className="p-1 rounded-none bg-[#111111] hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                          title="Salin Kode Transaksi"
                        >
                          {copiedKey === 'order_code' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <span className="text-neutral-400 font-medium">Produk</span>
                      <span className="font-semibold text-white text-right">
                        {order.product_name || 'Custom Skin Minecraft HD 3D'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400 font-medium">Waktu Transaksi</span>
                      <span className="text-neutral-300">
                        {formatDate(order.paid_at || order.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-neutral-800">
                      <span className="text-neutral-400 font-medium">Total Pembayaran</span>
                      <span className="text-lg sm:text-xl font-mono font-bold text-emerald-400">
                        {formatIDR(order.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <Link
                    href="/"
                    className="py-3.5 px-6 rounded-none font-black text-xs sm:text-sm uppercase tracking-wider bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white text-center shadow-xl transition-all flex items-center justify-center gap-2 active:border-b-0 active:translate-y-1 select-none"
                  >
                    Kembali ke Toko
                  </Link>

                  <Link
                    href="/check-order"
                    className="py-3.5 px-6 rounded-none font-bold text-xs sm:text-sm uppercase tracking-wider bg-[#181818] hover:bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-white text-center transition-all flex items-center justify-center gap-2 select-none"
                  >
                    Lacak Pesanan
                  </Link>
                </div>

              </div>
            ) : isFailedParam || order.payment_status === 'failed' || order.payment_status === 'expired' ? (
              /* ================= FAILED STATE ================= */
              <div className="space-y-6 animate-fadeIn">
                <div className="p-8 rounded-none bg-[#181818] border border-rose-500/60 text-center space-y-4 shadow-2xl">
                  <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
                  <h1 className="text-2xl font-bold text-white uppercase tracking-wider">Pembayaran Dibatalkan / Gagal</h1>
                  <p className="text-xs text-rose-200 max-w-md mx-auto leading-relaxed">
                    Transaksi dengan kode <span className="font-mono font-bold text-white">{order.order_code}</span> belum terselesaikan di Xendit.
                  </p>

                  <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3">
                    {order.payment_url && (
                      <a
                        href={order.payment_url}
                        className="px-6 py-3.5 rounded-none text-xs font-black uppercase tracking-wider bg-[#ffc825] hover:bg-[#ffcf3d] border-b-4 border-[#b87e00] text-black"
                      >
                        Buka Kembali Halaman Xendit &rarr;
                      </a>
                    )}
                    <Link
                      href="/"
                      className="px-6 py-3.5 rounded-none text-xs font-semibold uppercase tracking-wider bg-[#111111] hover:bg-neutral-800 border border-neutral-700 text-white"
                    >
                      Pilih Produk Lain
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              /* ================= PENDING / VERIFYING STATE ================= */
              <div className="space-y-6 animate-fadeIn">
                <div className="p-8 sm:p-10 rounded-none bg-[#181818] border border-neutral-700 shadow-2xl text-center space-y-6">
                  
                  {/* Radar Animation */}
                  <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-none border-2 border-[#367723]/40 animate-ping" />
                    <div className="absolute inset-2 rounded-none border-2 border-[#367723]/70 animate-pulse" />
                    <div className="w-12 h-12 rounded-none bg-[#111111] border-2 border-[#367723] flex items-center justify-center shadow-lg">
                      <Radio className="w-6 h-6 text-[#367723] animate-pulse" />
                    </div>
                  </div>

                  <div className="space-y-2 max-w-md mx-auto">
                    <h2 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wider">
                      Memverifikasi Pembayaran...
                    </h2>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Sistem sedang mengecek status pembayaran kode transaksi{' '}
                      <span className="font-mono font-bold text-white">{order.order_code}</span> dari Xendit secara realtime.
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="max-w-xs mx-auto space-y-1.5">
                    <div className="w-full bg-[#111111] h-2 rounded-none overflow-hidden border border-neutral-700">
                      <div
                        className="bg-[#367723] h-full transition-all duration-300"
                        style={{ width: `${Math.min((pollAttempts / 40) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-neutral-500 font-mono">
                      Sinkronisasi otomatis ({pollAttempts}/40)...
                    </p>
                  </div>

                  {/* Manual Actions */}
                  <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
                    <button
                      onClick={() => fetchAndVerifyOrder(true)}
                      className="px-5 py-3 rounded-none text-xs font-semibold uppercase tracking-wider bg-[#111111] hover:bg-neutral-800 border border-neutral-700 text-white flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>Cek Ulang Sekarang</span>
                    </button>

                    {order.payment_url && (
                      <a
                        href={order.payment_url}
                        className="px-5 py-3 rounded-none text-xs font-bold uppercase tracking-wider bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Halaman Xendit</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
