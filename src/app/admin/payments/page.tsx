'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
  FileText,
  User,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';

export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPendingPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders?payment_status=pending_manual');
      const json = await res.json();
      if (json.success) {
        setOrders(json.data);
      }
    } catch (err) {
      console.error('Failed to load pending payments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const handleApprove = async (orderId: string, orderCode: string) => {
    if (!confirm(`Konfirmasi setujui pembayaran manual untuk pesanan ${orderCode}? Produk akan otomatis dikirimkan ke email pembeli.`)) {
      return;
    }

    setProcessingId(orderId);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/approve-manual-payment`, {
        method: 'POST',
      });
      const json = await res.json();

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Pesanan ${orderCode} berhasil disetujui & produk telah dikirimkan!`,
        });
        fetchPendingPayments();
      } else {
        setActionMessage({
          type: 'error',
          text: json.message || 'Gagal menyetujui pembayaran',
        });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Terjadi kesalahan jaringan' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (orderId: string, orderCode: string) => {
    const reason = prompt(`Masukkan alasan penolakan untuk ${orderCode}:`, 'Bukti transfer tidak valid / mutasi rekening tidak ditemukan');
    if (reason === null) return;

    setProcessingId(orderId);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reject-manual-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();

      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `Pembayaran pesanan ${orderCode} ditolak.`,
        });
        fetchPendingPayments();
      } else {
        setActionMessage({
          type: 'error',
          text: json.message || 'Gagal menolak pembayaran',
        });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Terjadi kesalahan jaringan' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Manual Payment Verification Queue
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Verifikasi transfer bank manual & static QRIS. Setiap approval otomatis mengirimkan produk dan mencatat audit log.
          </p>
        </div>

        <button
          onClick={fetchPendingPayments}
          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs text-gray-300 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Queue List */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs text-gray-400">Memeriksa antrean pembayaran...</p>
        </div>
      ) : orders.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {orders.map((order) => {
            const submission = order.manualPaymentSubmissions?.[0];

            return (
              <div
                key={order.id}
                className="p-6 rounded-3xl bg-surface border border-surface-border space-y-5 shadow-xl"
              >
                {/* Top Row: Order Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-surface-border gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-mono">ORDER:</span>
                      <span className="text-sm font-mono font-bold text-white bg-surface-hover px-2.5 py-0.5 rounded border border-surface-border">
                        {order.orderCode}
                      </span>
                      <span className="text-xs text-gray-500">• {formatDate(order.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1">
                      Customer: <strong>{order.customerName}</strong> ({order.customerEmail})
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500 uppercase block">Total Tagihan</span>
                      <span className="text-base font-bold text-emerald-400 font-mono">
                        {formatIDR(order.totalAmount)}
                      </span>
                    </div>
                    <StatusBadge status={order.paymentStatus} type="payment" />
                  </div>
                </div>

                {/* Middle Grid: Submission Data & Product Snapshot */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  {/* Left: Customer Transfer Proof Info */}
                  <div className="p-4 rounded-2xl bg-surface-hover/50 border border-surface-border space-y-2.5">
                    <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px] block flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Data Konfirmasi Pengirim</span>
                    </span>

                    {submission ? (
                      <div className="space-y-1.5 text-gray-300">
                        <p><strong>Nama Pengirim:</strong> {submission.senderName}</p>
                        <p><strong>Bank Pengirim:</strong> {submission.senderBank}</p>
                        <p>
                          <strong>Nominal Ditransfer:</strong>{' '}
                          <span className="font-bold text-white font-mono">
                            {formatIDR(submission.amount)}
                          </span>
                        </p>
                        {submission.note && (
                          <p className="text-gray-400">
                            <strong>Catatan/Ref:</strong> {submission.note}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-500 font-mono pt-1">
                          Waktu Konfirmasi: {formatDate(submission.createdAt)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">
                        Belum mengisi formulir konfirmasi pembayaran.
                      </p>
                    )}
                  </div>

                  {/* Right: Ordered Item */}
                  <div className="p-4 rounded-2xl bg-surface-hover/50 border border-surface-border space-y-2.5">
                    <span className="font-bold text-indigo-400 uppercase tracking-wider text-[11px] block flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Item yang Dibeli</span>
                    </span>

                    {order.orderItems?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-gray-300">
                        <div>
                          <p className="font-bold text-white">{item.productNameSnapshot}</p>
                          <p className="text-[11px] text-gray-400">Jumlah: {item.quantity} unit</p>
                        </div>
                        <span className="font-bold text-emerald-400">{formatIDR(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions: Approve / Reject strictly labeled */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-surface-border">
                  <button
                    onClick={() => handleReject(order.id, order.orderCode)}
                    disabled={processingId === order.id}
                    className="px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Payment</span>
                  </button>

                  <button
                    onClick={() => handleApprove(order.id, order.orderCode)}
                    disabled={processingId === order.id}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition-transform hover:scale-[1.01] disabled:opacity-50"
                  >
                    {processingId === order.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memproses Approval...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Approve Manual Payment</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-16 rounded-3xl bg-surface/40 border border-surface-border text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">Semua Pembayaran Telah Diverifikasi</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Tidak ada transaksi transfer manual yang menunggu persetujuan saat ini.
          </p>
        </div>
      )}
    </div>
  );
}
