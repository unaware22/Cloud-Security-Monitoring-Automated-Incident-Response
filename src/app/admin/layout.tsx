'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  CreditCard,
  ShieldAlert,
  FileText,
  LogOut,
  ExternalLink,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // If on login page, render children directly without sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/products', label: 'Kelola Produk', icon: Package },
    { href: '/admin/orders', label: 'Semua Pesanan', icon: ShoppingBag },
    { href: '/admin/payments', label: 'Verifikasi Pembayaran', icon: CreditCard },
    { href: '/admin/security-events', label: 'Security Events (Wazuh)', icon: ShieldAlert },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: FileText },
  ];

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch {
      router.push('/admin/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white flex">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-[#181818] border-r border-neutral-800 flex flex-col justify-between flex-shrink-0">
        <div>
          {/* Brand Logo with logo2.png */}
          <div className="p-5 border-b border-neutral-800">
            <Link href="/admin/dashboard" className="flex items-center group select-none">
              <img
                src="/images/logo2.png"
                alt="SALADINSHOP"
                className="h-10 w-auto object-contain drop-shadow"
              />
            </Link>
            <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
              <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-800 text-emerald-400 font-bold">
                PORTAL ADMIN
              </span>
              <span>v1.0.0</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="p-3.5 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-none text-xs font-bold transition-all border ${
                    isActive
                      ? 'bg-[#367723] text-white border-[#1f4813] border-b-2 shadow-md'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800 border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-neutral-800 space-y-2">
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-3.5 py-2 rounded-none text-xs font-bold text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              <span>Lihat Toko Publik</span>
            </span>
            <span className="text-[10px] text-neutral-400">&rarr;</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 rounded-none text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar (Logout)</span>
          </button>
        </div>
      </aside>

      {/* Main Admin Content Area */}
      <main className="flex-grow p-6 sm:p-8 bg-[#111111] overflow-y-auto max-h-screen">
        {children}
      </main>
    </div>
  );
}
