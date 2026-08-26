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
  Image as ImageIcon,
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
          <option value="expired">Kedaluwarsa</option>
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
                  const isPending = order.paymentStatus === 'pending';
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
    </div>
  );
}
