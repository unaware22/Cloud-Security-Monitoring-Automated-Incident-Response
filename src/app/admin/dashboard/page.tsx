'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Package,
  ShieldAlert,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Check,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleApprove = async (orderId: string, orderCode: string) => {
    setApprovingId(orderId);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/approve-manual-payment`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setActionNotice(`✓ Pembayaran pesanan ${orderCode} berhasil disahkan!`);
        fetchDashboard();
      } else {
        setActionNotice(json.message || 'Gagal mengesahkan pembayaran');
      }
    } catch {
      setActionNotice('Terjadi kesalahan jaringan');
    } finally {
      setApprovingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-32 flex flex-col items-center justify-center gap-3 text-neutral-400">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
        <p className="text-xs font-medium">Memuat data analitik dashboard...</p>
      </div>
    );
  }

  const metrics = data?.metrics || {
    total_revenue: 0,
    total_orders: 0,
    pending_manual_payments: 0,
    delivered_orders: 0,
    active_products: 0,
    total_security_events: 0,
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h1 className="minecraft-font-folder text-xl sm:text-2xl text-white font-normal tracking-wide">
            RINGKASAN DASHBOARD ADMIN
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Pantauan performa penjualan produk digital &amp; status operasional sistem secara real-time
          </p>
        </div>

        <button
          onClick={fetchDashboard}
          className="px-4 py-2.5 rounded-none bg-[#181818] hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-300 hover:text-white flex items-center gap-2 transition-all self-start sm:self-auto uppercase tracking-wider"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-none bg-emerald-950/70 border border-emerald-500/60 text-xs text-emerald-300 flex items-center gap-2 shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Revenue */}
        <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Total Pendapatan</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <p className="text-lg font-mono font-black text-white truncate">{formatIDR(metrics.total_revenue)}</p>
          <span className="text-[10px] text-emerald-400 font-bold">Lunas / Terverifikasi</span>
        </div>

        {/* Total Orders */}
        <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Total Pesanan</span>
            <ShoppingBag className="w-4 h-4" />
          </div>
          <p className="text-xl font-mono font-black text-white">{metrics.total_orders}</p>
          <span className="text-[10px] text-neutral-400">Semua transaksi</span>
        </div>

        {/* Pending Manual Payments */}
        <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Menunggu Sah</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xl font-mono font-black text-amber-400">{metrics.pending_manual_payments}</p>
          <Link href="/admin/payments" className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5 font-bold">
            <span>Perlu Approval &rarr;</span>
          </Link>
        </div>

        {/* Delivered Orders */}
        <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Terkirim</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-xl font-mono font-black text-white">{metrics.delivered_orders}</p>
          <span className="text-[10px] text-emerald-400 font-bold">Sukses Otomatis</span>
        </div>

        {/* Active Products */}
        <div className="p-5 rounded-none bg-[#181818] border border-neutral-700/80 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Katalog Produk</span>
            <Package className="w-4 h-4" />
          </div>
          <p className="text-xl font-mono font-black text-white">{metrics.active_products}</p>
          <span className="text-[10px] text-neutral-400">Item aktif</span>
        </div>

        {/* Total Security Events */}
        <div className="p-5 rounded-none bg-[#181818] border border-rose-600/40 space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Event Keamanan</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <p className="text-xl font-mono font-black text-rose-300">{metrics.total_security_events}</p>
          <Link href="/admin/security-events" className="text-[10px] text-rose-400 hover:underline flex items-center gap-0.5 font-bold">
            <span>Log Keamanan &rarr;</span>
          </Link>
        </div>
      </div>

      {/* Two Column Section: Recent Orders & Security Events */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Orders (7 cols) */}
        <div className="lg:col-span-7 p-6 rounded-none bg-[#181818] border border-neutral-700/80 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>Pesanan Terbaru &amp; Sahkan Pembayaran</span>
            </h3>
            <Link href="/admin/orders" className="text-xs text-emerald-400 hover:underline flex items-center gap-0.5 font-bold">
              <span>Semua Pesanan</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="pb-3 font-bold uppercase tracking-wider text-[10px]">Kode Pesanan</th>
                  <th className="pb-3 font-bold uppercase tracking-wider text-[10px]">Customer</th>
                  <th className="pb-3 font-bold uppercase tracking-wider text-[10px]">Nominal</th>
                  <th className="pb-3 font-bold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="pb-3 font-bold uppercase tracking-wider text-[10px] text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {data?.recent_orders?.map((order: any) => {
                  const isPaid = order.payment_status === 'paid' || order.payment_status === 'paid_manual';
                  return (
                    <tr key={order.id} className="hover:bg-neutral-800/40">
                      <td className="py-3 font-mono font-bold text-white">
                        <Link href={`/admin/orders?search=${order.order_code}`} className="hover:text-emerald-400">
                          {order.order_code}
                        </Link>
                        <span className="block text-[10px] text-neutral-500 font-normal">
                          {formatDate(order.created_at)}
                        </span>
                      </td>
                      <td className="py-3 text-neutral-300">
                        <p className="font-medium truncate max-w-[130px]">{order.customer_name}</p>
                        <p className="text-[10px] text-neutral-500 truncate max-w-[130px]">{order.customer_email}</p>
                      </td>
                      <td className="py-3 font-mono font-bold text-emerald-400">{formatIDR(order.total_amount)}</td>
                      <td className="py-3">
                        <StatusBadge status={order.payment_status} type="payment" />
                      </td>
                      <td className="py-3 text-right">
                        {!isPaid ? (
                          <button
                            onClick={() => handleApprove(order.id, order.order_code)}
                            disabled={approvingId === order.id}
                            className="px-3 py-1.5 rounded-none bg-[#367723] hover:bg-[#418e2a] border-b-2 border-[#1f4813] text-white font-bold text-[11px] shadow transition-all flex items-center gap-1 ml-auto uppercase tracking-wider"
                          >
                            {approvingId === order.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>Sahkan</span>
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-none border border-emerald-500/40 inline-block">
                            ✓ Terverifikasi
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Security Alerts (5 cols) */}
        <div className="lg:col-span-5 p-6 rounded-none bg-[#181818] border border-neutral-700/80 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              <span>Event Keamanan Terkini</span>
            </h3>
            <Link href="/admin/security-events" className="text-xs text-rose-400 hover:underline flex items-center gap-0.5 font-bold">
              <span>Semua Log</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {data?.recent_events?.length > 0 ? (
              data.recent_events.map((ev: any) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-none bg-[#111111] border border-neutral-800 space-y-1 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 bg-neutral-800 text-neutral-300">
                      {ev.event_type}
                    </span>
                    <span className="text-[10px] text-neutral-500">{formatDate(ev.created_at)}</span>
                  </div>
                  <p className="text-xs text-neutral-300 font-mono truncate">{ev.endpoint || '-'}</p>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span>IP: {ev.ip_address}</span>
                    <span className={ev.severity === 'high' ? 'text-rose-400 font-bold' : 'text-amber-400'}>
                      Severity: {ev.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-500 text-center py-6">Tidak ada event mencurigakan saat ini.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
