'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Fingerprint, Loader2, RefreshCw, Repeat, Unlock, UserX } from 'lucide-react';
import { formatDate } from '@/lib/utils';

type Penalty = {
  id: string;
  kind: 'device' | 'account';
  subjectRef: string;
  label: string | null;
  eventType: string;
  reason: string;
  ipAddress: string;
  userAgent: string | null;
  strike: number;
  expiresAt: string;
  liftedAt: string | null;
  liftedBy: string | null;
  hitCount: number;
  lastHitAt: string | null;
  lastHitIp: string | null;
  createdAt: string;
};

type ResponseData = {
  active: Penalty[];
  history: Penalty[];
  summary: { active: number; blocked_requests_24h: number; repeat_offenders: number };
};

const EMPTY: ResponseData = {
  active: [],
  history: [],
  summary: { active: 0, blocked_requests_24h: 0, repeat_offenders: 0 },
};

export default function AdminDeviceBansPage() {
  const [data, setData] = useState<ResponseData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const response = await fetch('/api/admin/security/penalties', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Data pembatasan gagal dimuat.');
      setData(result.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data pembatasan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(false), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const lift = async (item: Penalty) => {
    if (!window.confirm(`Buka pembatasan ${item.kind} ${item.subjectRef}?`)) return;
    setBusy(item.id);
    try {
      const response = await fetch('/api/admin/security/penalties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Gagal membuka pembatasan.');
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuka pembatasan.');
    } finally {
      setBusy(null);
    }
  };

  const remaining = (iso: string) => {
    if (now === null) return '...';
    const total = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
    return `${Math.floor(total / 60)}m ${total % 60}d`;
  };

  const status = (p: Penalty) => {
    if (p.liftedAt) return { label: 'Dibuka admin', cls: 'text-emerald-300' };
    if (new Date(p.expiresAt).getTime() <= (now ?? Date.now())) return { label: 'Berakhir', cls: 'text-neutral-500' };
    return { label: 'Aktif', cls: 'text-rose-300' };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Fingerprint className="w-6 h-6 text-rose-400" />
            <span>Device &amp; Account Ban</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Pembatasan sementara 30–60 menit berdasarkan cookie perangkat dan akun, sehingga
            berganti IP/VPN tidak membuka blokir. Seluruh kejadian dikirim ke log Wazuh.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="px-3.5 py-2 bg-[#181818] hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-300 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card label="Pembatasan Aktif" value={data.summary.active} icon={<UserX className="w-4 h-4" />} />
        <Card label="Request Ditolak (24j)" value={data.summary.blocked_requests_24h} icon={<AlertTriangle className="w-4 h-4" />} />
        <Card label="Pelanggar Berulang" value={data.summary.repeat_offenders} icon={<Repeat className="w-4 h-4" />} />
      </div>

      {error && (
        <div className="p-3.5 bg-rose-950/70 border border-rose-700 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <section className="p-5 sm:p-6 bg-[#181818] border border-neutral-700 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wider">Sedang Dibatasi</h2>
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
          </div>
        ) : data.active.length === 0 ? (
          <div className="py-10 text-center text-xs text-neutral-500 border border-dashed border-neutral-700">
            Tidak ada perangkat atau akun yang sedang dibatasi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-400 border-b border-neutral-700">
                <tr>
                  <th className="pb-3">Jenis</th>
                  <th className="pb-3">Referensi</th>
                  <th className="pb-3">Pemicu</th>
                  <th className="pb-3">IP Awal</th>
                  <th className="pb-3">IP Terakhir Ditolak</th>
                  <th className="pb-3">Ditolak</th>
                  <th className="pb-3">Sisa</th>
                  <th className="pb-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {data.active.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3.5 font-bold uppercase text-amber-300">
                      {p.kind === 'device' ? 'Perangkat' : 'Akun'}
                      {p.strike >= 2 && <span className="ml-1 text-rose-300">· ke-{p.strike}</span>}
                    </td>
                    <td className="py-3.5 font-mono text-blue-300">
                      {p.subjectRef}
                      {p.label && <span className="block text-[10px] text-neutral-500">{p.label}</span>}
                    </td>
                    <td className="py-3.5 text-neutral-300">{p.eventType}</td>
                    <td className="py-3.5 font-mono text-rose-300">{p.ipAddress}</td>
                    <td className="py-3.5 font-mono text-neutral-300">
                      {p.lastHitIp || '-'}
                      {p.lastHitIp && p.lastHitIp !== p.ipAddress && (
                        <span className="block text-[10px] text-rose-300">IP berubah — kemungkinan VPN</span>
                      )}
                    </td>
                    <td className="py-3.5 font-mono">{p.hitCount}</td>
                    <td className="py-3.5 font-mono font-bold text-amber-300">{remaining(p.expiresAt)}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => lift(p)}
                        disabled={busy !== null}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border-b-2 border-emerald-950 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                        Buka
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="p-5 sm:p-6 bg-[#181818] border border-neutral-700 space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wider">Riwayat</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-400 border-b border-neutral-700">
              <tr>
                <th className="pb-3">Status</th>
                <th className="pb-3">Jenis</th>
                <th className="pb-3">Referensi</th>
                <th className="pb-3">Pemicu</th>
                <th className="pb-3">IP</th>
                <th className="pb-3">Ditolak</th>
                <th className="pb-3">Dibuat</th>
                <th className="pb-3">Berakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {data.history.map((p) => {
                const s = status(p);
                return (
                  <tr key={p.id}>
                    <td className={`py-3 font-bold uppercase ${s.cls}`}>
                      {s.label}
                      {p.liftedBy && <span className="block text-[10px] normal-case text-neutral-500">{p.liftedBy}</span>}
                    </td>
                    <td className="py-3 text-neutral-300">{p.kind === 'device' ? 'Perangkat' : 'Akun'}</td>
                    <td className="py-3 font-mono text-blue-300">{p.subjectRef}</td>
                    <td className="py-3 text-neutral-300">{p.eventType}</td>
                    <td className="py-3 font-mono text-neutral-400">{p.ipAddress}</td>
                    <td className="py-3 font-mono">{p.hitCount}</td>
                    <td className="py-3 text-neutral-500">{formatDate(p.createdAt)}</td>
                    <td className="py-3 text-neutral-500">{formatDate(p.expiresAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && data.history.length === 0 && (
            <p className="py-10 text-center text-xs text-neutral-500">Belum ada riwayat pembatasan.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="p-5 bg-[#181818] border border-neutral-700 space-y-2">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
        <span className="text-neutral-400">{label}</span>
        <span className="text-rose-400">{icon}</span>
      </div>
      <p className="text-2xl font-mono font-black text-white">{value}</p>
    </div>
  );
}
