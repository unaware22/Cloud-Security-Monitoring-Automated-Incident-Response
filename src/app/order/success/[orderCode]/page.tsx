'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  RefreshCw,
  ExternalLink,
  Sparkles,
  Download,
  Clock,
  MessageSquare,
  Palette,
  Image as ImageIcon,
  ShoppingBag,
  CreditCard,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import { formatIDR, formatDate } from '@/lib/utils';
import MidtransEmbeddedPayment from '@/components/checkout/MidtransEmbeddedPayment';

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
  snap_token?: string | null;
  product_name?: string;
  product_image_url?: string | null;
  quantity?: number;
  created_at?: string;
  paid_at?: string | null;
  expired_at?: string | null;
  delivery_content?: string | null;
  customer_notes?: string | null;
  custom_skin_details?: CustomSkinDetails | null;
}

import { parseDeliveryContent, ParsedDeliveryItem } from '@/lib/delivery-parser';

function OrderProgress({ paid, delivered }: { paid: boolean; delivered: boolean }) {
  const steps = [
    { label: 'Dibuat', icon: ShoppingBag },
    { label: 'Dibayar', icon: CreditCard },
    { label: 'Diproses', icon: PackageCheck },
    { label: 'Selesai', icon: CheckCircle2 },
  ];
  const completedStep = delivered ? 3 : paid ? 1 : 0;
  const activeStep = delivered ? 3 : paid ? 2 : 1;

  return (
    <section className="rounded-[28px] border border-white/10 bg-[#191d1b] p-5 sm:p-7">
      <h2 className="text-base font-bold text-white sm:text-lg">Progress transaksi</h2>
      <div className="relative mt-6 grid grid-cols-4 gap-1 text-center">
        <div className="absolute left-[12%] right-[12%] top-[21px] h-1 rounded-full bg-neutral-700">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(completedStep / 3) * 100}%` }}
          />
        </div>
        {steps.map(({ label, icon: Icon }, index) => (
          <div key={label} className="relative z-10 flex flex-col items-center gap-2">
            <div className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${
              index <= completedStep
                ? 'border-emerald-400 bg-emerald-500 text-[#082b18]'
                : index === activeStep
                  ? 'border-amber-300 bg-amber-400 text-[#312006]'
                : 'border-neutral-600 bg-[#242927] text-neutral-400'
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <span className={`text-[10px] font-semibold sm:text-xs ${index <= completedStep ? 'text-emerald-300' : index === activeStep ? 'text-amber-300' : 'text-neutral-500'}`}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OrderSuccessPage({
  params,
}: {
  params: { orderCode: string };
}) {
  const orderCode = params.orderCode;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [orderEmail, setOrderEmail] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [emailReady, setEmailReady] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAndVerifyOrder = useCallback(async (isManual = false) => {
    if (!orderEmail) return;
    if (isManual) setLoading(true);

    try {
      const res = await fetch('/api/orders/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          order_code: orderCode,
          email: orderEmail,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOrder(json.data);
        setErrorMsg('');

        if (
          (json.data.delivery_status === 'delivered' && Boolean(json.data.delivery_content)) ||
          ['failed', 'expired', 'cancelled', 'rejected'].includes(json.data.payment_status)
        ) {
          setPolling(false);
        }
      } else {
        setErrorMsg(res.status === 429
          ? 'Pemeriksaan terlalu sering. Tunggu sebentar lalu cek status lagi.'
          : 'Pesanan tidak ditemukan atau akses ditolak. Periksa kode dan email checkout.');
        if (res.status === 429) setPolling(false);
      }
    } catch {
      setErrorMsg('Gagal memuat status pesanan. Coba periksa koneksi lalu muat ulang.');
    } finally {
      setLoading(false);
    }
  }, [orderCode, orderEmail]);

  useEffect(() => {
    let savedEmail = '';
    try {
      savedEmail = localStorage.getItem(`order_email_${orderCode}`)?.trim().toLowerCase() || '';
    } catch {
      // An email form below is the fallback when browser storage is disabled.
    }
    setOrderEmail(savedEmail);
    setLookupEmail(savedEmail);
    setEmailReady(true);
    if (!savedEmail) setLoading(false);
  }, [orderCode]);

  useEffect(() => {
    if (emailReady && orderEmail) void fetchAndVerifyOrder();
  }, [emailReady, orderEmail, fetchAndVerifyOrder]);

  useEffect(() => {
    if (!polling || !orderEmail || pollAttempts >= 75) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPollAttempts((count) => count + 1);
      void fetchAndVerifyOrder();
    }, 12000);
    return () => clearInterval(timer);
  }, [polling, orderEmail, pollAttempts >= 75, fetchAndVerifyOrder]);

  useEffect(() => {
    if (pollAttempts >= 75) setPolling(false);
  }, [pollAttempts]);

  useEffect(() => {
    if (!order || order.payment_status !== 'pending') return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order?.payment_status, order?.expired_at]);

  const handleEmailLookup = (event: React.FormEvent) => {
    event.preventDefault();
    const email = lookupEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setErrorMsg('Masukkan email yang digunakan saat checkout.');
      return;
    }
    try {
      localStorage.setItem(`order_email_${orderCode}`, email);
    } catch {}
    setErrorMsg('');
    setLoading(true);
    setPolling(true);
    setOrderEmail(email);
  };

  const handleCancelOrder = async () => {
    if (!order || !orderEmail) return;
    setCancellingOrder(true);
    setCancelError('');
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_code: orderCode, email: orderEmail }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setCancelError(result.message || 'Pesanan belum dapat dibatalkan.');
        return;
      }
      setOrder((current) => current ? { ...current, ...result.data } : current);
      setPolling(false);
      setShowCancelConfirm(false);
    } catch {
      setCancelError('Gagal menghubungi server. Coba lagi.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isPaid =
    order?.payment_status === 'paid' ||
    order?.payment_status === 'settlement' ||
    order?.payment_status === 'capture' ||
    order?.payment_status === 'paid_manual';

  const isCustomSkin =
    order?.custom_skin_details != null ||
    order?.delivery_type === 'manual' ||
    order?.product_name?.toLowerCase().includes('skin');

  const isDelivered = order?.delivery_status === 'delivered' && Boolean(order?.delivery_content?.trim());
  const isComplete = isPaid && isDelivered;
  const isPaymentFailed = Boolean(order && ['failed', 'expired', 'cancelled', 'rejected'].includes(order.payment_status));
  const expiryMs = order?.expired_at ? Date.parse(order.expired_at) : NaN;
  const remainingSeconds = Number.isFinite(expiryMs)
    ? Math.max(0, Math.ceil((expiryMs - nowMs) / 1000))
    : null;
  const awaitingExpiryConfirmation = order?.payment_status === 'pending' && remainingSeconds === 0;

  const qty = order?.quantity || 1;
  const rawDelivery = order?.delivery_content || '';
  const parsedAccounts: ParsedDeliveryItem[] = parseDeliveryContent(rawDelivery).slice(0, qty);
  const paymentMethodLabel: Record<string, string> = {
    qris: 'QRIS', gopay: 'GoPay', shopeepay: 'ShopeePay', dana: 'DANA', ovo: 'OVO',
    va_bca: 'BCA Virtual Account', va_bri: 'BRI Virtual Account',
    va_bni: 'BNI Virtual Account', va_mandiri: 'Mandiri Virtual Account',
    va_bsi: 'BSI Virtual Account', alfamart: 'Alfamart', indomaret: 'Indomaret',
  };

  return (
    <div className="min-h-screen bg-[#101413] text-white selection:bg-emerald-500 selection:text-[#092517]">
      
      {/* Main Content Area */}
      <div className="w-full max-w-3xl mx-auto space-y-6 px-4 py-8 sm:px-6 sm:py-12">

        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-black tracking-[0.2em] text-emerald-300">SALADINSHOP</Link>
          <Link href="/check-order" className="text-xs font-semibold text-neutral-400 hover:text-white">Cek pesanan</Link>
        </div>

        {/* Initial Loading Screen */}
        {loading && !order && (!emailReady || orderEmail) && (
          <div className="p-12 rounded-none bg-[#181818] border border-neutral-700 text-center space-y-4 shadow-2xl">
            <Loader2 className="w-10 h-10 text-[#367723] animate-spin mx-auto" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Memeriksa Pembayaran</h2>
            <p className="text-xs text-neutral-400">Menghubungkan ke gateway pembayaran...</p>
          </div>
        )}

        {emailReady && !orderEmail && (
          <form onSubmit={handleEmailLookup} className="space-y-4 rounded-[28px] border border-white/10 bg-[#191d1b] p-6 sm:p-8">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
            <h1 className="text-xl font-bold">Buka detail pesanan</h1>
            <p className="text-sm text-neutral-400">Masukkan email yang digunakan saat checkout untuk melihat pembayaran dan pengiriman pesanan {orderCode}.</p>
            <label htmlFor="order-email" className="block text-xs font-semibold text-neutral-300">Email checkout</label>
            <input
              id="order-email"
              type="email"
              autoComplete="email"
              required
              value={lookupEmail}
              onChange={(event) => setLookupEmail(event.target.value)}
              className="w-full rounded-xl border border-neutral-600 bg-[#101413] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
            />
            {errorMsg && <p className="text-xs text-rose-300">{errorMsg}</p>}
            <button type="submit" className="w-full rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#092517] hover:bg-emerald-400">
              Lihat pesanan
            </button>
          </form>
        )}

        {/* Error Screen */}
        {errorMsg && !order && Boolean(orderEmail) && !loading && (
          <div className="p-8 rounded-none bg-[#181818] border border-rose-600/60 text-center space-y-4 shadow-2xl">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h2 className="text-xl font-bold text-white uppercase tracking-wider">Belum dapat memuat pesanan</h2>
            <p className="text-xs text-neutral-400">{errorMsg}</p>
            <div className="flex justify-center gap-3 pt-2">
              <button type="button" onClick={() => fetchAndVerifyOrder(true)} className="px-5 py-2.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white uppercase">
                Coba lagi
              </button>
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
            <section className={`relative overflow-hidden rounded-[32px] px-6 py-12 text-center shadow-2xl sm:px-12 sm:py-16 ${
              isComplete
                ? 'bg-[#1ec765] text-[#064728]'
                : isPaymentFailed
                  ? 'border border-rose-500/30 bg-gradient-to-br from-[#452328] to-[#201a1c] text-white'
                  : isPaid
                    ? 'border border-emerald-400/20 bg-gradient-to-br from-[#19583b] to-[#123026] text-white'
                    : 'border border-amber-400/20 bg-gradient-to-br from-[#344a2b] to-[#17261e] text-white'
            }`}>
              <span aria-hidden="true" className="absolute left-[15%] top-[20%] h-3 w-3 rotate-12 rounded-sm border-4 border-current opacity-25" />
              <span aria-hidden="true" className="absolute right-[18%] top-[32%] h-4 w-4 rotate-45 rounded-sm bg-amber-300 opacity-70" />
              <span aria-hidden="true" className="absolute bottom-[18%] left-[24%] h-2 w-2 rounded-full bg-emerald-100 opacity-70" />
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-black/10 sm:h-28 sm:w-28">
                {isComplete ? <CheckCircle2 className="h-14 w-14" strokeWidth={2.4} />
                  : isPaymentFailed ? <AlertCircle className="h-12 w-12 text-rose-300" />
                    : isPaid ? <PackageCheck className="h-12 w-12 text-emerald-300" />
                      : <Clock className="h-12 w-12 text-amber-300" />}
              </div>
              <h1 className="relative mt-7 text-3xl font-black tracking-tight sm:text-5xl">
                {isComplete ? 'Pesanan Selesai!' : isPaymentFailed ? 'Pembayaran Belum Selesai'
                  : isPaid ? 'Pembayaran Berhasil' : awaitingExpiryConfirmation ? 'Batas Waktu Terlewati' : 'Menunggu Pembayaran'}
              </h1>
              <p className="relative mx-auto mt-3 max-w-lg text-sm font-medium opacity-80 sm:text-base">
                {isComplete ? 'Pembayaran terverifikasi. Data produk digitalmu tersedia di bawah.'
                  : isPaymentFailed ? 'Pesanan ini tidak dapat dilanjutkan. Kamu bisa membuat pesanan baru.'
                    : isPaid ? 'Pembayaran sudah aman; pesananmu sedang diproses untuk dikirim.'
                      : awaitingExpiryConfirmation ? 'Kami sedang memastikan status akhir pembayaran dengan Midtrans. Jangan lakukan transfer baru untuk pesanan ini.'
                        : 'Selesaikan pembayaran melalui instruksi Midtrans di bawah. Status akan diperbarui otomatis.'}
              </p>
              <div className="relative mt-6 inline-flex rounded-full bg-black/15 px-4 py-2 font-mono text-xs font-bold tracking-wide">
                #{order.order_code}
              </div>
            </section>

            {!isPaymentFailed && <OrderProgress paid={isPaid} delivered={isComplete} />}

            <section className="rounded-[28px] border border-white/10 bg-[#191d1b] p-5 sm:p-7">
              <div className="flex items-start gap-4">
                {order.product_image_url ? (
                  <img src={order.product_image_url} alt="" className="h-20 w-20 flex-shrink-0 rounded-2xl object-cover sm:h-24 sm:w-24" />
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 sm:h-24 sm:w-24">
                    <ShoppingBag className="h-9 w-9" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Informasi pesanan</p>
                  <h2 className="mt-1 text-base font-bold text-white sm:text-lg">{order.product_name || 'Produk Digital'}</h2>
                  <p className="mt-1 text-xs text-neutral-400">{order.quantity || 1} item · {paymentMethodLabel[order.payment_method || ''] || order.payment_method || 'Midtrans'}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-neutral-500">Kode pesanan</p><p className="mt-1 break-all font-mono text-neutral-100">{order.order_code}</p></div>
                <div><p className="text-xs text-neutral-500">Dibuat</p><p className="mt-1 text-neutral-100">{order.created_at ? formatDate(order.created_at) : '—'}</p></div>
                <div><p className="text-xs text-neutral-500">Total pembayaran</p><p className="mt-1 text-lg font-black text-emerald-300">{formatIDR(order.total_amount)}</p></div>
                {!isPaid && order.expired_at && (
                  <div><p className="text-xs text-neutral-500">Batas pembayaran</p><p className="mt-1 font-semibold text-amber-300">{formatDate(order.expired_at)}</p></div>
                )}
              </div>
            </section>

            {/* ================= SUCCESS / PAID STATE ================= */}
            {isPaid ? (
              <div className="space-y-6 animate-fadeIn">

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

                    {!isDelivered && (
                      <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100">
                        Pembayaran sudah terverifikasi. Data produk sedang disiapkan; halaman ini akan memperbarui status otomatis.
                      </div>
                    )}
                    {isDelivered && parsedAccounts.length === 0 && (
                      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm text-neutral-300">
                        Pengiriman sudah tercatat, tetapi detail belum tersedia di halaman ini. Periksa email pesanan atau hubungi admin.
                      </div>
                    )}

                    {isDelivered && parsedAccounts.map((item, accIdx) => (
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

                        {/* ================= CATEGORY 4: JASA (Chat Admin setelah bayar) ================= */}
                        {item.category === 'jasa' && (
                          <div className="space-y-4 p-4 rounded-none bg-black/50 border border-orange-500/40">
                            {parsedAccounts.length > 1 && (
                              <div className="flex items-center justify-end pb-1 border-b border-orange-950">
                                <span className="text-[10px] text-neutral-400 font-mono">Item #{accIdx + 1}</span>
                              </div>
                            )}

                            {/* Header Instruksi */}
                            <div className="flex items-center gap-2 text-orange-300 font-bold text-xs uppercase tracking-wider">
                              <MessageSquare className="w-4 h-4 text-orange-400" />
                              <span>Instruksi Layanan Jasa (Hubungi Admin)</span>
                            </div>

                            <p className="text-xs text-neutral-300 leading-relaxed">
                              Terima kasih! Pembayaran Anda telah kami terima. Untuk memulai proses pengerjaan layanan jasa, silakan hubungi Customer Support kami dan kirimkan format rincian pesanan berikut:
                            </p>

                            {/* Format Pesanan Box */}
                            <div className="p-3.5 bg-[#111111] border border-orange-500/40 space-y-2.5">
                              <div className="flex items-center justify-between text-[11px] font-bold text-orange-400 border-b border-neutral-800 pb-2">
                                <span>FORMAT PESANAN UNTUK CHAT ADMIN:</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyToClipboard(
                                      `Halo Admin, saya sudah bayar pesanan jasa:\n- Kode Pesanan: ${order.order_code}\n- Judul Pesanan: ${order.product_name || '-'}\n- Harga Pesanan: ${formatIDR(order.total_amount)}`,
                                      `format-jasa-${accIdx}`
                                    )
                                  }
                                  className="px-2.5 py-1 rounded bg-orange-950/70 hover:bg-orange-900 border border-orange-500/40 text-orange-300 text-[10px] font-semibold flex items-center gap-1.5 transition-all"
                                >
                                  {copiedKey === `format-jasa-${accIdx}` ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Format Tersalin</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Salin Format Chat</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              <div className="font-mono text-xs space-y-1.5 bg-black/70 p-3 border border-neutral-800 rounded select-all text-neutral-200">
                                <p>
                                  <span className="text-neutral-400">Kode Pesanan: </span>
                                  <span className="text-orange-300 font-bold">{order.order_code}</span>
                                </p>
                                <p>
                                  <span className="text-neutral-400">Judul Pesanan: </span>
                                  <span className="text-white font-bold">{order.product_name || '-'}</span>
                                </p>
                                <p>
                                  <span className="text-neutral-400">Harga Pesanan: </span>
                                  <span className="text-emerald-400 font-bold">{formatIDR(order.total_amount)}</span>
                                </p>
                              </div>
                            </div>

                            {/* Tombol Langsung Chat Admin WhatsApp */}
                            <div>
                              <a
                                href={`https://wa.me/6281234567890?text=${encodeURIComponent(
                                  `Halo Admin, saya sudah bayar pesanan jasa:\n- Kode Pesanan: ${order.order_code}\n- Judul Pesanan: ${order.product_name || '-'}\n- Harga Pesanan: ${formatIDR(order.total_amount)}`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-[#25D366]/30 uppercase tracking-wider"
                              >
                                <MessageSquare className="w-4 h-4" />
                                <span>Chat Admin via WhatsApp Sekarang</span>
                              </a>
                            </div>

                            {/* Catatan / Panduan Tambahan dari Admin */}
                            {item.notes && (
                              <div className="p-3 bg-[#111111] border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
                                <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                  <span className="font-semibold text-neutral-200">Catatan Admin: </span>
                                  <span>{item.notes}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    ))}

                    {isDelivered && parsedAccounts.length > 0 && <div className="bg-[#111111] border border-neutral-700 rounded-none p-3.5 text-xs text-neutral-300 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="leading-relaxed">
                        Harap segera simpan data produk digital Anda atau ikuti petunjuk pengiriman di atas. Bukti transaksi dan detail ini juga telah dikirimkan ke email Anda.
                      </p>
                    </div>}
                  </div>
                )}

                {!isComplete && (
                  <button
                    type="button"
                    onClick={() => fetchAndVerifyOrder(true)}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" /> Perbarui status pengiriman
                  </button>
                )}

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
            ) : isPaymentFailed ? (
              /* ================= FAILED STATE ================= */
              <div className="space-y-6 animate-fadeIn">
                <div className="rounded-[28px] border border-rose-500/30 bg-[#191d1b] p-6 text-center sm:p-8">
                  <p className="text-sm text-neutral-300">Status pesanan: <span className="font-bold text-rose-300">{order.payment_status}</span>. Jika masih ingin membeli, buat pesanan baru agar mendapat instruksi pembayaran yang aktif.</p>
                  <Link href="/" className="mt-5 inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-[#082b18] hover:bg-emerald-400">
                    Kembali ke toko
                  </Link>
                </div>
              </div>
            ) : (
              /* ================= PENDING PAYMENT STATE ================= */
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm">
                  <span className="flex items-center gap-2 font-semibold text-amber-200">
                    <Clock className="h-4 w-4" /> Menunggu konfirmasi Midtrans
                  </span>
                  {remainingSeconds !== null && (
                    <span className="font-mono font-bold text-amber-300">
                      {remainingSeconds > 0
                        ? `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')} tersisa`
                        : 'Waktu habis — periksa status'}
                    </span>
                  )}
                </div>

                {!awaitingExpiryConfirmation && (
                  <MidtransEmbeddedPayment
                    token={order.snap_token || null}
                    paymentUrl={order.payment_url || null}
                    onPaymentActivity={() => void fetchAndVerifyOrder()}
                  />
                )}

                <div className="rounded-[20px] border border-white/10 bg-[#191d1b] p-5 text-xs leading-relaxed text-neutral-400">
                  Jangan transfer ke rekening pribadi. QRIS/VA pada panel Midtrans terikat pada pesanan ini; data produk hanya muncul setelah pembayaran terverifikasi di server.
                </div>

                {errorMsg && <p className="text-center text-xs text-amber-300">{errorMsg}</p>}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={() => fetchAndVerifyOrder(true)} disabled={loading} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                    <RefreshCw className="h-4 w-4" /> Perbarui status
                  </button>
                  <button type="button" onClick={() => setShowCancelConfirm(true)} className="flex-1 rounded-xl border border-rose-500/30 px-4 py-3 text-xs font-bold text-rose-300 hover:bg-rose-500/10">
                    Batalkan pesanan
                  </button>
                </div>

                {showCancelConfirm && (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
                    <p className="text-sm text-neutral-200">Yakin ingin membatalkan? Pesanan yang sudah dibayar tidak dapat dibatalkan di halaman ini.</p>
                    {cancelError && <p className="mt-3 text-xs text-rose-300">{cancelError}</p>}
                    <div className="mt-4 flex gap-3">
                      <button type="button" onClick={handleCancelOrder} disabled={cancellingOrder} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                        {cancellingOrder ? 'Memproses...' : 'Ya, batalkan'}
                      </button>
                      <button type="button" onClick={() => { setShowCancelConfirm(false); setCancelError(''); }} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-neutral-300">
                        Kembali
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
