'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Download,
  AlertTriangle,
  FileCode,
  Loader2,
  Terminal,
  Copy,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';

export default function AdminSecurityEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (severityFilter !== 'all') query.set('severity', severityFilter);
      if (search.trim()) query.set('search', search.trim());

      const res = await fetch(`/api/admin/security-events?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setEvents(json.data);
      }
    } catch (err) {
      console.error('Failed to load security events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchEvents, 250);
    return () => clearTimeout(timer);
  }, [severityFilter, search]);

  const copySnippet = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadJSONL = () => {
    const jsonlContent = events
      .map((e) =>
        JSON.stringify({
          event_type: e.eventType,
          severity: e.severity,
          ip_address: e.ipAddress,
          method: e.method,
          endpoint: e.endpoint,
          user_agent: e.userAgent,
          payload_snippet: e.payloadSnippet,
          status_code: e.statusCode,
          request_id: e.requestId,
          created_at: e.createdAt,
        })
      )
      .join('\n');

    const blob = new Blob([jsonlContent], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wazuh_security_events_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
            <span>Security Events (Wazuh SIEM Ingestion Stream)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Mencatat serangan dan anomali: SQLi, XSS, Path Scan, Admin Brute Force, Order Enumeration, & Webhook tampering dalam format JSON Lines.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={handleDownloadJSONL}
            className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-xs text-gray-300 flex items-center gap-2 transition-colors"
            title="Download Wazuh JSON Lines format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSONL</span>
          </button>

          <button
            onClick={fetchEvents}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Live Stream Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari IP, endpoint, atau payload..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 font-mono"
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-rose-500"
        >
          <option value="all">Semua Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low / Warning</option>
        </select>
      </div>

      {/* Events Table */}
      <div className="p-6 rounded-3xl bg-surface border border-surface-border overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
            <p className="text-xs text-gray-400">Memeriksa security event stream...</p>
          </div>
        ) : events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400 border-b border-surface-border">
                <tr>
                  <th className="pb-3 font-semibold">Severity</th>
                  <th className="pb-3 font-semibold">Event Type</th>
                  <th className="pb-3 font-semibold">Attacker IP</th>
                  <th className="pb-3 font-semibold">Endpoint / Method</th>
                  <th className="pb-3 font-semibold">Payload Snippet</th>
                  <th className="pb-3 font-semibold">HTTP Code</th>
                  <th className="pb-3 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-surface-hover/50 font-mono">
                    <td className="py-3.5">
                      <StatusBadge status={evt.severity} type="severity" />
                    </td>
                    <td className="py-3.5 font-bold text-white">
                      {evt.eventType}
                    </td>
                    <td className="py-3.5 text-blue-300">
                      {evt.ipAddress}
                    </td>
                    <td className="py-3.5">
                      <span className="px-1.5 py-0.5 rounded bg-surface-border text-[10px] text-gray-300 mr-1">
                        {evt.method}
                      </span>
                      <span className="text-gray-300 truncate max-w-[160px] inline-block align-middle">
                        {evt.endpoint}
                      </span>
                    </td>
                    <td className="py-3.5">
                      {evt.payloadSnippet ? (
                        <div className="flex items-center gap-1.5">
                          <code className="text-[11px] text-rose-300 bg-black/60 px-2 py-1 rounded max-w-[200px] truncate block">
                            {evt.payloadSnippet}
                          </code>
                          <button
                            onClick={() => copySnippet(evt.payloadSnippet, evt.id)}
                            className="p-1 text-gray-500 hover:text-white"
                            title="Copy snippet"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`font-bold ${
                          evt.statusCode >= 400 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {evt.statusCode}
                      </span>
                    </td>
                    <td className="py-3.5 text-gray-400 text-[11px]">
                      {formatDate(evt.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500 text-xs">
            Tidak ada security incident yang terdeteksi.
          </div>
        )}
      </div>
    </div>
  );
}
