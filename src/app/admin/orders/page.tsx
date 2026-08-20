'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  Send,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
  Calendar,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');

  // Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (paymentFilter !== 'all') query.set('payment_status', paymentFilter);
      if (deliveryFilter !== 'all') query.set('delivery_status', deliveryFilter);

      const res = await fetch(`/api/admin/orders?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setOrders(json.data);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchOrders, 200);
    return () => clearTimeout(timer);
  }, [search, paymentFilter, deliveryFilter]);

  const handleResendDelivery = async (orderId: string) => {
    setResendingId(orderId);
    setResendStatus(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-delivery`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setResendStatus('Email produk berhasil dikirim ulang!');
        fetchOrders();
      } else {
        setResendStatus(json.message || 'Gagal mengirim ulang');
      }
    } catch {
      setResendStatus('Terjadi kesalahan jaringan');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Order Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Pantau semua pesanan masuk, status pembayaran, dan pengiriman produk digital.
          </p>
        </div>

        <button
          onClick={fetchOrders}
          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs text-gray-300 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Order Code / Email..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Semua Status Bayar</option>
          <option value="paid">Lunas (Otomatis)</option>
          <option value="paid_manual">Lunas (Manual)</option>
          <option value="pending">Pending</option>
          <option value="pending_manual">Pending Manual</option>
          <option value="rejected">Ditolak</option>
        </select>

        <select
          value={deliveryFilter}
          onChange={(e) => setDeliveryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Semua Status Delivery</option>
          <option value="delivered">Terkirim</option>
          <option value="pending">Pending</option>
          <option value="failed">Gagal</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="p-6 rounded-3xl bg-surface border border-surface-border overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-xs text-gray-400">Memuat pesanan...</p>
          </div>
        ) : orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 border-b border-surface-border">
                <tr>
                  <th className="pb-3 font-semibold">Order Code</th>
                  <th className="pb-3 font-semibold">Customer</th>
                  <th className="pb-3 font-semibold">Total Amount</th>
                  <th className="pb-3 font-semibold">Payment Status</th>
                  <th className="pb-3 font-semibold">Delivery Status</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {orders.map((order) => {
                  const isPaid =
                    order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual';

                  return (
                    <tr key={order.id} className="hover:bg-surface-hover/50">
                      <td className="py-3.5 font-mono font-bold text-white">
                        {order.orderCode}
                      </td>
                      <td className="py-3.5">
                        <p className="font-semibold text-white">{order.customerName}</p>
                        <p className="text-[11px] text-gray-400">{order.customerEmail}</p>
                      </td>
                      <td className="py-3.5 font-bold text-emerald-400">
                        {formatIDR(order.totalAmount)}
                      </td>
                      <td className="py-3.5">
                        <StatusBadge status={order.paymentStatus} type="payment" />
                      </td>
                      <td className="py-3.5">
                        <StatusBadge status={order.deliveryStatus} type="delivery" />
                      </td>
                      <td className="py-3.5 text-gray-400 font-mono text-[11px]">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isPaid && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/admin/orders/${order.id}/approve-manual-payment`, { method: 'POST' });
                                  if (res.ok) fetchOrders();
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm"
                              title="Sahkan Pembayaran"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sahkan</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-1.5 rounded-lg bg-surface-hover text-gray-300 hover:text-white border border-surface-border"
                            title="Lihat Detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isPaid && (
                            <button
                              onClick={() => handleResendDelivery(order.id)}
                              disabled={resendingId === order.id}
                              className="px-2.5 py-1 rounded-lg bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/80 border border-indigo-500/30 flex items-center gap-1 font-medium"
                              title="Kirim Ulang Email Produk"
                            >
                              <Send className="w-3 h-3" />
                              <span>Resend</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500 text-xs">
            Tidak ada pesanan yang sesuai dengan filter.
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-surface-border rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
              <div>
                <span className="text-[10px] text-gray-400 font-mono">ORDER DETAIL</span>
                <h3 className="text-base font-mono font-bold text-white flex items-center gap-2">
                  <span>{selectedOrder.orderCode}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resendStatus && (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-300">
                {resendStatus}
              </div>
            )}

            {/* Customer Info */}
            <div className="p-4 rounded-2xl bg-surface-hover/40 border border-surface-border space-y-2 text-xs">
              <h4 className="font-bold text-gray-300">Informasi Pemesan</h4>
              <p className="text-white"><strong>Nama:</strong> {selectedOrder.customerName}</p>
              <p className="text-gray-300 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-gray-500" />
                <span>{selectedOrder.customerEmail}</span>
              </p>
              <p className="text-gray-300 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-gray-500" />
                <span>{selectedOrder.customerPhone || '-'}</span>
              </p>
            </div>

            {/* Ordered Items */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-gray-300">Item yang Dipesan</h4>
              {selectedOrder.orderItems?.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-surface-hover border border-surface-border flex justify-between">
                  <div>
                    <p className="font-bold text-white">{item.productNameSnapshot}</p>
                    <p className="text-gray-400">Qty: {item.quantity} @ {formatIDR(item.priceSnapshot)}</p>
                  </div>
                  <span className="font-bold text-emerald-400">{formatIDR(item.subtotal)}</span>
                </div>
              ))}
            </div>

            {/* Status Summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                <span className="text-gray-500 block mb-1">Status Pembayaran</span>
                <StatusBadge status={selectedOrder.paymentStatus} type="payment" />
              </div>
              <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                <span className="text-gray-500 block mb-1">Status Delivery</span>
                <StatusBadge status={selectedOrder.deliveryStatus} type="delivery" />
              </div>
            </div>

            {/* Resend Action */}
            {(selectedOrder.paymentStatus === 'paid' || selectedOrder.paymentStatus === 'paid_manual') && (
              <button
                onClick={() => handleResendDelivery(selectedOrder.id)}
                disabled={resendingId === selectedOrder.id}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg"
              >
                <Send className="w-4 h-4" />
                <span>Kirim Ulang Email Produk Digital</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
