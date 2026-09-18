'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  UserPlus,
  Lock,
  Mail,
  User,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Clock,
} from 'lucide-react';
import TurnstileWidget from '@/components/security/TurnstileWidget';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/account';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Post-registration email verification pending state
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendErr, setResendErr] = useState('');

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const turnstileEnabled = Boolean(turnstileSiteKey && !turnstileSiteKey.includes('REPLACE_ME'));

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileResetKey((prev) => prev + 1);
  };

  // If already logged in, redirect
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!name.trim() || !email.trim() || !password) {
      setErrorMessage('Semua kolom bertanda bintang wajib diisi.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Kata sandi minimal 8 karakter demi keamanan akun Anda.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Harap selesaikan verifikasi CAPTCHA sebelum mendaftar.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Pendaftaran gagal.');
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      // Registration success: require email verification before dashboard entry
      setRegisteredEmail(email.trim());
      setSubmitting(false);
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan. Silakan coba lagi.');
      resetTurnstile();
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResending(true);
    setResendMsg('');
    setResendErr('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendMsg(data.message || 'Tautan verifikasi baru (berlaku 5 menit) telah dikirimkan ke email Anda.');
      } else {
        setResendErr(data.message || 'Gagal mengirim ulang email verifikasi.');
      }
    } catch {
      setResendErr('Terjadi kesalahan jaringan.');
    } finally {
      setResending(false);
    }
  };

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

      if (!res.ok) {
        setErrorMessage(data.message || 'Pendaftaran dengan Google gagal.');
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      setSuccessMessage('Berhasil mendaftar & masuk dengan Google! Mengalihkan...');
      setTimeout(() => {
        router.push(redirectUrl);
        router.refresh();
      }, 800);
    } catch {
      setErrorMessage('Terjadi kesalahan saat memverifikasi akun Google.');
      setSubmitting(false);
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

      {registeredEmail ? (
        /* Screen: Email Verification Required Before Dashboard Entry */
        <div className="w-full max-w-md bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6 text-center animate-fadeIn">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full mx-auto">
            <Mail className="w-8 h-8 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
              PENDAFTARAN BERHASIL!
            </h1>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Tautan aktivasi akun telah dikirimkan ke: <br />
              <strong className="text-white font-mono text-sm">{registeredEmail}</strong>
            </p>
          </div>

          <div className="p-3.5 bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs text-left space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Masa Berlaku Tautan: 5 Menit</span>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Demi keamanan akun, Anda <strong>wajib memverifikasi email</strong> terlebih dahulu sebelum dapat masuk ke dashboard akun. Periksa folder <strong>Inbox</strong> atau <strong>Spam</strong>.
            </p>
          </div>

          {resendMsg && (
            <div className="p-2.5 bg-emerald-950/40 border border-emerald-700 text-emerald-300 text-xs">
              {resendMsg}
            </div>
          )}

          {resendErr && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-700 text-rose-300 text-xs">
              {resendErr}
            </div>
          )}

          <div className="pt-2 space-y-3">
            <Link
              href="/login"
              className="w-full py-3 px-4 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg"
            >
              <span>KE HALAMAN MASUK (LOGIN)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold uppercase tracking-wider border border-neutral-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-amber-400" />}
              <span>Kirim Ulang Email Verifikasi</span>
            </button>
          </div>
        </div>
      ) : (
        /* Regular Registration Form */
        <div className="w-full max-w-md bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#367723]/20 border border-[#367723]/60 mb-2">
              <UserPlus className="w-6 h-6 text-[#69c944]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
              BUAT AKUN BARU
            </h1>
            <p className="text-xs text-neutral-400">
              Daftar untuk menyimpan riwayat pesanan dan klaim voucher diskon
            </p>
          </div>

          {/* Notifications */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/50 border border-rose-700 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* Google Quick Sign-up */}
          <div className="space-y-3">
            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={(err) => setErrorMessage(err)}
              text="signup_with"
              disabled={submitting}
            />

            <div className="flex items-center gap-3 my-4">
              <div className="flex-grow border-t border-neutral-800" />
              <span className="text-[10px] sm:text-[11px] text-neutral-500 font-bold uppercase tracking-wider whitespace-nowrap select-none">
                ATAU DAFTAR DENGAN EMAIL
              </span>
              <div className="flex-grow border-t border-neutral-800" />
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Nama Lengkap *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Alamat Email *
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
              <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Tautan verifikasi akan dikirim dan berlaku selama 5 menit.</span>
              </p>
            </div>

            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Kata Sandi *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-[#367723]"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Konfirmasi Kata Sandi *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi"
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
                  action="user-register"
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
                  <span>MENDAFTARKAN...</span>
                </>
              ) : (
                <>
                  <span>DAFTAR SEKARANG</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer info */}
          <div className="text-center pt-2 border-t border-neutral-800 text-xs text-neutral-400">
            Sudah punya akun?{' '}
            <Link
              href={`/login${redirectUrl !== '/account' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`}
              className="text-[#69c944] hover:text-[#84e060] font-bold uppercase"
            >
              Masuk di sini &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
