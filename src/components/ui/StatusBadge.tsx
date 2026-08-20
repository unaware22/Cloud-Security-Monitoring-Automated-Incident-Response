import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status?: string | null;
  type?: 'payment' | 'order' | 'delivery' | 'severity';
  className?: string;
}

export default function StatusBadge({ status = 'pending', type = 'payment', className }: StatusBadgeProps) {
  const safeStatus = status || 'pending';
  const normalized = safeStatus.toLowerCase();

  let label = safeStatus;
  let colorClass = 'bg-gray-500/10 text-gray-400 border-gray-500/30';

  if (type === 'payment') {
    switch (normalized) {
      case 'paid':
      case 'paid_manual':
        label = normalized === 'paid_manual' ? 'Lunas (Manual)' : 'Lunas (Otomatis)';
        colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        break;
      case 'pending':
      case 'waiting_payment':
        label = 'Menunggu Pembayaran';
        colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        break;
      case 'pending_manual':
      case 'pending_verification':
        label = 'Verifikasi Pembayaran';
        colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        break;
      case 'rejected':
        label = 'Ditolak';
        colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
        break;
      case 'failed':
      case 'expired':
        label = normalized === 'expired' ? 'Kedaluwarsa' : 'Gagal';
        colorClass = 'bg-red-500/10 text-red-400 border-red-500/30';
        break;
    }
  } else if (type === 'delivery') {
    switch (normalized) {
      case 'delivered':
        label = 'Terkirim';
        colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        break;
      case 'processing':
        label = 'Diproses';
        colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        break;
      case 'pending':
        label = 'Menunggu';
        colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        break;
      case 'failed':
        label = 'Gagal Kirim';
        colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
        break;
      case 'resent':
        label = 'Dikirim Ulang';
        colorClass = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
        break;
    }
  } else if (type === 'severity') {
    switch (normalized) {
      case 'critical':
        label = 'CRITICAL';
        colorClass = 'bg-red-500/20 text-red-400 border-red-500/50 font-bold';
        break;
      case 'high':
        label = 'HIGH';
        colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/40 font-semibold';
        break;
      case 'medium':
        label = 'MEDIUM';
        colorClass = 'bg-amber-500/15 text-amber-400 border-amber-500/40';
        break;
      case 'low':
      case 'warning':
        label = normalized.toUpperCase() || 'LOW';
        colorClass = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
        break;
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
