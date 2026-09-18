'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, KeyRound, ArrowRight, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import TurnstileWidget from '@/components/security/TurnstileWidget';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
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

    if (!email.trim()) {
      setErrorMessage('Alamat email wajib diisi.');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setErrorMessage('Harap selesaikan verifikasi CAPTCHA terlebih dahulu.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          turnstile_token: turnstileToken || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || 'Gagal memproses permintaan reset kata sandi.');
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      setSuccessMessage(
        'Jika alamat email terdaftar, kami telah mengirimkan instruksi dan tautan pemulihan kata sandi ke email Anda. Silakan periksa kotak masuk atau spam.'
      );
      setSubmitting(false);
    } catch {
      setErrorMessage('Terjadi kesalahan jaringan. Silakan coba beberapa saat lagi.');
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
          <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/20 border border-amber-500/50 mb-2">
            <KeyRound className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
            LUPA KATA SANDI
          </h1>
          <p className="text-xs text-neutral-400">
            Masukkan email Anda untuk menerima instruksi pemulihan kata sandi
          </p>
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
              className="w-full py-3 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Halaman Masuk</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-neutral-300 font-bold mb-1.5 uppercase tracking-wider">
                Alamat Email Akun
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Turnstile */}
            {turnstileEnabled && (
              <div className="pt-1">
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  resetKey={turnstileResetKey}
                  action="forgot-password"
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
                  <span>MENGIRIMKAN TAUTAN...</span>
                </>
              ) : (
                <>
                  <span>KIRIM TAUTAN RESET</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Batal, kembali ke Masuk</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
