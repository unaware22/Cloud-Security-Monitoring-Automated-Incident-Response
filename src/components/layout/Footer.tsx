import React from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const waSupportUrl = `https://wa.me/6281234567890?text=${encodeURIComponent(
    'Halo Admin SALADINSHOP, saya butuh bantuan terkait pesanan saya.'
  )}`;

  return (
    <footer className="bg-[#313131] text-white border-t border-neutral-700">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Col 1: Brand & Description (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="flex items-center group select-none">
              <img
                src="/images/logo.png"
                alt="SALADINSHOP"
                className="h-8 sm:h-9 w-auto object-contain"
              />
            </Link>

            <p className="text-xs text-neutral-300 leading-relaxed max-w-sm">
              Platform penyedia produk digital game resmi dan terpercaya di Indonesia. 
              Melayani ribuan gamer sejak tahun 2019 dengan sistem pengiriman otomatis 24 jam non-stop.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 shadow-md transition-all uppercase tracking-wider"
              >
                <MessageCircle className="w-4 h-4" />
                Chat WhatsApp Admin
              </a>
            </div>
          </div>

          {/* Col 2: Navigasi Cepat (3 cols) */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-200">
              Navigasi Cepat
            </h4>
            <ul className="space-y-2 text-xs text-neutral-300 font-medium">
              <li>
                <Link href="/" className="hover:text-white transition-colors flex items-center gap-1 group">
                  <span className="group-hover:translate-x-0.5 transition-transform">Beranda</span>
                </Link>
              </li>
              <li>
                <Link href="/check-order" className="hover:text-white transition-colors flex items-center gap-1 group">
                  <span className="group-hover:translate-x-0.5 transition-transform">Cek Status Pesanan</span>
                </Link>
              </li>
              <li>
                <Link href="/bantuan" className="hover:text-white transition-colors flex items-center gap-1 group">
                  <span className="group-hover:translate-x-0.5 transition-transform">Saladin Service (Bantuan)</span>
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition-colors flex items-center gap-1 group">
                  <span className="group-hover:translate-x-0.5 transition-transform">Pertanyaan Umum (FAQ)</span>
                </Link>
              </li>
              <li>
                <Link href="/admin/login" className="hover:text-white transition-colors text-[11px] text-neutral-400 pt-1 block">
                  Portal Admin &rarr;
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Metode Pembayaran (4 cols) */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-200">
              Metode Pembayaran
            </h4>
            <p className="text-[11px] text-neutral-300 leading-snug">
              Mendukung semua e-wallet &amp; transfer bank melalui QRIS Nasional dan Payment Gateway resmi.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'BCA', 'Mandiri', 'BNI', 'BRI'].map((m) => (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-none text-[10px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright */}
        <div className="mt-12 pt-6 border-t border-neutral-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-neutral-400">
          <p>&copy; {currentYear} SALADINSHOP. Seluruh Hak Cipta Dilindungi.</p>
          <p className="flex items-center gap-1">
            Minecraft adalah merek dagang terdaftar milik Mojang Synergies AB / Microsoft.
          </p>
        </div>
      </div>
    </footer>
  );
}
