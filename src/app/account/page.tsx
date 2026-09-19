'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    snap?: any;
  }
}
import {
  ShoppingBag,
  Shield,
  User as UserIcon,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Mail,
  ShieldAlert,
  Calendar,
  X,
  CreditCard,
  Lock,
  Info,
  Key,
} from 'lucide-react';
import { formatIDR, formatDate } from '@/lib/utils';
import { parseDeliveryContent, ParsedDeliveryItem } from '@/lib/delivery-parser';
import TurnstileWidget from '@/components/security/TurnstileWidget';

export interface PurchasedItem {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
  imageUrl: string;
  slug: string;
  game: string;
  deliveryType: string;
  serviceTag?: string;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  order_code?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  totalAmount: number;
  totalPrice?: number;
  productSubtotal: number;
  discountAmount: number;
  adminFee: number;
  voucherCode: string | null;
  paymentStatus: string;
  deliveryStatus: string;
  orderStatus: string;
  paymentMethod: string;
  paymentUrl?: string | null;
  snapToken?: string | null;
  productName: string;
  productImage: string;
  productSlug?: string;
  items: PurchasedItem[];
  orderItems?: PurchasedItem[];
  deliveryContent?: string | null;
  rawDelivery?: string | null;
  credentials?: any;
  isPaid: boolean;
  customSkinDetails?: any;
  customerNotes?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  isEmailVerified: boolean;
  authProvider: string;
  hasGoogleLinked: boolean;
  hasPassword?: boolean;
}

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'security' ? 'security' : 'orders';

  const [activeTab, setActiveTab] = useState<'orders' | 'security'>(initialTab);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(true);

  // Security / Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  // Resend Verification Email State
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  // Logout All Sessions State
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const turnstileEnabled = Boolean(turnstileSiteKey && !turnstileSiteKey.includes('REPLACE_ME'));

  // Load customer profile
  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();
        if (json.success && json.user) {
          setProfile(json.user);
        } else {
          router.replace('/login?redirect=/account');
        }
      } catch {
        router.replace('/login?redirect=/account');
      } finally {
        setLoadingProfile(false);
      }
    }
    loadProfile();
  }, [router]);

  // Cancel & Pay Direct Actions State
  const [orderToCancel, setOrderToCancel] = useState<OrderRecord | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [actionNotification, setActionNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    try {
      const res = await fetch('/api/user/orders');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data);
        setSelectedOrder((current) => {
          if (!current) return null;
          const updated = json.data.find((o: OrderRecord) => o.orderCode === current.orderCode);
          return updated || current;
        });
      }
    } catch {
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  };

  // Load orders when on 'orders' tab
  useEffect(() => {
    if (activeTab === 'orders' && profile) {
      fetchOrders();
    }
  }, [activeTab, profile]);

  const handlePayOrder = (order: OrderRecord) => {
    const snapToken = order.snapToken;

    if (typeof window !== 'undefined' && window.snap && typeof window.snap.pay === 'function' && snapToken) {
      window.snap.pay(snapToken, {
        onSuccess: async (result?: any) => {
          try {
            await fetch('/api/orders/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_code: order.orderCode,
                email: order.customerEmail || profile?.email || '',
              }),
            });
          } catch {}
          await fetchOrders(true);
          setActionNotification({
            type: 'success',
            message: `Pembayaran pesanan #${order.orderCode} berhasil! Data digital Anda telah aktif.`,
          });
          setTimeout(() => setActionNotification(null), 5000);
        },
        onPending: async (result?: any) => {
          if (result?.transaction_status === 'settlement' || result?.status_code === '200') {
            try {
              await fetch('/api/orders/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  order_code: order.orderCode,
                  email: order.customerEmail || profile?.email || '',
                }),
              });
            } catch {}
            await fetchOrders(true);
          }
        },
        onError: () => {
          setActionNotification({
            type: 'error',
            message: 'Pembayaran gagal atau dibatalkan di Midtrans. Silakan coba kembali.',
          });
          setTimeout(() => setActionNotification(null), 5000);
        },
        onClose: async () => {
          try {
            const verifyRes = await fetch('/api/orders/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_code: order.orderCode,
                email: order.customerEmail || profile?.email || '',
              }),
            });
            const verifyJson = await verifyRes.json();
            if (verifyJson.success && (verifyJson.is_paid || verifyJson.data?.payment_status === 'paid')) {
              await fetchOrders(true);
              setActionNotification({
                type: 'success',
                message: `Pembayaran pesanan #${order.orderCode} berhasil diverifikasi! Data akun digital telah aktif.`,
              });
              setTimeout(() => setActionNotification(null), 5000);
            }
          } catch {}
        },
      });
      return;
    }

    if (order.paymentUrl) {
      window.open(order.paymentUrl, '_blank');
      return;
    }

    setActionNotification({
      type: 'error',
      message: 'Token pembayaran Midtrans tidak ditemukan atau pesanan telah kedaluwarsa.',
    });
    setTimeout(() => setActionNotification(null), 5000);
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel) return;
    setCancellingOrder(true);
    setCancelError('');

    try {
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_code: orderToCancel.orderCode,
          email: orderToCancel.customerEmail || profile?.email || '',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setCancelError(json.message || 'Pesanan belum dapat dibatalkan.');
        return;
      }

      // In-place update in orders list
      setOrders((prev) =>
        prev.map((ord) =>
          ord.orderCode === orderToCancel.orderCode
            ? {
                ...ord,
                orderStatus: 'cancelled',
                paymentStatus: 'cancelled',
                deliveryStatus: 'cancelled',
              }
            : ord
        )
      );

      // In-place update in selectedOrder if open
      if (selectedOrder && selectedOrder.orderCode === orderToCancel.orderCode) {
        setSelectedOrder((prev) =>
          prev
            ? {
                ...prev,
                orderStatus: 'cancelled',
                paymentStatus: 'cancelled',
                deliveryStatus: 'cancelled',
              }
            : null
        );
      }

      setActionNotification({
        type: 'success',
        message: `Pesanan #${orderToCancel.orderCode} berhasil dibatalkan.`,
      });
      setTimeout(() => setActionNotification(null), 5000);
      setOrderToCancel(null);
    } catch {
      setCancelError('Terjadi gangguan jaringan saat membatalkan pesanan.');
    } finally {
      setCancellingOrder(false);
    }
  };

  const copyDeliveryData = (text: string, fieldId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };
  const handleCopy = copyDeliveryData;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
    router.refresh();
  };

  const handleResendVerification = async () => {
    setResendingEmail(true);
    setResendMessage('');
    setResendError('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile?.email }),
      });
      const json = await res.json();
      if (res.ok) {
        setResendMessage(
          json.message || 'Tautan verifikasi baru telah dikirimkan ke email Anda (berlaku 5 menit).'
        );
      } else {
        setResendError(json.message || 'Gagal mengirim ulang email verifikasi.');
      }
    } catch {
      setResendError('Terjadi kesalahan jaringan.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const hasPassword = Boolean(profile?.hasPassword);

    if (hasPassword && !oldPassword) {
      setPasswordError('Kata sandi saat ini wajib diisi.');
      return;
    }

    if (!newPassword) {
      setPasswordError('Kata sandi baru wajib diisi.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.');
      return;
    }

    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Kata sandi baru harus mengandung kombinasi huruf besar, huruf kecil, dan angka.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setPasswordError('Harap selesaikan verifikasi CAPTCHA.');
      return;
    }

    setChangingPassword(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: hasPassword ? oldPassword : undefined,
          new_password: newPassword,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setPasswordError(json.message || 'Gagal mengatur kata sandi.');
        setTurnstileResetKey((k) => k + 1);
        setTurnstileToken('');
        setChangingPassword(false);
        return;
      }

      setPasswordSuccess(
        json.message ||
          (hasPassword
            ? 'Kata sandi Anda berhasil diperbarui! Semua sesi aktif di perangkat lain telah dicabut.'
            : 'Kata sandi akun Anda berhasil dibuat! Sekarang Anda dapat login dengan email dan kata sandi.')
      );
      setProfile((prev: any) =>
        prev
          ? {
              ...prev,
              hasPassword: true,
              authProvider: prev.authProvider === 'google' ? 'both' : prev.authProvider,
            }
          : prev
      );
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTurnstileToken('');
      setChangingPassword(false);
    } catch {
      setPasswordError('Terjadi kesalahan jaringan. Silakan coba lagi.');
      setChangingPassword(false);
    }
  };

  const handleLogoutAllSessions = async () => {
    if (!confirm('Apakah Anda yakin ingin logout dari semua sesi di seluruh perangkat?')) return;

    setLoggingOutAll(true);
    try {
      await fetch('/api/auth/logout-all-sessions', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      alert('Gagal melakukan logout semua sesi.');
      setLoggingOutAll(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'settlement':
      case 'paid':
      case 'paid_manual':
      case 'capture':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Lunas
          </span>
        );
      case 'pending':
      case 'waiting_payment':
      case 'pending_manual':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Menunggu Pembayaran
          </span>
        );
      case 'cancelled':
      case 'cancel':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Dibatalkan
          </span>
        );
      case 'expired':
      case 'expire':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-amber-600/20 text-amber-300 border border-amber-600/40">
            Kedaluwarsa
          </span>
        );
      case 'failed':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Gagal
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-neutral-800 text-neutral-300">
            {status}
          </span>
        );
    }
  };

  const getDeliveryBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-[#367723]/30 text-[#69c944] border border-[#367723]">
            Terkirim
          </span>
        );
      case 'processing':
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/40">
            Diproses
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase bg-neutral-800 text-neutral-400">
            {status}
          </span>
        );
    }
  };

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
      </div>
    );
  }

  // Strict email verification gate: unverified users cannot enter dashboard
  if (profile && !profile.isEmailVerified) {
    return (
      <div className="min-h-screen bg-[#111111] text-white py-12 px-4 flex flex-col items-center justify-center">
        {/* Brand Logo Link to Home */}
        <div className="mb-6">
          <Link href="/" className="inline-block group" title="Kembali ke Beranda">
            <img
              src="/images/logo2.png"
              alt="SALADINSHOP"
              className="h-10 sm:h-12 w-auto object-contain transition-transform duration-150 group-hover:scale-105"
            />
          </Link>
        </div>

        <div className="w-full max-w-md bg-[#181818] border border-amber-600/70 p-6 sm:p-8 space-y-6 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500/20 border-2 border-amber-500 rounded-full mx-auto">
            <Mail className="w-7 h-7 text-amber-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black uppercase tracking-wider text-white">
              VERIFIKASI EMAIL DIPERLUKAN
            </h1>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Anda belum dapat mengakses dashboard pengguna sebelum memverifikasi alamat email Anda. Silakan buka kotak masuk atau spam email Anda:
            </p>
            <div className="p-2.5 bg-[#111111] border border-neutral-700 text-amber-400 font-mono text-xs break-all">
              {profile.email}
            </div>
            <p className="text-[11px] text-amber-300/90 font-medium">
              Demi keamanan, tautan verifikasi berlaku selama <strong>5 menit</strong> setelah dikirimkan.
            </p>
          </div>

          {resendMessage && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-700 text-emerald-300 text-xs text-left">
              {resendMessage}
            </div>
          )}

          {resendError && (
            <div className="p-3 bg-rose-950/50 border border-rose-700 text-rose-300 text-xs text-left">
              {resendError}
            </div>
          )}

          <div className="space-y-2.5 pt-2">
            <button
              onClick={handleResendVerification}
              disabled={resendingEmail}
              className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50"
            >
              {resendingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>MENGIRIMKAN TAUTAN...</span>
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>KIRIM ULANG EMAIL VERIFIKASI (5 MENIT)</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar / Ganti Akun</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-24 sm:pt-28 pb-16 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Profile Card Header */}
        <div className="bg-[#181818] border border-neutral-700/80 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[#367723] text-white font-mono font-bold text-xl flex items-center justify-center border-2 border-[#1f4813] shadow-md flex-shrink-0">
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                  {profile?.name}
                </h1>
                {profile?.isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase">
                    <CheckCircle className="w-3 h-3" />
                    <span>Terverifikasi</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase">
                    <AlertCircle className="w-3 h-3" />
                    <span>Belum Verifikasi</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 font-mono mt-0.5">{profile?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                  router.push('/');
                  router.refresh();
                });
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors border border-neutral-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Action Notification Banner */}
        {actionNotification && (
          <div
            className={`p-4 border text-xs flex items-center justify-between gap-3 shadow-lg ${
              actionNotification.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-200'
                : 'bg-rose-950/60 border-rose-600/70 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {actionNotification.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span className="font-medium">{actionNotification.message}</span>
            </div>
            <button
              onClick={() => setActionNotification(null)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-[#181818]">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'orders'
                ? 'text-white border-[#367723] bg-neutral-800/40'
                : 'text-neutral-400 hover:text-white border-transparent'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-sky-400" />
            <span>Pesanan Saya</span>
            {orders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-neutral-800 text-neutral-300 text-[10px] font-mono">
                {orders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-6 py-3.5 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'security'
                ? 'text-white border-[#367723] bg-neutral-800/40'
                : 'text-neutral-400 hover:text-white border-transparent'
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Keamanan &amp; Kata Sandi</span>
          </button>
        </div>

        {/* ================= TAB 1: PESANAN SAYA ================= */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {loadingOrders ? (
              <div className="p-12 text-center text-neutral-400 bg-[#181818] border border-neutral-800">
                <Loader2 className="w-8 h-8 animate-spin text-[#367723] mx-auto mb-2" />
                <p className="text-xs">Memuat daftar pesanan Anda...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="p-12 text-center bg-[#181818] border border-neutral-800 space-y-3">
                <ShoppingBag className="w-12 h-12 text-neutral-600 mx-auto" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                  Belum Ada Pesanan
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Anda belum pernah melakukan pembelian dengan akun ini. Jelajahi katalog produk kami sekarang!
                </p>
                <div className="pt-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#367723] hover:bg-[#418e2a] text-white text-xs font-black uppercase tracking-wider border-b-4 border-[#1f4813]"
                  >
                    <span>Mulai Belanja</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const displayItems =
                    order.items && order.items.length > 0
                      ? order.items
                      : [
                          {
                            id: order.id,
                            productId: '',
                            productName: order.productName || 'Produk Digital',
                            price: order.totalAmount || order.totalPrice || 0,
                            quantity: 1,
                            subtotal: order.totalAmount || order.totalPrice || 0,
                            imageUrl: order.productImage || '/images/products/default.png',
                            slug: order.productSlug || '',
                            game: 'minecraft',
                            deliveryType: 'automatic',
                          },
                        ];

                  const totalPay = order.totalAmount ?? order.totalPrice ?? 0;
                  const isPaid = ['paid', 'paid_manual', 'settlement', 'capture'].includes(order.paymentStatus);
                  const isCancelled = order.paymentStatus === 'cancelled' || order.orderStatus === 'cancelled';
                  const isExpired = (order.paymentStatus === 'expired' || order.orderStatus === 'expired') && !isCancelled;
                  const isPending =
                    ['pending', 'pending_manual', 'waiting_payment'].includes(order.paymentStatus) &&
                    !isCancelled &&
                    !isExpired;

                  return (
                    <div
                      key={order.id}
                      className="bg-[#181818] border border-neutral-700/80 hover:border-neutral-600 transition-all shadow-xl p-5 sm:p-6 space-y-4"
                    >
                      {/* Order Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono text-xs sm:text-sm font-black text-sky-400">
                            #{order.orderCode}
                          </span>
                          <span className="text-neutral-600">&bull;</span>
                          <span className="text-[11px] text-neutral-400">
                            {formatDate(order.createdAt)}
                          </span>
                          {order.paymentMethod && (
                            <>
                              <span className="text-neutral-600">&bull;</span>
                              <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-[10px] font-mono text-neutral-300">
                                {order.paymentMethod.toUpperCase()}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(order.paymentStatus)}
                          {getDeliveryBadge(order.deliveryStatus)}
                          {order.voucherCode && (
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">
                              Voucher: {order.voucherCode} (-{formatIDR(order.discountAmount)})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items List inside Order */}
                      <div className="divide-y divide-neutral-800/80">
                        {displayItems.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-14 h-14 bg-neutral-900 border border-neutral-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ShoppingBag className="w-6 h-6 text-neutral-600" />
                                )}
                              </div>

                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-1.5 py-0.5 bg-neutral-800 text-[10px] font-bold uppercase text-neutral-300">
                                    {item.game}
                                  </span>
                                  <span className="text-[10px] text-neutral-400 font-mono">
                                    {item.deliveryType === 'automatic' ? '⚡ Otomatis' : '🛠️ Manual'}
                                  </span>
                                </div>

                                <h4 className="text-sm font-bold text-white truncate max-w-sm sm:max-w-md">
                                  {item.productName}
                                </h4>

                                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                                  <span className="text-neutral-300 font-bold">{item.quantity}x</span>
                                  <span>@ {formatIDR(item.price)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-left sm:text-right flex-shrink-0 pl-16 sm:pl-0">
                              <span className="text-[10px] text-neutral-500 block uppercase font-mono">
                                Subtotal Item
                              </span>
                              <span className="font-mono font-bold text-xs sm:text-sm text-neutral-200">
                                {formatIDR(item.subtotal)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Order Card Footer */}
                      <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isPaid || order.deliveryStatus === 'delivered' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Data Akun Digital Siap</span>
                            </span>
                          ) : isPending ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Menunggu Pembayaran</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handlePayOrder(order)}
                                className="px-3 py-1 bg-[#ffc825] hover:bg-[#ffd659] text-neutral-950 font-black text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>Bayar Sekarang</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderToCancel(order);
                                  setCancelError('');
                                }}
                                className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-600/60 text-rose-300 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Batalkan</span>
                              </button>
                            </div>
                          ) : isCancelled ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Pesanan Dibatalkan</span>
                            </span>
                          ) : isExpired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pesanan Kedaluwarsa</span>
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-neutral-400 block uppercase font-mono">
                              Total Pembayaran
                            </span>
                            <span className="text-base sm:text-lg font-black font-mono text-[#22c55e]">
                              {formatIDR(totalPay)}
                            </span>
                          </div>

                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="px-4 py-2 bg-[#222222] hover:bg-[#2c2c2c] text-white text-xs font-bold uppercase tracking-wider border border-neutral-700 flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                            <span>Detail &amp; Akun</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: KEAMANAN & KATA SANDI ================= */}
        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Account Info & Email Verification */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-[#181818] border border-neutral-700/80 p-5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-white pb-2 border-b border-neutral-800 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-sky-400" />
                  <span>Status Email</span>
                </h3>

                <div>
                  <p className="text-[11px] text-neutral-400">Email Akun:</p>
                  <p className="font-mono text-xs text-white font-bold">{profile?.email}</p>
                </div>

                {profile?.isEmailVerified ? (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>Email Anda telah terverifikasi. Akun aman.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-950/40 border border-amber-700/60 text-amber-200 text-xs space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-amber-300">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span>Belum Terverifikasi</span>
                      </p>
                      <p className="text-[11px] text-neutral-300">
                        Verifikasi email penting untuk pemulihan kata sandi dan proteksi akun Anda.
                      </p>
                    </div>

                    {resendMessage && (
                      <div className="p-2.5 bg-emerald-950/50 border border-emerald-700 text-emerald-300 text-xs">
                        {resendMessage}
                      </div>
                    )}

                    {resendError && (
                      <div className="p-2.5 bg-rose-950/50 border border-rose-700 text-rose-300 text-xs">
                        {resendError}
                      </div>
                    )}

                    <button
                      onClick={handleResendVerification}
                      disabled={resendingEmail}
                      className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold uppercase tracking-wider border border-neutral-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {resendingEmail ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mail className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span>Kirim Ulang Link Verifikasi</span>
                    </button>
                  </div>
                )}

                <div className="pt-3 border-t border-neutral-800">
                  <p className="text-[11px] text-neutral-400">Metode Login:</p>
                  <p className="text-xs text-neutral-200 font-semibold mt-0.5">
                    {profile?.authProvider === 'google' && !profile?.hasPassword
                      ? 'Google Sign-In (Belum Ada Kata Sandi)'
                      : profile?.hasGoogleLinked || profile?.authProvider === 'both'
                      ? 'Email/Password & Google Terhubung'
                      : 'Email & Kata Sandi'}
                  </p>
                </div>
              </div>

              {/* Global Session Revocation Card */}
              <div className="bg-[#181818] border border-rose-900/40 p-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Logout Semua Sesi</span>
                </h3>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Jika Anda menduga akun Anda diakses di perangkat lain, gunakan fitur ini untuk mencabut akses semua sesi secara instan.
                </p>
                <button
                  onClick={handleLogoutAllSessions}
                  disabled={loggingOutAll}
                  className="w-full py-2.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {loggingOutAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5" />
                  )}
                  <span>Logout Semua Sesi</span>
                </button>
              </div>
            </div>

            {/* Right Col: Create / Change Password Form */}
            <div className="lg:col-span-2 bg-[#181818] border border-neutral-700/80 p-6 space-y-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#69c944]" />
                    <span>{profile?.hasPassword ? 'Ubah Kata Sandi' : 'Buat Kata Sandi Akun'}</span>
                  </h3>
                  {!profile?.hasPassword && (
                    <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase">
                      Google OAuth (Belum Ada Password)
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  {profile?.hasPassword
                    ? 'Mengubah kata sandi akan otomatis mencabut semua sesi login Anda di perangkat lain.'
                    : 'Akun Anda saat ini terhubung melalui Google. Buat kata sandi baru agar Anda juga dapat masuk langsung menggunakan email dan kata sandi.'}
                </p>
              </div>

              {passwordError && (
                <div className="p-3 bg-rose-950/50 border border-rose-700 text-rose-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>{passwordError}</div>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>{passwordSuccess}</div>
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
                {profile?.hasPassword && (
                  <div>
                    <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                      Kata Sandi Saat Ini *
                    </label>
                    <input
                      type="password"
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Masukkan kata sandi lama Anda"
                      className="w-full px-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                    Kata Sandi Baru *
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 8 karakter (huruf besar, kecil, angka)"
                    className="w-full px-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Wajib minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.
                  </p>
                </div>

                <div>
                  <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                    Konfirmasi Kata Sandi Baru *
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full px-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
                  />
                </div>

                {turnstileEnabled && (
                  <div className="pt-1">
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      resetKey={turnstileResetKey}
                      action="change-password"
                      onVerify={(tok) => setTurnstileToken(tok)}
                      onExpire={() => setTurnstileToken('')}
                      onError={() => setTurnstileToken('')}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={changingPassword}
                  className="py-3 px-5 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>MENYIMPAN...</span>
                    </>
                  ) : (
                    <span>{profile?.hasPassword ? 'PERBARUI KATA SANDI' : 'SIMPAN KATA SANDI BARU'}</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL DETAIL PESANAN ================= */}
        {selectedOrder && (() => {
          const modalItems =
            selectedOrder.items && selectedOrder.items.length > 0
              ? selectedOrder.items
              : [
                  {
                    id: selectedOrder.id,
                    productId: '',
                    productName: selectedOrder.productName || 'Produk Digital',
                    price: selectedOrder.totalAmount || selectedOrder.totalPrice || 0,
                    quantity: 1,
                    subtotal: selectedOrder.totalAmount || selectedOrder.totalPrice || 0,
                    imageUrl: selectedOrder.productImage || '/images/products/default.png',
                    slug: selectedOrder.productSlug || '',
                    game: 'minecraft',
                    deliveryType: 'automatic',
                  },
                ];

          const deliveryText =
            selectedOrder.deliveryContent ||
            selectedOrder.rawDelivery ||
            (typeof selectedOrder.credentials === 'string' ? selectedOrder.credentials : '') ||
            '';

          const parsedDeliveries: ParsedDeliveryItem[] = parseDeliveryContent(deliveryText);
          const isOrderPaid = ['paid', 'paid_manual', 'settlement', 'capture'].includes(selectedOrder.paymentStatus);
          const isPending = ['pending', 'pending_manual', 'waiting_payment'].includes(selectedOrder.paymentStatus);
          const totalBill = selectedOrder.totalAmount ?? selectedOrder.totalPrice ?? 0;

          return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-[#181818] border border-neutral-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-7 space-y-5">
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                  <div>
                    <span className="text-[10px] text-neutral-400 block uppercase font-mono tracking-wider">
                      Rincian Lengkap Transaksi
                    </span>
                    <h3 className="text-lg font-black font-mono text-sky-400">
                      #{selectedOrder.orderCode}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="p-2 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 transition-colors"
                    title="Tutup"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Status & Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#111111] border border-neutral-800 text-xs">
                  <div>
                    <span className="text-[10px] text-neutral-400 block uppercase">Waktu Pesan:</span>
                    <span className="text-neutral-200 font-mono text-[11px]">
                      {formatDate(selectedOrder.createdAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block uppercase">Metode Bayar:</span>
                    <span className="text-neutral-200 font-bold uppercase text-[11px]">
                      {selectedOrder.paymentMethod || 'Midtrans'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block uppercase">Pembayaran:</span>
                    <div className="mt-0.5">{getStatusBadge(selectedOrder.paymentStatus)}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block uppercase">Pengiriman:</span>
                    <div className="mt-0.5">{getDeliveryBadge(selectedOrder.deliveryStatus)}</div>
                  </div>
                </div>

                {/* Itemized Purchased Products */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      Barang yang Dibeli ({modalItems.length} Item)
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      Email Pembeli: {selectedOrder.customerEmail}
                    </span>
                  </div>

                  <div className="bg-[#111111] border border-neutral-800 divide-y divide-neutral-800">
                    {modalItems.map((item, idx) => (
                      <div key={item.id || idx} className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-13 h-13 bg-neutral-900 border border-neutral-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                className="w-12 h-12 object-cover"
                              />
                            ) : (
                              <ShoppingBag className="w-6 h-6 text-neutral-600" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[8px] font-black uppercase px-1.5 py-0.5 border ${
                                  item.game === 'roblox'
                                    ? 'bg-red-950/40 text-red-400 border-red-700/50'
                                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-700/50'
                                }`}
                              >
                                {item.game === 'roblox' ? 'ROBLOX' : 'MINECRAFT'}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {item.deliveryType === 'automatic' ? '⚡ Otomatis' : '🛠️ Manual'}
                              </span>
                            </div>
                            <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md mt-0.5">
                              {item.productName}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
                              <span className="text-neutral-300 font-bold">{item.quantity}x</span>
                              <span>@ {formatIDR(item.price)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 pl-4">
                          <span className="text-[10px] text-neutral-500 block uppercase font-mono">
                            Subtotal
                          </span>
                          <span className="font-mono font-bold text-xs sm:text-sm text-neutral-200">
                            {formatIDR(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Digital Delivery / Credentials (if paid or delivered) */}
                {(isOrderPaid || selectedOrder.deliveryStatus === 'delivered') && deliveryText && (
                  <div className="p-4 sm:p-5 bg-[#09172e] border-2 border-cyan-500 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-cyan-500/30">
                      <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase tracking-wider">
                        <Key className="w-4 h-4 text-cyan-400" />
                        <span>DATA PENGIRIMAN DIGITAL / KREDENSIAL AKUN</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyDeliveryData(deliveryText, 'all')}
                        className="px-3 py-1 bg-[#ffc825] hover:bg-[#ffcf3d] text-neutral-950 text-[11px] font-bold uppercase flex items-center gap-1.5 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedField === 'all' ? 'TERSALIN' : 'SALIN SEMUA'}</span>
                      </button>
                    </div>

                    {parsedDeliveries.length > 0 ? (
                      <div className="space-y-3">
                        {parsedDeliveries.map((item, accIdx) => (
                          <div key={accIdx} className="p-3.5 bg-black/70 border border-cyan-500/40 space-y-2.5">
                            {parsedDeliveries.length > 1 && (
                              <div className="flex items-center justify-between pb-1 border-b border-cyan-950 text-[10px] text-cyan-400 font-mono font-bold">
                                <span>Unit #{accIdx + 1}</span>
                              </div>
                            )}

                            {/* Email / Username */}
                            {item.email && (
                              <div className="p-2.5 bg-black/90 border border-cyan-500/30 flex items-center justify-between gap-2">
                                <div className="space-y-0.5 overflow-hidden">
                                  <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Mail className="w-3 h-3 text-cyan-400" />
                                    <span>Email / Username:</span>
                                  </span>
                                  <p className="font-mono text-xs text-cyan-200 font-bold select-all truncate">
                                    {item.email}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => copyDeliveryData(item.email || '', `email-${accIdx}`)}
                                  className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold uppercase transition-all flex-shrink-0"
                                >
                                  {copiedField === `email-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                                </button>
                              </div>
                            )}

                            {/* Password */}
                            {item.password && (
                              <div className="p-2.5 bg-black/90 border border-cyan-500/30 flex items-center justify-between gap-2">
                                <div className="space-y-0.5 overflow-hidden">
                                  <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Lock className="w-3 h-3 text-amber-400" />
                                    <span>Kata Sandi:</span>
                                  </span>
                                  <p className="font-mono text-xs text-amber-300 font-bold select-all truncate">
                                    {showPassword ? item.password : '••••••••••••••••'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="p-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300"
                                    title={showPassword ? 'Sembunyikan Password' : 'Lihat Password'}
                                  >
                                    {showPassword ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyDeliveryData(item.password || '', `password-${accIdx}`)
                                    }
                                    className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold uppercase transition-all"
                                  >
                                    {copiedField === `password-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Redeem Code */}
                            {item.code && (
                              <div className="p-2.5 bg-black/90 border border-amber-500/40 flex items-center justify-between gap-2">
                                <div className="space-y-0.5 overflow-hidden">
                                  <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Key className="w-3 h-3 text-amber-400" />
                                    <span>Kode Lisensi / Redeem:</span>
                                  </span>
                                  <p className="font-mono text-xs sm:text-sm text-amber-300 font-black select-all truncate">
                                    {item.code}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => copyDeliveryData(item.code || '', `code-${accIdx}`)}
                                  className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-500/50 text-amber-300 text-[10px] font-bold uppercase transition-all flex-shrink-0"
                                >
                                  {copiedField === `code-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                                </button>
                              </div>
                            )}

                            {/* Roblox Username & Server */}
                            {(item.robloxUsername || item.privateServerUrl) && (
                              <div className="p-2.5 bg-black/90 border border-red-500/40 space-y-2">
                                {item.robloxUsername && (
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <span className="text-[9px] text-neutral-400 font-bold uppercase block">
                                        Roblox Admin Username:
                                      </span>
                                      <span className="font-mono text-xs text-red-300 font-bold select-all">
                                        {item.robloxUsername}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyDeliveryData(
                                          item.robloxUsername || '',
                                          `roblox-user-${accIdx}`
                                        )
                                      }
                                      className="px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-300 text-[10px] font-bold uppercase transition-all"
                                    >
                                      {copiedField === `roblox-user-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                                    </button>
                                  </div>
                                )}
                                {item.privateServerUrl && (
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-red-950">
                                    <div className="overflow-hidden">
                                      <span className="text-[9px] text-neutral-400 font-bold uppercase block">
                                        Link World Private Server:
                                      </span>
                                      <a
                                        href={item.privateServerUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono text-xs text-sky-400 underline truncate block"
                                      >
                                        {item.privateServerUrl}
                                      </a>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        copyDeliveryData(
                                          item.privateServerUrl || '',
                                          `roblox-link-${accIdx}`
                                        )
                                      }
                                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] font-bold uppercase transition-all"
                                    >
                                      {copiedField === `roblox-link-${accIdx}` ? 'TERSALIN' : 'SALIN'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Notes */}
                            {item.notes && (
                              <div className="p-2.5 bg-[#111111] border border-neutral-800 text-[11px] text-neutral-300 flex items-start gap-2">
                                <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold text-neutral-200">
                                    Catatan / Panduan:
                                  </span>{' '}
                                  <span>{item.notes}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-black/80 font-mono text-xs text-cyan-200 break-all select-all border border-cyan-500/30">
                        {deliveryText}
                      </div>
                    )}
                  </div>
                )}

                {/* Pending Notice */}
                {isPending && (
                  <div className="p-4 bg-amber-950/40 border border-amber-600/70 space-y-3">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Menunggu Pembayaran</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Pesanan ini belum diselesaikan. Anda dapat langsung membayar melalui popup Midtrans Snap atau membatalkan pesanan secara langsung di sini tanpa perlu membuka halaman cek pesanan.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePayOrder(selectedOrder)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ffc825] hover:bg-[#ffd659] text-neutral-950 text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Bayar Sekarang &rarr;</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOrderToCancel(selectedOrder);
                          setCancelError('');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-600/70 text-rose-300 text-xs font-bold uppercase tracking-wider transition-colors"
                      >
                        <X className="w-4 h-4" />
                        <span>Batalkan Pesanan</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Cancelled Notice */}
                {(selectedOrder.paymentStatus === 'cancelled' || selectedOrder.orderStatus === 'cancelled') && (
                  <div className="p-4 bg-rose-950/40 border border-rose-700/70 space-y-2">
                    <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span>Pesanan Telah Dibatalkan</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Pesanan ini telah dibatalkan. Tagihan atau transaksi Midtrans terkait telah ditutup dan tidak dapat dibayar lagi.
                    </p>
                  </div>
                )}

                {/* Expired Notice */}
                {(selectedOrder.paymentStatus === 'expired' || selectedOrder.orderStatus === 'expired') &&
                  selectedOrder.paymentStatus !== 'cancelled' &&
                  selectedOrder.orderStatus !== 'cancelled' && (
                    <div className="p-4 bg-amber-950/40 border border-amber-600/70 space-y-2">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>Pesanan Telah Kedaluwarsa (15 Menit)</span>
                      </div>
                      <p className="text-xs text-neutral-300 leading-relaxed">
                        Batas waktu pembayaran 15 menit telah terlewati. Pesanan ini telah kedaluwarsa secara otomatis.
                      </p>
                    </div>
                  )}

                {/* Price Breakdown */}
                <div className="space-y-2 text-xs text-neutral-300 border-t border-neutral-800 pt-4">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Subtotal Produk:</span>
                    <span className="font-mono font-medium text-white">
                      {formatIDR(selectedOrder.productSubtotal || 0)}
                    </span>
                  </div>
                  {selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Diskon Voucher ({selectedOrder.voucherCode || 'HEMAT'}):</span>
                      <span className="font-mono font-bold">
                        -{formatIDR(selectedOrder.discountAmount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Biaya Layanan / Admin:</span>
                    <span className="font-mono text-neutral-300">
                      {selectedOrder.adminFee > 0
                        ? `+${formatIDR(selectedOrder.adminFee)}`
                        : 'Rp 0 (Gratis)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-black text-white pt-2.5 border-t border-neutral-800">
                    <span className="uppercase tracking-wider">Total Pembayaran:</span>
                    <span className="font-mono text-base sm:text-lg text-[#22c55e]">
                      {formatIDR(totalBill)}
                    </span>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-3">
                  <Link
                    href={`/check-order?order_code=${selectedOrder.orderCode}&email=${encodeURIComponent(selectedOrder.customerEmail)}`}
                    target="_blank"
                    className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Halaman Bukti Transaksi</span>
                  </Link>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Cancellation Confirmation Dialog */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-rose-600/70 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-sm">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>Konfirmasi Pembatalan Pesanan</span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Apakah Anda yakin ingin membatalkan pesanan{' '}
              <span className="font-mono font-bold text-white">#{orderToCancel.orderCode}</span>?
              Tagihan Midtrans akan ditutup dan status pesanan akan langsung diubah menjadi{' '}
              <span className="text-rose-400 font-semibold">Dibatalkan</span>.
            </p>

            {cancelError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setOrderToCancel(null);
                  setCancelError('');
                }}
                disabled={cancellingOrder}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelOrder}
                disabled={cancellingOrder}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md"
              >
                {cancellingOrder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Membatalkan...</span>
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5" />
                    <span>Ya, Batalkan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Midtrans Snap JS SDK */}
      <Script
        src={
          process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
            ? 'https://app.midtrans.com/snap/snap.js'
            : 'https://app.sandbox.midtrans.com/snap/snap.js'
        }
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''}
        strategy="afterInteractive"
      />
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
        </div>
      }
    >
      <AccountContent />
    </Suspense>
  );
}
