'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Lock,
  Mail,
  Key,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@store.local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.message || 'Email atau password admin salah');
        setLoading(false);
        return;
      }

      router.push('/admin/dashboard');
    } catch {
      setErrorMessage('Terjadi gangguan jaringan');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
        <Link href="/" className="inline-block group select-none">
          <img
            src="/images/logo2.png"
            alt="SALADINSHOP"
            className="h-12 w-auto mx-auto object-contain drop-shadow"
          />
        </Link>
        <h2 className="minecraft-font-folder text-xl sm:text-2xl text-white tracking-wide font-normal">
          PORTAL MASUK ADMIN
        </h2>
        <p className="text-xs text-neutral-400">
          Akses khusus administrator &amp; pengelolaan pesanan digital SALADINSHOP
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="p-6 sm:p-8 rounded-none bg-[#181818] border border-neutral-700 shadow-2xl space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-none bg-rose-950/70 border border-rose-600/60 flex items-center gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                Email Admin
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@store.local"
                  className="w-full pl-10 pr-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wider select-none disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>MEMVERIFIKASI...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>MASUK SEBAGAI ADMIN</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-neutral-800 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Beranda Toko</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
