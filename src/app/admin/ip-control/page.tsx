'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

type IpControlAction = {
  id: string;
  ipAddress: string;
  action: 'block' | 'unblock';
  status: 'pending' | 'blocked' | 'unblocked' | 'rejected' | 'failed';
  actor: string;
  source: string;
  reason: string | null;
  ruleId: string | null;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
};

type ResponseData = {
  blocked_ips: IpControlAction[];
  history: IpControlAction[];
  summary: {
    blocked: number;
    pending: number;
    recent_failures: number;
  };
};

const EMPTY_DATA: ResponseData = {
  blocked_ips: [],
  history: [],
  summary: { blocked: 0, pending: 0, recent_failures: 0 },
};

export default function AdminIpControlPage() {
  const [data, setData] = useState<ResponseData>(EMPTY_DATA);
  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState('Pemblokiran manual oleh administrator');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchState = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const response = await fetch('/api/admin/security/ip-control', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Status kontrol IP gagal dimuat.');
      }
      setData(result.data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Status kontrol IP gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState(true);
    const timer = window.setInterval(() => fetchState(false), 15_000);
    return () => window.clearInterval(timer);
  }, [fetchState]);

  const runAction = async (
    action: 'block' | 'unblock',
    targetIp: string,
    actionReason: string
  ) => {
    const label = action === 'block' ? 'memblokir' : 'membuka blokir';
    if (!window.confirm(`Yakin ingin ${label} IP ${targetIp}?`)) return;

    setSubmitting(`${action}:${targetIp}`);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/admin/security/ip-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ip_address: targetIp,
          reason: actionReason,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Tindakan kontrol IP gagal dijalankan.');
      }

      setSuccessMessage(result.message);
      if (action === 'block') {
        setIpAddress('');
        setReason('Pemblokiran manual oleh administrator');
      }
      await fetchState(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Tindakan kontrol IP gagal dijalankan.'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleBlock = async (event: FormEvent) => {
    event.preventDefault();
    await runAction('block', ipAddress.trim(), reason.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            <span>IP Containment &amp; Response</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Kontrol block/unblock melalui n8n dan Wazuh Active Response. Seluruh tindakan dicatat.
          </p>
        </div>

        <button
          onClick={() => fetchState(true)}
          disabled={loading}
          className="px-3.5 py-2 bg-[#181818] hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-300 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="IP Terblokir"
          value={data.summary.blocked}
          icon={<Ban className="w-4 h-4" />}
          tone="rose"
        />
        <SummaryCard
          label="Menunggu Konfirmasi"
          value={data.summary.pending}
          icon={<Clock className="w-4 h-4" />}
          tone="amber"
        />
        <SummaryCard
          label="Kegagalan Terbaru"
          value={data.summary.recent_failures}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="neutral"
        />
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-rose-950/70 border border-rose-700 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-700 text-xs text-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      <form
        onSubmit={handleBlock}
        className="p-5 sm:p-6 bg-[#181818] border border-neutral-700 space-y-4"
      >
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider">Blokir IP Manual</h2>
          <p className="text-[11px] text-neutral-500 mt-1">
            Hanya IPv4 publik. IP private, loopback, dokumentasi, dan Tailscale ditolak.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_auto] gap-3">
          <input
            type="text"
            required
            value={ipAddress}
            onChange={(event) => setIpAddress(event.target.value)}
            placeholder="Contoh: 8.8.8.8"
            className="px-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-sm font-mono text-white focus:outline-none focus:border-rose-500"
          />
          <input
            type="text"
            required
            minLength={3}
            maxLength={240}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Alasan pemblokiran"
            className="px-3.5 py-2.5 bg-[#111111] border border-neutral-700 text-sm text-white focus:outline-none focus:border-rose-500"
          />
          <button
            type="submit"
            disabled={!ipAddress.trim() || !reason.trim() || submitting !== null}
            className="px-5 py-2.5 bg-rose-800 hover:bg-rose-700 border-b-4 border-rose-950 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting?.startsWith('block:') ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Ban className="w-4 h-4" />
            )}
            Blokir
          </button>
        </div>
      </form>

      <section className="p-5 sm:p-6 bg-[#181818] border border-neutral-700 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider">IP Sedang Terblokir</h2>
          <span className="text-[11px] text-neutral-500">Sumber status: RDS response history</span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
          </div>
        ) : data.blocked_ips.length === 0 ? (
          <div className="py-10 text-center text-xs text-neutral-500 border border-dashed border-neutral-700">
            Tidak ada IP yang sedang terblokir.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-400 border-b border-neutral-700">
                <tr>
                  <th className="pb-3">IP Address</th>
                  <th className="pb-3">Alasan</th>
                  <th className="pb-3">Sumber/Aktor</th>
                  <th className="pb-3">Waktu</th>
                  <th className="pb-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {data.blocked_ips.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3.5 font-mono font-bold text-rose-300">{item.ipAddress}</td>
                    <td className="py-3.5 text-neutral-300 max-w-xs">{item.reason || '-'}</td>
                    <td className="py-3.5 text-neutral-400">
                      <span className="block">{item.actor}</span>
                      <span className="text-[10px] text-neutral-600">{item.source}</span>
                    </td>
                    <td className="py-3.5 text-neutral-400">{formatDate(item.updatedAt)}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() =>
                          runAction(
                            'unblock',
                            item.ipAddress,
                            `Manual unblock untuk ${item.ipAddress}`
                          )
                        }
                        disabled={submitting !== null}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border-b-2 border-emerald-950 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {submitting === `unblock:${item.ipAddress}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                        Unblock
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
        <h2 className="text-sm font-black uppercase tracking-wider">Riwayat Respons</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-400 border-b border-neutral-700">
              <tr>
                <th className="pb-3">Status</th>
                <th className="pb-3">IP</th>
                <th className="pb-3">Aktor</th>
                <th className="pb-3">Alasan</th>
                <th className="pb-3">Waktu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {data.history.map((item) => (
                <tr key={item.id}>
                  <td className="py-3">
                    <StatusLabel status={item.status} action={item.action} />
                  </td>
                  <td className="py-3 font-mono text-blue-300">{item.ipAddress}</td>
                  <td className="py-3 text-neutral-400">{item.actor}</td>
                  <td className="py-3 text-neutral-300 max-w-sm">{item.reason || '-'}</td>
                  <td className="py-3 text-neutral-500">{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && data.history.length === 0 && (
            <p className="py-10 text-center text-xs text-neutral-500">Belum ada riwayat respons IP.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'rose' | 'amber' | 'neutral';
}) {
  const colors = {
    rose: 'text-rose-400 border-rose-900/60',
    amber: 'text-amber-400 border-amber-900/60',
    neutral: 'text-neutral-300 border-neutral-700',
  };

  return (
    <div className={`p-5 bg-[#181818] border ${colors[tone]} space-y-2`}>
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
        <span className="text-neutral-400">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-mono font-black text-white">{value}</p>
    </div>
  );
}

function StatusLabel({ status, action }: { status: IpControlAction['status']; action: string }) {
  const styles: Record<IpControlAction['status'], string> = {
    pending: 'bg-amber-950/70 text-amber-300 border-amber-700/50',
    blocked: 'bg-rose-950/70 text-rose-300 border-rose-700/50',
    unblocked: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50',
    rejected: 'bg-neutral-900 text-neutral-300 border-neutral-600',
    failed: 'bg-red-950 text-red-300 border-red-700/50',
  };

  return (
    <span className={`px-2 py-1 border text-[10px] font-black uppercase ${styles[status]}`}>
      {action} · {status}
    </span>
  );
}
