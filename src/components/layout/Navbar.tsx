'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, ChevronRight, User as UserIcon, ShoppingBag, Shield, LogOut, ChevronDown } from 'lucide-react';

interface CustomerUser {
  id: string;
  name: string;
  email: string;
  isEmailVerified: boolean;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [customer, setCustomer] = useState<CustomerUser | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch current logged-in customer session
  useEffect(() => {
    let isMounted = true;
    async function loadCustomer() {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();
        if (isMounted) {
          if (json.success && json.user) {
            setCustomer(json.user);
          } else {
            setCustomer(null);
          }
        }
      } catch {
        if (isMounted) setCustomer(null);
      }
    }
    loadCustomer();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setCustomer(null);
      setUserDropdownOpen(false);
      router.push('/');
      router.refresh();
    } catch {}
  };

  // Hide customer navbar on admin, checkout, payment, order success, and auth routes
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/payment') ||
    pathname.startsWith('/order') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email')
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
        
        {/* Left: Brand Logo */}
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

        {/* Right Desktop: Auth & Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          {/* Customer Auth Button / User Dropdown */}
          {customer ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-black text-white bg-[#222222] hover:bg-[#2c2c2c] border border-neutral-700 transition-all rounded-none uppercase tracking-wider"
              >
                <div className="w-5 h-5 rounded bg-[#367723] text-white flex items-center justify-center text-[10px] font-mono font-bold">
                  {customer.name ? customer.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="max-w-[110px] truncate">{customer.name.split(' ')[0]}</span>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-1 w-56 bg-[#181818] border border-neutral-700 shadow-2xl z-50 animate-fadeIn divide-y divide-neutral-800">
                  <div className="px-4 py-3">
                    <p className="text-xs font-bold text-white truncate">{customer.name}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{customer.email}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/account?tab=orders"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 font-bold uppercase tracking-wider"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
                      <span>Pesanan Saya</span>
                    </Link>
                    <Link
                      href="/account?tab=security"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 font-bold uppercase tracking-wider"
                    >
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Keamanan & Akun</span>
                    </Link>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-neutral-800/80 font-bold uppercase tracking-wider text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-neutral-200 hover:text-white bg-black/40 hover:bg-neutral-800 border border-neutral-700 transition-all uppercase tracking-wider rounded-none"
            >
              <UserIcon className="w-3.5 h-3.5 text-neutral-400" />
              <span>MASUK</span>
            </Link>
          )}

          {/* Jual Akun CTA */}
          <a
            href={waJualAkunUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 shadow-md transition-all select-none uppercase tracking-wider rounded-none"
          >
            <span>JUAL AKUN</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Right Mobile Actions */}
        <div className="flex md:hidden items-center gap-2">
          {customer ? (
            <Link
              href="/account"
              className="w-8 h-8 rounded bg-[#367723] text-white flex items-center justify-center text-xs font-mono font-bold"
              title="Akun Saya"
            >
              {customer.name ? customer.name.charAt(0).toUpperCase() : 'U'}
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-2.5 py-1 text-[11px] font-bold text-neutral-300 bg-neutral-900 border border-neutral-700 uppercase"
            >
              MASUK
            </Link>
          )}

          {/* Minecraft Blocky Green Menu Toggle */}
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
          {customer && (
            <div className="p-3 bg-[#111111] border border-neutral-800 mb-2">
              <p className="text-xs font-bold text-white truncate">{customer.name}</p>
              <p className="text-[11px] text-neutral-400 truncate">{customer.email}</p>
              <div className="flex gap-2 mt-2 pt-2 border-t border-neutral-800">
                <Link
                  href="/account?tab=orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-[11px] font-bold text-sky-400 hover:underline"
                >
                  Pesanan Saya
                </Link>
                <span className="text-neutral-600">&bull;</span>
                <Link
                  href="/account?tab=security"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-[11px] font-bold text-emerald-400 hover:underline"
                >
                  Keamanan
                </Link>
                <span className="text-neutral-600">&bull;</span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="text-[11px] font-bold text-rose-400 hover:underline"
                >
                  Keluar
                </button>
              </div>
            </div>
          )}

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
