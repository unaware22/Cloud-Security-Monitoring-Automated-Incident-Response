'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

export default function AdminSecurityPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword !== confirmPassword) {
      setErrorMessage('Konfirmasi password baru tidak sama.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/security/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.message || 'Password gagal diubah.');
        setLoading(false);
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage(result.message);
      window.setTimeout(() => router.replace('/admin/login'), 1500);
    } catch {
      setErrorMessage('Terjadi gangguan jaringan. Silakan coba kembali.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-emerald-950/60 border border-emerald-800">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-wide">KEAMANAN AKUN</h1>
          <p className="mt-1 text-xs text-neutral-400">
            Ganti password admin dan cabut seluruh sesi yang pernah dibuat dengan password lama.
          </p>
        </div>
      </div>

      <div className="bg-[#181818] border border-neutral-700 p-6 sm:p-8">
        <div className="mb-6 p-4 bg-amber-950/40 border border-amber-800/60 text-xs text-amber-100 leading-relaxed">
          Setelah password diubah, perangkat ini dan semua perangkat lain akan logout. Masuk kembali
          menggunakan password baru dan jangan membagikannya kepada siapa pun.
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-950/70 border border-rose-600/60 flex items-center gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 p-3.5 bg-emerald-950/70 border border-emerald-600/60 flex items-center gap-2.5 text-xs text-emerald-100">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <PasswordField
            label="Password saat ini"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            label="Password baru"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <PasswordField
            label="Ulangi password baru"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <p className="text-[11px] text-neutral-400">
            Minimal 14 karakter serta mengandung huruf besar, huruf kecil, angka, dan simbol.
          </p>

          <button
            type="submit"
            disabled={loading || Boolean(successMessage)}
            className="w-full sm:w-auto px-6 py-3 bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 text-xs font-black tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            UBAH PASSWORD &amp; CABUT SEMUA SESI
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-xs font-bold uppercase tracking-wider text-neutral-300">
        {label}
      </span>
      <input
        type="password"
        required
        minLength={label === 'Password saat ini' ? 1 : 14}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="w-full px-4 py-3 bg-[#111111] border border-neutral-700 text-sm text-white focus:outline-none focus:border-[#367723]"
      />
    </label>
  );
}
