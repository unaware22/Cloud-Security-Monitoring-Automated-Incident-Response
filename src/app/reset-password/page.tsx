'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, ShieldCheck, ArrowRight, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import TurnstileWidget from '@/components/security/TurnstileWidget';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const turnstileEnabled = Boolean(turnstileSiteKey && !turnstileSiteKey.includes('REPLACE_ME'));

  const resetTurnstile = () => {
    setTurnstileToken('');
    setTurnstileResetKey((prev) => prev + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!token) {
      setErrorMessage('Token reset tidak valid atau tidak ditemukan di URL.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Kata sandi baru minimal 8 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Harap selesaikan verifikasi CAPTCHA.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Gagal mereset kata sandi. Token mungkin sudah kedaluwarsa.');
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      setSuccessMessage(
        'Kata sandi Anda berhasil diperbarui! Semua sesi aktif sebelumnya telah dihentikan demi keamanan. Mengalihkan ke halaman login...'
      );
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan. Silakan coba lagi.');
      resetTurnstile();
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

      <div className="w-full max-w-md bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-sky-500/20 border border-sky-500/50 mb-2">
            <ShieldCheck className="w-6 h-6 text-sky-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
            ATUR KATA SANDI BARU
          </h1>
          {email && (
            <p className="text-xs text-neutral-400">
              Untuk akun: <span className="font-mono text-white font-bold">{email}</span>
            </p>
          )}
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-950/50 border border-rose-700 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {successMessage ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/50 border border-emerald-700 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">{successMessage}</div>
            </div>
            <Link
              href="/login"
              className="w-full py-3 px-4 bg-[#367723] hover:bg-[#418e2a] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <span>MASUK SEKARANG</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : !token ? (
          <div className="p-4 bg-amber-950/50 border border-amber-700 text-amber-200 text-xs space-y-3">
            <p>Token pemulihan kata sandi tidak ditemukan atau link sudah kedaluwarsa.</p>
            <Link
              href="/forgot-password"
              className="inline-block py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase"
            >
              Minta Tautan Baru
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Kata Sandi Baru *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Konfirmasi Kata Sandi Baru *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Turnstile */}
            {turnstileEnabled && (
              <div className="pt-1">
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  resetKey={turnstileResetKey}
                  action="reset-password"
                  onVerify={(tok) => setTurnstileToken(tok)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => setTurnstileToken('')}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>MEMPERBARUI KATA SANDI...</span>
                </>
              ) : (
                <>
                  <span>SIMPAN KATA SANDI BARU</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
