'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Mail, AlertCircle } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [resendFeedback, setResendFeedback] = useState('');

  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setSuccess(false);
      setMessage('Token verifikasi tidak ditemukan di tautan.');
      return;
    }

    if (hasRunRef.current) return;
    hasRunRef.current = true;

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.success) {
          setSuccess(true);
          setMessage(json.message || 'Alamat email Anda berhasil diverifikasi!');
        } else {
          setSuccess(false);
          setMessage(json.message || 'Tautan verifikasi tidak valid atau telah kedaluwarsa (maksimal 5 menit).');
        }
      } catch {
        setSuccess(false);
        setMessage('Gagal menghubungi server untuk memverifikasi email.');
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setResending(true);
    setResendStatus('idle');
    setResendFeedback('');

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setResendStatus('success');
        setResendFeedback(data.message || 'Tautan verifikasi baru (berlaku 5 menit) telah dikirimkan ke email Anda.');
      } else {
        setResendStatus('error');
        setResendFeedback(data.message || 'Gagal mengirim ulang email verifikasi.');
      }
    } catch {
      setResendStatus('error');
      setResendFeedback('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setResending(false);
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

      <div className="w-full max-w-md bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-6 text-center">
        {loading ? (
          <div className="space-y-4 py-8">
            <Loader2 className="w-12 h-12 animate-spin text-[#367723] mx-auto" />
            <h2 className="text-base font-bold uppercase tracking-wider text-white">
              Memverifikasi Email...
            </h2>
            <p className="text-xs text-neutral-400">
              Mohon tunggu sejenak sementara sistem memeriksa token aktivasi akun Anda.
            </p>
          </div>
        ) : success ? (
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                VERIFIKASI BERHASIL!
              </h2>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {message}
              </p>
              <p className="text-[11px] text-emerald-400 font-semibold">
                Sesi login Anda telah otomatis aktif.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                href="/account"
                className="w-full py-3 px-4 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <span>BUKA DASHBOARD AKUN SAYA</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/"
                className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider"
              >
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-500/20 border-2 border-rose-500 rounded-full mx-auto">
              <XCircle className="w-8 h-8 text-rose-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-rose-400">
                VERIFIKASI TIDAK BERHASIL
              </h2>
              <p className="text-xs text-neutral-300 leading-relaxed">
                {message}
              </p>
            </div>

            {/* Resend Form */}
            <form onSubmit={handleResend} className="p-4 bg-neutral-900 border border-neutral-800 text-left space-y-3">
              <div className="flex items-center gap-2 text-neutral-300 text-xs font-bold uppercase tracking-wider">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>Kirim Ulang Link Verifikasi (5 Menit)</span>
              </div>
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="Masukkan email Anda"
                className="w-full px-3 py-2 bg-[#111111] border border-neutral-700 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-amber-500"
              />

              {resendFeedback && (
                <div
                  className={`p-2 text-[11px] ${
                    resendStatus === 'success'
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-700'
                      : 'bg-rose-950/40 text-rose-300 border border-rose-700'
                  }`}
                >
                  {resendFeedback}
                </div>
              )}

              <button
                type="submit"
                disabled={resending || !resendEmail.trim()}
                className="w-full py-2 bg-[#367723] hover:bg-[#418e2a] text-white text-xs font-bold uppercase tracking-wider border-b-2 border-[#1f4813] flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Kirim Ulang Email Aktivasi'}
              </button>
            </form>

            <div className="pt-1">
              <Link
                href="/login"
                className="text-neutral-400 hover:text-white text-xs font-semibold"
              >
                Kembali ke Halaman Masuk &rarr;
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111111] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#367723]" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
