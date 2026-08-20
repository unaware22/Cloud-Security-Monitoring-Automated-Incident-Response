'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Calendar,
  User,
  Shield,
  Eye,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (actionFilter !== 'all') query.set('action', actionFilter);

      const res = await fetch(`/api/admin/audit-logs?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      (l.admin?.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.ipAddress || '').includes(search) ||
      (l.entityType || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Admin Audit Trail</h1>
          <p className="text-xs text-gray-400 mt-1">
            Rekam jejak setiap aksi administratif: login, perubahan katalog produk, approval manual transfer, dan pengiriman ulang produk.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs text-gray-300 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Audit</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aksi, email admin, atau IP..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">Semua Jenis Aksi</option>
          <option value="ADMIN_LOGIN_SUCCESS">Login Admin</option>
          <option value="MANUAL_PAYMENT_APPROVE">Approve Manual Payment</option>
          <option value="MANUAL_PAYMENT_REJECT">Reject Manual Payment</option>
          <option value="PRODUCT_CREATE">Create Product</option>
          <option value="PRODUCT_UPDATE">Update Product</option>
          <option value="PRODUCT_DEACTIVATE">Deactivate Product</option>
          <option value="DELIVERY_RESEND">Resend Delivery</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="p-6 rounded-3xl bg-surface border border-surface-border overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-gray-400">Memuat audit log...</p>
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 border-b border-surface-border">
                <tr>
                  <th className="pb-3 font-semibold">Action</th>
                  <th className="pb-3 font-semibold">Admin User</th>
                  <th className="pb-3 font-semibold">Entity Type</th>
                  <th className="pb-3 font-semibold">IP Address</th>
                  <th className="pb-3 font-semibold">Timestamp</th>
                  <th className="pb-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-hover/50 font-mono">
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 text-gray-300 font-sans">
                      {log.admin?.email || 'System / Admin'}
                    </td>
                    <td className="py-3.5 text-gray-400">
                      {log.entityType || '-'}
                    </td>
                    <td className="py-3.5 text-blue-300">
                      {log.ipAddress || '-'}
                    </td>
                    <td className="py-3.5 text-gray-400 text-[11px]">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg bg-surface-hover text-gray-300 hover:text-white border border-surface-border"
                        title="View Change Diff"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500 text-xs">
            Belum ada rekam audit log.
          </div>
        )}
      </div>

      {/* Audit Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-surface-border rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
              <div>
                <span className="text-[10px] text-gray-400 font-mono">AUDIT EVENT DETAIL</span>
                <h3 className="text-sm font-bold text-white font-mono mt-0.5">
                  {selectedLog.action}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                  <span className="text-gray-500 block mb-1">Admin Email</span>
                  <span className="text-white font-medium">{selectedLog.admin?.email || 'Admin'}</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-hover border border-surface-border">
                  <span className="text-gray-500 block mb-1">IP Address</span>
                  <span className="text-blue-300 font-mono">{selectedLog.ipAddress}</span>
                </div>
              </div>

              {selectedLog.oldValue && (
                <div className="space-y-1">
                  <span className="text-gray-400 font-semibold font-mono">Old Value (Sebelum):</span>
                  <pre className="p-3 rounded-xl bg-black/60 border border-surface-border text-[11px] text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.oldValue}
                  </pre>
                </div>
              )}

              {selectedLog.newValue && (
                <div className="space-y-1">
                  <span className="text-emerald-400 font-semibold font-mono">New Value (Sesudah):</span>
                  <pre className="p-3 rounded-xl bg-black/60 border border-emerald-500/30 text-[11px] text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
                    {selectedLog.newValue}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
