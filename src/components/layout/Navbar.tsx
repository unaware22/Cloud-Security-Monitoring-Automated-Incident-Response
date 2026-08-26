'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronRight } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hide customer navbar on admin, checkout, payment, and order success routes
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/payment') ||
    pathname.startsWith('/order')
  ) {
    return null;
  }

  const navLinks = [
    { href: '/',            label: 'BERANDA' },
    { href: '/check-order', label: 'CEK PESANAN' },
    { href: '/bantuan',     label: 'BANTUAN' },
    { href: '/faq',         label: 'FAQ' },
  ];

  const waJualAkunUrl = `https://wa.me/6281234567890?text=${encodeURIComponent(
    'Halo Admin SALADINSHOP, saya ingin menjual akun game saya.'
  )}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#181818] border-b border-neutral-800 shadow-xl transition-all duration-200">
      <div className="w-full max-w-[1920px] mx-auto px-3.5 sm:px-6 lg:px-12 h-[68px] sm:h-[78px] md:h-[86px] lg:h-[92px] flex items-center justify-between">
        
        {/* Left: Brand Logo (Enlarged prominent & Crisp HD) */}
        <Link href="/" className="flex items-center group select-none flex-shrink-0">
          <img
            src="/images/logo2.png"
            alt="SALADINSHOP"
            className="hero-bg-crisp h-11 sm:h-13 md:h-16 lg:h-20 w-auto max-h-[76px] object-contain transition-transform duration-150 group-hover:scale-105"
            style={{
              imageRendering: '-webkit-optimize-contrast',
            }}
          />
        </Link>

        {/* Center: Clean Minecraft.net Menu Links */}
        <nav className="hidden md:flex items-center gap-2 lg:gap-6">
          {navLinks.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname === link.href || pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs font-black tracking-wider transition-all duration-150 px-3 py-1.5 rounded-none uppercase ${
                  isActive
                    ? 'text-white border-b-2 border-[#367723]'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/70'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Desktop: Authentic Minecraft.net #367723 Green Button */}
        <div className="hidden md:flex items-center">
          <a
            href={waJualAkunUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 shadow-md transition-all select-none uppercase tracking-wider rounded-none"
          >
            <span>JUAL AKUN</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Right Mobile: Green Jual Akun Action + Authentic Minecraft Green Menu Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <a
            href={waJualAkunUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-black text-[#69c944] hover:text-white bg-black/40 hover:bg-[#367723]/30 border border-[#367723] transition-all uppercase tracking-wider rounded-none"
          >
            <span>JUAL AKUN</span>
            <ChevronRight className="w-3 h-3 stroke-[2.5]" />
          </a>

          {/* Minecraft Blocky Green Menu Toggle (matches screenshot media_1787390705962.png) */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-none text-white bg-[#367723] hover:bg-[#418e2a] border-2 border-[#1f4813] shadow-md transition-colors flex items-center justify-center"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5 stroke-[2.5]" /> : <Menu className="w-5 h-5 stroke-[2.5]" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#181818] border-b border-neutral-800 px-4 py-4 space-y-2 animate-fadeIn shadow-2xl">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2.5 text-xs font-bold uppercase text-neutral-300 hover:text-white hover:bg-neutral-800/80 rounded-none border-l-2 border-transparent hover:border-[#367723]"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={waJualAkunUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center w-full py-3 mt-3 text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] rounded-none uppercase tracking-wider"
          >
            JUAL AKUN SEKARANG &rarr;
          </a>
        </div>
      )}
    </header>
  );
}
