'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Lock, Mail, Loader2, AlertCircle, CheckCircle, ArrowRight, KeyRound } from 'lucide-react';
import TurnstileWidget from '@/components/security/TurnstileWidget';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Unverified email state
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendVerificationMessage, setResendVerificationMessage] = useState<string | null>(null);

  // Link account state (when Google login detects existing password account)
  const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
  const [pendingGoogleEmail, setPendingGoogleEmail] = useState<string | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [linkingAccount, setLinkingAccount] = useState(false);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const turnstileEnabled = Boolean(turnstileSiteKey && !turnstileSiteKey.includes('REPLACE_ME'));

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileResetKey((prev) => prev + 1);
  };

  // Check if already logged in
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          router.replace(redirectUrl);
        }
      })
      .catch(() => {});
  }, [router, redirectUrl]);

  // Handle resend verification email for unverified user
  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    setResendingVerification(true);
    setResendVerificationMessage(null);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendVerificationMessage(
          data.message || 'Tautan verifikasi baru (berlaku 5 menit) telah dikirim ke email Anda.'
        );
      } else {
        setResendVerificationMessage(data.message || 'Gagal mengirim ulang email verifikasi.');
      }
    } catch {
      setResendVerificationMessage('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setResendingVerification(false);
    }
  };

  // Handle standard email/password login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setUnverifiedEmail(null);
    setResendVerificationMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Email dan password wajib diisi.');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Harap selesaikan verifikasi CAPTCHA.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(data.email || email.trim());
          setErrorMessage(
            data.message ||
              'Akun Anda belum diverifikasi. Silakan buka email Anda dan klik tombol verifikasi dalam batas waktu 5 menit.'
          );
        } else {
          setErrorMessage(data.message || 'Gagal masuk ke akun.');
        }
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      setSuccessMessage('Berhasil masuk! Mengalihkan...');
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 800);
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan. Silakan coba lagi.');
      resetTurnstile();
      setSubmitting(false);
    }
  };

  // Handle Google Login response
  const handleGoogleSuccess = async (googleIdToken: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_id_token: googleIdToken,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409 && data.code === 'ACCOUNT_EXISTS_REQUIRES_PASSWORD') {
        // Account exists with password. Prompt for password verification to prevent account takeover.
        setPendingGoogleToken(googleIdToken);
        setPendingGoogleEmail(data.email || 'akun terdaftar');
        setErrorMessage(
          'Email akun Google Anda sudah terdaftar di sistem dengan kata sandi. Demi keamanan, masukkan kata sandi akun Anda untuk menghubungkan akun Google ini.'
        );
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setErrorMessage(data.message || 'Login dengan Google gagal.');
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      setSuccessMessage('Berhasil masuk dengan Google! Mengalihkan...');
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 800);
    } catch {
      setErrorMessage('Terjadi kesalahan saat memverifikasi akun Google.');
      setSubmitting(false);
    }
  };

  // Handle linking Google account by confirming password
  const handleLinkGoogleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleToken || !linkPassword) return;

    setLinkingAccount(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/google/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_id_token: pendingGoogleToken,
          password: linkPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Kata sandi salah. Gagal menghubungkan Google.');
        setLinkingAccount(false);
        return;
      }

      setSuccessMessage('Akun Google berhasil dihubungkan! Mengalihkan...');
      setPendingGoogleToken(null);
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 800);
    } catch {
      setErrorMessage('Gagal menghubungkan akun. Silakan coba lagi.');
      setLinkingAccount(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white py-10 sm:py-16 px-4 flex flex-col items-center justify-center">
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

      <div className="w-full max-w-md bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#367723]/20 border border-[#367723]/60 mb-2">
            <Lock className="w-6 h-6 text-[#69c944]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
            MASUK KE AKUN
          </h1>
          <p className="text-xs text-neutral-400">
            Akses riwayat pesanan, voucher hemat, dan detail pembelian Anda
          </p>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-950/50 border border-rose-700 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Unverified Email Resend Notice */}
        {unverifiedEmail && (
          <div className="p-4 bg-amber-950/40 border border-amber-600/80 text-left space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <Mail className="w-4 h-4" />
              <span>Verifikasi Email Diperlukan (5 Menit)</span>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Akun dengan email <strong className="text-white">{unverifiedEmail}</strong> belum aktif karena email belum diverifikasi. Tautan verifikasi hanya berlaku selama <strong>5 menit</strong> setelah dibuat.
            </p>
            {resendVerificationMessage && (
              <div className="p-2 text-[11px] bg-neutral-900 border border-neutral-700 text-amber-300">
                {resendVerificationMessage}
              </div>
            )}
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {resendingVerification ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>MENGIRIM ULANG...</span>
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5" />
                  <span>Kirim Ulang Link Verifikasi</span>
                </>
              )}
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{successMessage}</div>
          </div>
        )}

        {/* Modal/Prompt to link Google account with password */}
        {pendingGoogleToken && (
          <form onSubmit={handleLinkGoogleAccount} className="p-4 bg-amber-950/30 border border-amber-600 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <KeyRound className="w-4 h-4" />
              <span>Verifikasi Kepemilikan Akun</span>
            </div>
            <p className="text-[11px] text-neutral-300">
              Ketik kata sandi untuk akun <strong className="text-white">{pendingGoogleEmail}</strong> untuk mengotorisasi penautan akun Google ini:
            </p>
            <div>
              <input
                type="password"
                required
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                placeholder="Masukkan kata sandi akun Anda"
                className="w-full px-3 py-2 bg-[#111111] border border-neutral-700 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={linkingAccount}
                className="flex-1 py-2 bg-[#367723] hover:bg-[#418e2a] text-white text-xs font-black uppercase tracking-wider border-b-2 border-[#1f4813] flex items-center justify-center gap-1.5"
              >
                {linkingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Tautkan & Masuk'}
              </button>
              <button
                type="button"
                onClick={() => setPendingGoogleToken(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 text-xs font-bold uppercase hover:bg-neutral-700"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Google Sign-in Section */}
        <div className="space-y-3">
          <GoogleSignInButton
            onSuccess={handleGoogleSuccess}
            onError={(err) => setErrorMessage(err)}
            text="signin_with"
            disabled={submitting}
          />

          <div className="flex items-center gap-3 my-4">
            <div className="flex-grow border-t border-neutral-800" />
            <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold uppercase tracking-wider whitespace-nowrap select-none">
              ATAU DENGAN EMAIL
            </span>
            <div className="flex-grow border-t border-neutral-800" />
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-neutral-300 font-bold uppercase tracking-wider">
                Kata Sandi
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-[#69c944] hover:text-[#84e060] font-semibold"
              >
                Lupa sandi?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
              />
            </div>
          </div>

          {/* Turnstile */}
          {turnstileEnabled && (
            <div className="pt-1">
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetKey={turnstileResetKey}
                action="login"
                onVerify={(tok) => setTurnstileToken(tok)}
                onExpire={() => setTurnstileToken('')}
                onError={() => setTurnstileToken('')}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>MEMVERIFIKASI...</span>
              </>
            ) : (
              <>
                <span>MASUK KE AKUN</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center pt-2 border-t border-neutral-800 text-xs text-neutral-400">
          Belum punya akun?{' '}
          <Link
            href={`/register${redirectUrl !== '/account' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
            className="text-[#69c944] hover:text-[#84e060] font-bold uppercase"
          >
            Daftar Sekarang &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
