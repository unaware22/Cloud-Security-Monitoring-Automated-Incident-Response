'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import {
  Building2,
  QrCode,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Key,
  Wallet,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Radio,
  Mail,
  Lock,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import { formatIDR, formatDate } from '@/lib/utils';

// Helper component for QR Code pattern SVG
function QRISVector({ amount, code }: { amount: number; code: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-5 bg-white text-black border-4 border-black rounded-none shadow-2xl space-y-3 select-none">
      {/* Top QRIS banner */}
      <div className="w-full flex items-center justify-between border-b-2 border-black pb-2 px-1">
        <span className="font-black text-xs tracking-widest uppercase">QRIS NASIONAL</span>
        <span className="font-mono text-[10px] font-bold">SALADINSHOP</span>
      </div>

      {/* Realistic QR Pattern SVG */}
      <div className="relative w-52 h-52 sm:w-60 sm:h-60 bg-white p-2 flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-full h-full" shapeRendering="crispEdges">
          {/* Background */}
          <rect width="200" height="200" fill="white" />
          
          {/* Outer finder patterns */}
          {/* Top-Left */}
          <rect x="10" y="10" width="50" height="50" fill="black" />
          <rect x="18" y="18" width="34" height="34" fill="white" />
          <rect x="26" y="26" width="18" height="18" fill="black" />

          {/* Top-Right */}
          <rect x="140" y="10" width="50" height="50" fill="black" />
          <rect x="148" y="18" width="34" height="34" fill="white" />
          <rect x="156" y="26" width="18" height="18" fill="black" />

          {/* Bottom-Left */}
          <rect x="10" y="140" width="50" height="50" fill="black" />
          <rect x="18" y="148" width="34" height="34" fill="white" />
          <rect x="26" y="156" width="18" height="18" fill="black" />

          {/* Timing and alignment patterns */}
          <rect x="70" y="20" width="8" height="8" fill="black" />
          <rect x="85" y="20" width="8" height="8" fill="black" />
          <rect x="100" y="20" width="8" height="8" fill="black" />
          <rect x="115" y="20" width="8" height="8" fill="black" />

          <rect x="20" y="70" width="8" height="8" fill="black" />
          <rect x="20" y="85" width="8" height="8" fill="black" />
          <rect x="20" y="100" width="8" height="8" fill="black" />
          <rect x="20" y="115" width="8" height="8" fill="black" />

          {/* Dense data matrix pattern */}
          <rect x="70" y="70" width="16" height="16" fill="black" />
          <rect x="95" y="70" width="16" height="8" fill="black" />
          <rect x="120" y="70" width="10" height="16" fill="black" />
          
          <rect x="70" y="95" width="10" height="20" fill="black" />
          <rect x="90" y="90" width="20" height="20" fill="black" />
          <rect x="120" y="95" width="16" height="16" fill="black" />

          <rect x="70" y="125" width="16" height="10" fill="black" />
          <rect x="95" y="120" width="16" height="16" fill="black" />
          <rect x="120" y="125" width="20" height="12" fill="black" />

          <rect x="145" y="70" width="12" height="18" fill="black" />
          <rect x="165" y="80" width="18" height="10" fill="black" />
          <rect x="145" y="100" width="25" height="10" fill="black" />
          <rect x="145" y="120" width="10" height="20" fill="black" />
          <rect x="165" y="120" width="15" height="15" fill="black" />

          <rect x="10" y="100" width="12" height="12" fill="black" />
          <rect x="35" y="100" width="18" height="8" fill="black" />
          <rect x="10" y="120" width="25" height="8" fill="black" />

          <rect x="70" y="150" width="25" height="15" fill="black" />
          <rect x="105" y="150" width="15" height="20" fill="black" />
          <rect x="130" y="150" width="20" height="15" fill="black" />
          <rect x="160" y="150" width="15" height="25" fill="black" />

          <rect x="70" y="175" width="20" height="10" fill="black" />
          <rect x="100" y="175" width="25" height="10" fill="black" />
          <rect x="135" y="175" width="15" height="10" fill="black" />

          {/* Center Logo Box */}
          <rect x="80" y="80" width="40" height="40" fill="white" stroke="black" strokeWidth="2" />
          <text x="100" y="104" fontSize="11" fontWeight="bold" textAnchor="middle" fill="black" fontFamily="sans-serif">
            QRIS
          </text>
        </svg>
      </div>

      {/* Bottom info */}
      <div className="w-full text-center border-t-2 border-black pt-1.5 space-y-0.5">
        <p className="text-[10px] font-mono text-neutral-600">NMID: ID102026994188</p>
        <p className="text-xs font-mono font-bold text-black">{formatIDR(amount)}</p>
      </div>
    </div>
  );
}

function PaymentContent({ orderCode }: { orderCode: string }) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(true);

  // Poll / fetch order status every 2 seconds for instant update upon Admin approval
  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: orderCode,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setOrder(json.data);
      } else {
        setErrorMessage(json.message);
      }
    } catch {
      setErrorMessage('Gagal memuat status pembayaran');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 2000);
    return () => clearInterval(interval);
  }, [orderCode]);

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center gap-3 text-neutral-400">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-xs font-medium">Memuat instruksi pembayaran SALADINSHOP...</p>
      </div>
    );
  }

  if (errorMessage && !order) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-none bg-[#181818] border border-neutral-700 text-center space-y-4 shadow-2xl text-white">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h2 className="minecraft-font-folder text-xl text-white">PESANAN TIDAK DITEMUKAN</h2>
          <p className="text-xs text-neutral-400">{errorMessage}</p>
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

  const isPaid = order?.payment_status === 'paid' || order?.payment_status === 'paid_manual';
  const rawMethod = (order?.payment_method || order?.paymentMethod || '').toLowerCase();
  const isQRIS = rawMethod.includes('qris');
  const firstItem = order?.items?.[0] || order?.orderItems?.[0];

  // Parse delivery content into 3 structured boxes: 1. Email, 2. Password, 3. Keterangan
  const rawDelivery = order?.digital_delivery?.content || order?.delivery_content || '';
  let email = '';
  let password = '';
  let keterangan = '';

  if (rawDelivery) {
    const parts = rawDelivery.split('|').map((p: string) => p.trim());
    for (const part of parts) {
      if (/^(email|username|user|akun)\s*:\s*/i.test(part)) {
        email = part.replace(/^(email|username|user|akun)\s*:\s*/i, '').trim();
      } else if (/^(pass|password|pwd|kata sandi)\s*:\s*/i.test(part)) {
        password = part.replace(/^(pass|password|pwd|kata sandi)\s*:\s*/i, '').trim();
      } else if (/^(keterangan|ket|info|detail|note|notes)\s*:\s*/i.test(part)) {
        keterangan = part.replace(/^(keterangan|ket|info|detail|note|notes)\s*:\s*/i, '').trim();
      } else {
        keterangan = keterangan ? `${keterangan} | ${part}` : part;
      }
    }

    if (!email && !password && !keterangan) {
      keterangan = rawDelivery;
    } else if (!email && parts.length >= 1) {
      email = parts[0];
      if (parts.length >= 2) password = parts[1];
      if (parts.length >= 3) keterangan = parts.slice(2).join(' | ');
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-8 sm:pt-12 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        
        {/* Dedicated Standalone Header with large logo2.png and Back button */}
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

        {/* Order Code & Live Status Badge */}
        <div className="p-4 rounded-none bg-[#181818] border border-neutral-700/80 flex items-center justify-between text-xs shadow-xl">
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
              KODE TRANSAKSI:
            </span>
            <span className="text-sm sm:text-base font-mono font-black text-white">{orderCode}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(orderCode, 'orderCode')}
              className="px-3 py-1.5 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-400" />
              <span>{copiedField === 'orderCode' ? 'TERSALIN!' : 'SALIN KODE'}</span>
            </button>
          </div>
        </div>

        {isPaid ? (
          /* ====================================================================
             1. PEMBAYARAN SELESAI & DISAHKAN (3 STRUCTURED BOXES: EMAIL, PASS, KETERANGAN)
          ==================================================================== */
          <div className="space-y-6 animate-fadeIn">
            {/* Success Banner */}
            <div className="p-6 sm:p-8 rounded-none bg-[#181818] border-2 border-emerald-500 shadow-2xl text-center space-y-3">
              <div className="w-16 h-16 rounded-none bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h1 className="minecraft-font-folder text-xl sm:text-2xl text-white">
                PEMBAYARAN TERVERIFIKASI
              </h1>
              <p className="text-xs text-neutral-300 max-w-md mx-auto leading-relaxed">
                Terima kasih! Pembayaran Anda telah disahkan oleh Admin. Data pengiriman produk digital Anda telah aktif dan dapat langsung digunakan:
              </p>
            </div>

            {/* Product Purchased Info */}
            <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 shadow-md flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Produk yang Dipesan
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {firstItem?.product_name || firstItem?.productNameSnapshot || 'Akun Minecraft Java & Bedrock Edition'}
                </h3>
                <span className="text-[11px] text-emerald-400 font-bold">
                  Status: Lunas (Terkirim Otomatis)
                </span>
              </div>
              <div className="text-right font-mono font-black text-base text-emerald-400">
                {formatIDR(order?.total_amount || 0)}
              </div>
            </div>

            {/* 3 STRUCTURED BOXES: EMAIL, PASSWORD, KETERANGAN */}
            <div className="p-6 rounded-none bg-[#09172e] border-2 border-cyan-500 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                  <Key className="w-4 h-4 text-cyan-400" />
                  <span>DATA PENGIRIMAN DIGITAL (3 DETAIL AKUN)</span>
                </div>

                <button
                  onClick={() => copyToClipboard(rawDelivery, 'all_credentials')}
                  className="px-3.5 py-1.5 rounded-none bg-[#ffc825] hover:bg-[#ffcf3d] border-b-2 border-[#b87e00] text-[#111111] font-bold text-xs flex items-center gap-1.5 transition-all uppercase select-none"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedField === 'all_credentials' ? 'TERSEDIA DI CLIPBOARD' : 'SALIN SEMUA'}</span>
                </button>
              </div>

              {/* 3 Structured Boxes Container */}
              <div className="space-y-3">
                {/* Box 1: Email / Username */}
                {email && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        <span>1. Email / Username Akun</span>
                      </span>
                      <p className="font-mono text-sm sm:text-base text-cyan-200 font-bold select-all truncate">
                        {email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(email, 'email')}
                      className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                    >
                      {copiedField === 'email' ? 'TERSALIN' : 'SALIN'}
                    </button>
                  </div>
                )}

                {/* Box 2: Password */}
                {password && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>2. Password Akun</span>
                      </span>
                      <p className="font-mono text-sm sm:text-base text-amber-300 font-bold select-all truncate">
                        {showPassword ? password : '••••••••••••••••'}
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
                        onClick={() => copyToClipboard(password, 'password')}
                        className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase transition-all"
                      >
                        {copiedField === 'password' ? 'TERSALIN' : 'SALIN'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Box 3: Keterangan / Detail Lisensi */}
                {keterangan && (
                  <div className="p-4 rounded-none bg-black/80 border border-cyan-500/40 flex items-center justify-between gap-3">
                    <div className="space-y-1 overflow-hidden">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-emerald-400" />
                        <span>3. Keterangan / Detail Lisensi</span>
                      </span>
                      <p className="text-xs text-neutral-200 font-medium leading-relaxed select-all">
                        {keterangan}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(keterangan, 'keterangan')}
                      className="px-3 py-1.5 rounded-none bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[11px] font-bold uppercase flex-shrink-0 transition-all"
                    >
                      {copiedField === 'keterangan' ? 'TERSALIN' : 'SALIN'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1">
                <ShieldCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Harap segera login, ganti password, dan amankan akun Anda di portal resmi.</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/"
                className="w-full sm:w-auto px-8 py-3.5 rounded-none bg-[#181818] hover:bg-neutral-800 text-white font-bold text-xs text-center border border-neutral-700 uppercase tracking-wider"
              >
                Kembali ke Beranda
              </Link>
              <Link
                href="/check-order"
                className="w-full sm:w-auto px-8 py-3.5 rounded-none bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white font-black text-xs text-center uppercase tracking-wider"
              >
                Cek Pesanan Lain
              </Link>
            </div>
          </div>
        ) : (
          /* ====================================================================
             2. MENUNGGU PEMBAYARAN (OUTPUT CONDITIONAL: QRIS ONLY / VA ONLY)
          ==================================================================== */
          <div className="space-y-6">
            
            {/* Total Tagihan Card */}
            <div className="p-6 rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl text-center space-y-2">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">
                Total Tagihan yang Harus Dibayar:
              </span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
                  {formatIDR(order?.total_amount || 0)}
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(String(order?.total_amount || 0), 'nominal')
                  }
                  className="p-2.5 rounded-none bg-[#111111] hover:bg-neutral-900 border border-neutral-700 text-emerald-400 transition-all"
                  title="Salin Nominal"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copiedField === 'nominal' && (
                <p className="text-[11px] text-emerald-400 font-bold">✓ Nominal berhasil disalin!</p>
              )}
            </div>

            {/* CONDITIONAL OPTION 1: JIKA USER PILIH QRIS -> OUTPUT HANYA QRIS */}
            {isQRIS && (
              <div className="p-6 sm:p-8 rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                        QRIS STANDAR NASIONAL
                      </h3>
                      <p className="text-[10px] text-neutral-400">Semua E-Wallet (GoPay, OVO, DANA, ShopeePay) &amp; Mobile Banking</p>
                    </div>
                  </div>
                </div>

                {/* QR Dummy Code Display */}
                <div className="flex flex-col items-center justify-center py-2 space-y-4">
                  <QRISVector amount={order?.total_amount || 0} code={orderCode} />

                  <p className="text-xs text-neutral-300 text-center max-w-md leading-relaxed">
                    Buka aplikasi e-wallet atau m-Banking pilihan Anda, pilih menu <strong>Scan / Bayar QRIS</strong>, lalu scan barcode di atas.
                  </p>
                </div>
              </div>
            )}

            {/* CONDITIONAL OPTION 2: JIKA USER PILIH VIRTUAL ACCOUNT / E-WALLET -> OUTPUT HANYA NOMOR REKENING/VA */}
            {!isQRIS && (
              <div className="p-6 sm:p-8 rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-800">
                  <div className="w-8 h-8 rounded-none bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-white">
                      NOMOR REKENING / VIRTUAL ACCOUNT
                    </h3>
                    <p className="text-[10px] text-neutral-400">Transfer Bank atau E-Wallet Resmi</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  {/* BCA */}
                  <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-neutral-400 font-bold">
                      <span>BANK BCA (Virtual Account)</span>
                      <span className="text-[10px] text-neutral-400">a/n SALADINSHOP</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#181818] p-3 border border-neutral-700">
                      <span className="font-mono text-base font-black text-white tracking-wider">8801 2345 6789 0001</span>
                      <button
                        onClick={() => copyToClipboard('8801234567890001', 'bca')}
                        className="px-3 py-1.5 rounded-none bg-[#367723] hover:bg-[#418e2a] text-white text-[11px] font-black uppercase"
                      >
                        {copiedField === 'bca' ? 'TERSALIN' : 'SALIN'}
                      </button>
                    </div>
                  </div>

                  {/* Mandiri */}
                  <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-neutral-400 font-bold">
                      <span>BANK MANDIRI (Virtual Account)</span>
                      <span className="text-[10px] text-neutral-400">a/n SALADINSHOP</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#181818] p-3 border border-neutral-700">
                      <span className="font-mono text-base font-black text-white tracking-wider">8930 1122 3344 5566</span>
                      <button
                        onClick={() => copyToClipboard('8930112233445566', 'mandiri')}
                        className="px-3 py-1.5 rounded-none bg-[#367723] hover:bg-[#418e2a] text-white text-[11px] font-black uppercase"
                      >
                        {copiedField === 'mandiri' ? 'TERSALIN' : 'SALIN'}
                      </button>
                    </div>
                  </div>

                  {/* DANA / GoPay / OVO */}
                  <div className="p-4 rounded-none bg-[#111111] border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-neutral-400 font-bold">
                      <span>DANA / GOPAY / OVO (E-Wallet)</span>
                      <span className="text-[10px] text-emerald-400">a/n SALADINSHOP OFFICIAL</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#181818] p-3 border border-neutral-700">
                      <span className="font-mono text-base font-black text-white tracking-wider">0812-3456-7890</span>
                      <button
                        onClick={() => copyToClipboard('081234567890', 'ewallet')}
                        className="px-3 py-1.5 rounded-none bg-[#367723] hover:bg-[#418e2a] text-white text-[11px] font-black uppercase"
                      >
                        {copiedField === 'ewallet' ? 'TERSALIN' : 'SALIN'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE RADAR: MENUNGGU PENGESAHAN ADMIN */}
            <div className="p-6 rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </div>
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  MENUNGGU PENGESAHAN ADMIN
                </h4>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Setelah Anda menyelesaikan transfer/scan pembayaran, Admin kami akan segera mengesahkan transaksi Anda dari <strong>Portal Admin</strong>.
              </p>

              <div className="p-3 bg-[#111111] border border-neutral-800 text-[11px] text-neutral-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Halaman ini otomatis mendeteksi status dan akan langsung menampilkan data akun Anda begitu disahkan oleh Admin.</span>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default function PaymentPage({ params }: { params: { orderCode: string } }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      }
    >
      <PaymentContent orderCode={params.orderCode} />
    </Suspense>
  );
}
