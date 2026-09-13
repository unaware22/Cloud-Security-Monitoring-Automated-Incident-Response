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
  FileText,
  Sparkles,
  Download,
  Clock,
  Palette,
  ExternalLink,
  Ban,
  Image as ImageIcon,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatIDR, formatDate } from '@/lib/utils';
import { canReviewPendingOrder } from '@/lib/order-review';

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
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; orderCode: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manual Custom Skin Delivery Form in Modal
  const [skinDownloadUrl, setSkinDownloadUrl] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveringSkin, setDeliveringSkin] = useState(false);
  const [deliverSkinResult, setDeliverSkinResult] = useState<string | null>(null);

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

  const handleDeliverCustomSkin = async (orderId: string) => {
    if (!skinDownloadUrl.trim() && !deliveryNotes.trim()) {
      setDeliverSkinResult('Harap masukkan URL download file skin atau catatan pengiriman.');
      return;
    }
    setDeliveringSkin(true);
    setDeliverSkinResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/deliver-skin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skin_download_url: skinDownloadUrl.trim(),
          delivery_notes: deliveryNotes.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setDeliverSkinResult('File skin custom berhasil dikirimkan ke email pembeli & pesanan selesai!');
        setSkinDownloadUrl('');
        setDeliveryNotes('');
        fetchOrders();
        if (selectedOrder) {
          setSelectedOrder({
            ...selectedOrder,
            deliveryStatus: 'delivered',
            orderStatus: 'completed',
          });
        }
      } else {
        setDeliverSkinResult(json.message || 'Gagal mengirim file skin.');
      }
    } catch {
      setDeliverSkinResult('Terjadi kesalahan jaringan.');
    } finally {
      setDeliveringSkin(false);
    }
  };

  const handleApproveOrder = async (orderId: string, orderCode: string) => {
    setApprovingOrderId(orderId);
    setActionNotice(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/approve-manual-payment`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setActionNotice({
          type: 'success',
          message: `✓ Pembayaran pesanan ${orderCode} berhasil disahkan! Kredensial digital otomatis dialokasikan & dikirim ke pembeli.`,
        });
        fetchOrders();
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({
            ...selectedOrder,
            paymentStatus: 'paid_manual',
            orderStatus: 'completed',
            deliveryStatus: 'delivered',
          });
        }
      } else {
        setActionNotice({
          type: 'error',
          message: json.message || 'Gagal mengesahkan pembayaran pesanan.',
        });
      }
    } catch {
      setActionNotice({ type: 'error', message: 'Terjadi kesalahan jaringan saat mengesahkan pembayaran.' });
    } finally {
      setApprovingOrderId(null);
    }
  };

  const openRejectDialog = (orderId: string, orderCode: string) => {
    setRejectTarget({ id: orderId, orderCode });
    setRejectionReason('');
    setRejectionError('');
    setActionNotice(null);
  };

  const handleRejectOrder = async () => {
    if (!rejectTarget) return;

    setRejectingOrderId(rejectTarget.id);
    setActionNotice(null);
    setRejectionError('');
    try {
      const res = await fetch(`/api/admin/orders/${rejectTarget.id}/reject-manual-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason.trim() || undefined }),
      });
      const json = await res.json();

      if (!res.ok) {
        setRejectionError(json.message || 'Gagal menolak pesanan.');
        setActionNotice({ type: 'error', message: json.message || 'Gagal menolak pesanan.' });
        return;
      }

      setActionNotice({
        type: 'success',
        message: `Pesanan ${rejectTarget.orderCode} berhasil ditolak dan dikunci dari pengesahan.`,
      });
      setOrders((current) =>
        current.map((order) =>
          order.id === rejectTarget.id
            ? { ...order, paymentStatus: 'rejected', orderStatus: 'cancelled', deliveryStatus: 'cancelled' }
            : order
        )
      );
      if (selectedOrder?.id === rejectTarget.id) {
        setSelectedOrder({
          ...selectedOrder,
          paymentStatus: 'rejected',
          orderStatus: 'cancelled',
          deliveryStatus: 'cancelled',
        });
      }
      setRejectTarget(null);
      setRejectionReason('');
      setRejectionError('');
      fetchOrders();
    } catch {
      setRejectionError('Terjadi kesalahan jaringan saat menolak pesanan.');
      setActionNotice({ type: 'error', message: 'Terjadi kesalahan jaringan saat menolak pesanan.' });
    } finally {
      setRejectingOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Order Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Pantau semua pesanan masuk, antrean custom skin Minecraft, status pembayaran, dan pengiriman.
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

      {/* Action Notification Notice */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <p className="font-medium">{actionNotice.message}</p>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-gray-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
          <option value="pending">Menunggu Bayar</option>
          <option value="pending_manual">Menunggu Verifikasi Manual</option>
          <option value="expired">Kedaluwarsa</option>
          <option value="cancelled">Dibatalkan Pembeli</option>
          <option value="rejected">Ditolak Admin</option>
        </select>

        <select
          value={deliveryFilter}
          onChange={(e) => setDeliveryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">Semua Status Delivery</option>
          <option value="delivered">Terkirim</option>
          <option value="processing">Sedang Dikerjakan (Skin)</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-surface border border-surface-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Memuat data pesanan...</span>
          </div>
        ) : orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-hover/60 border-b border-surface-border text-gray-400 font-medium uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order Code</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Status Bayar</th>
                  <th className="py-3 px-4">Status Kirim</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-gray-300">
                {orders.map((order) => {
                  const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'paid_manual';
                  const isPending = order.paymentStatus === 'pending' || order.paymentStatus === 'pending_manual';
                  const canReview = canReviewPendingOrder(order);
                  const isSkinCustom =
                    order.customSkinDetails != null ||
                    order.orderItems?.[0]?.productNameSnapshot?.toLowerCase().includes('skin') ||
                    order.deliveryType === 'manual';

                  return (
                    <tr key={order.id} className="hover:bg-surface-hover/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white flex items-center gap-1.5">
                        <span>{order.orderCode}</span>
                        {isSkinCustom && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Custom Skin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-white truncate max-w-[130px]">{order.customerName}</p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[130px]">{order.customerEmail}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-gray-300 line-clamp-1 max-w-[180px]">
                          {order.orderItems?.[0]?.productNameSnapshot || 'Digital Item'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {formatIDR(order.totalAmount)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={order.paymentStatus} type="payment" />
                      </td>
                      <td className="py-3 px-4">
                        {order.deliveryStatus === 'processing' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />
                            <span>Crafting Skin</span>
                          </span>
                        ) : (
                          <StatusBadge status={order.deliveryStatus} type="delivery" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-[10px] font-mono">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <button
                              onClick={() => handleApproveOrder(order.id, order.orderCode)}
                              disabled={!canReview || approvingOrderId === order.id || rejectingOrderId === order.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                              title={canReview ? 'Sahkan Pembayaran Manual' : 'Pesanan sudah dibatalkan atau tidak dapat diproses'}
                            >
                              {approvingOrderId === order.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>Sahkan</span>
                            </button>
                          )}
                          {isPending && (
                            <button
                              onClick={() => openRejectDialog(order.id, order.orderCode)}
                              disabled={!canReview || approvingOrderId === order.id || rejectingOrderId === order.id}
                              className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-700"
                              title={canReview ? 'Tolak Pesanan' : 'Pesanan sudah dibatalkan atau tidak dapat diproses'}
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Tolak</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setDeliverSkinResult(null);
                            }}
                            className="p-1.5 rounded-lg bg-surface-hover text-gray-300 hover:text-white border border-surface-border"
                            title="Lihat Detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isPaid && !isSkinCustom && (
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
          <div className="bg-surface border border-surface-border rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
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

            {/* Customer Note */}
            {(selectedOrder.customerNotes || selectedOrder.notes) && (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-1.5 text-xs">
                <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Catatan Khusus dari Pembeli</span>
                </h4>
                <p className="text-amber-200 leading-relaxed font-sans bg-black/40 p-2.5 rounded-lg border border-amber-500/20">{selectedOrder.customerNotes || selectedOrder.notes}</p>
              </div>
            )}

            {/* ================= SPECIAL CUSTOM SKIN SPECIFICATIONS IN ADMIN MODAL ================= */}
            {selectedOrder.customSkinDetails && (
              <div className="p-5 rounded-2xl bg-[#09172e] border-2 border-sky-500/60 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-sky-500/30 pb-2">
                  <h4 className="font-black text-sky-300 uppercase tracking-wider flex items-center gap-2 text-sm">
                    <Palette className="w-4 h-4 text-sky-400" />
                    <span>Spesifikasi Custom Skin Minecraft</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-200 border border-sky-500/40">
                    Pembuatan Cepat (~5 Mins)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-black/50 border border-sky-500/30">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Ukuran Skin:</span>
                    <span className="font-mono font-bold text-sky-300 text-sm">
                      {selectedOrder.customSkinDetails.skinSize === '32x32' ? '32×32 px' : '64×64 px'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-black/50 border border-sky-500/30">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">Model Skin:</span>
                    <span className="font-bold text-purple-300 text-sm">
                      {selectedOrder.customSkinDetails.skinModel === 'slim' ? 'Slim (Alex)' : 'Wide (Steve)'}
                    </span>
                  </div>
                </div>

                {selectedOrder.customSkinDetails.referenceImageUrl && (
                  <div className="p-3 rounded-xl bg-black/50 border border-sky-500/30 space-y-2">
                    <span className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Gambar Referensi dari Pembeli:</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <img
                        src={selectedOrder.customSkinDetails.referenceImageUrl}
                        alt="Referensi"
                        className="w-24 h-24 object-cover rounded-xl border border-neutral-700 bg-neutral-900"
                      />
                      <a
                        href={selectedOrder.customSkinDetails.referenceImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-surface-border text-xs text-sky-300 flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Gambar Penuh</span>
                      </a>
                    </div>
                  </div>
                )}

                {selectedOrder.customSkinDetails.description && (
                  <div className="p-3 rounded-xl bg-black/50 border border-sky-500/30 space-y-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase block">
                      Deskripsi Skin Impian:
                    </span>
                    <pre className="font-mono text-[11px] text-sky-100 whitespace-pre-wrap bg-black/60 p-3 rounded-lg border border-neutral-800 max-h-48 overflow-y-auto leading-relaxed">
                      {selectedOrder.customSkinDetails.description}
                    </pre>
                  </div>
                )}

                {/* ================= MANUAL DELIVERY SUBMISSION FORM ================= */}
                <div className="pt-3 border-t border-sky-500/30 space-y-3">
                  <h5 className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    <span>Kirim Hasil Skin Custom ke Pembeli</span>
                  </h5>

                  {deliverSkinResult && (
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-xs text-emerald-300 font-medium">
                      {deliverSkinResult}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase">
                      Link Download File Skin (.PNG / Cloud Drive) *
                    </label>
                    <input
                      type="text"
                      value={skinDownloadUrl}
                      onChange={(e) => setSkinDownloadUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/... atau https://cdn.mysite.com/skin.png"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase">
                      Catatan Desainer (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      placeholder="Contoh: Skin HD 64x64 telah disesuaikan dengan referensi rambut dan armor..."
                      className="w-full px-3.5 py-2 rounded-xl bg-black/80 border border-surface-border text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeliverCustomSkin(selectedOrder.id)}
                    disabled={deliveringSkin}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all"
                  >
                    {deliveringSkin ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengirimkan ke Pembeli...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Kirim Hasil Skin &amp; Selesaikan Pesanan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

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

            {/* Admin review actions if payment is pending */}
            {(selectedOrder.paymentStatus === 'pending' || selectedOrder.paymentStatus === 'pending_manual') && (
              <div className="space-y-2">
                {!canReviewPendingOrder(selectedOrder) && (
                  <p className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-300">
                    Pesanan sudah dibatalkan atau statusnya berubah. Aksi pengesahan dan penolakan dikunci.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleApproveOrder(selectedOrder.id, selectedOrder.orderCode)}
                    disabled={!canReviewPendingOrder(selectedOrder) || approvingOrderId === selectedOrder.id || rejectingOrderId === selectedOrder.id}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                  >
                    {approvingOrderId === selectedOrder.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengesahkan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Sahkan Pembayaran</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => openRejectDialog(selectedOrder.id, selectedOrder.orderCode)}
                    disabled={!canReviewPendingOrder(selectedOrder) || approvingOrderId === selectedOrder.id || rejectingOrderId === selectedOrder.id}
                    className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-700"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Tolak Pesanan</span>
                  </button>
                </div>
              </div>
            )}

            {/* Resend Action (only for non-custom instant orders) */}
            {!selectedOrder.customSkinDetails && (selectedOrder.paymentStatus === 'paid' || selectedOrder.paymentStatus === 'paid_manual') && (
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

      {/* Reject confirmation modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-rose-500/40 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white">Tolak pesanan {rejectTarget.orderCode}?</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  Pesanan akan berstatus ditolak dan tidak bisa disahkan setelah tindakan ini.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="rejection-reason" className="block text-xs font-bold text-gray-300">
                Alasan penolakan (opsional)
              </label>
              <textarea
                id="rejection-reason"
                rows={3}
                maxLength={500}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Contoh: data pembayaran tidak sesuai"
                className="w-full rounded-xl bg-black/50 border border-surface-border px-3.5 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            {rejectionError && (
              <p className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-300">
                {rejectionError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectionError('');
                }}
                disabled={rejectingOrderId === rejectTarget.id}
                className="py-2.5 rounded-xl border border-surface-border text-xs font-bold text-gray-300 hover:bg-surface-hover disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleRejectOrder}
                disabled={rejectingOrderId === rejectTarget.id}
                className="py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-xs font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {rejectingOrderId === rejectTarget.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                <span>{rejectingOrderId === rejectTarget.id ? 'Menolak...' : 'Ya, Tolak'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
