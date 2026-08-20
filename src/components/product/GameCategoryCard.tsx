import React from 'react';
import Link from 'next/link';
import { ArrowRight, Box, Layers } from 'lucide-react';

interface GameCategoryCardProps {
  game: 'minecraft' | 'roblox';
  itemCount?: number;
}

export default function GameCategoryCard({ game, itemCount = 5 }: GameCategoryCardProps) {
  const isMinecraft = game === 'minecraft';

  return (
    <div
      className={`relative group rounded-3xl p-6 sm:p-8 overflow-hidden border transition-all duration-300 ${
        isMinecraft
          ? 'bg-gradient-to-br from-[#062c20] via-surface to-surface border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20'
          : 'bg-gradient-to-br from-[#3b0808] via-surface to-surface border-rose-500/30 hover:border-rose-500/60 shadow-lg shadow-rose-950/20'
      }`}
    >
      {/* Background ambient glow */}
      <div
        className={`absolute -right-10 -bottom-10 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none ${
          isMinecraft ? 'bg-emerald-500' : 'bg-rose-500'
        }`}
      />

      <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                isMinecraft
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              }`}
            >
              {isMinecraft ? <Box className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                isMinecraft
                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-900/40 text-rose-300 border-rose-500/30'
              }`}
            >
              Populer
            </span>
          </div>

          <h3 className="text-2xl font-black text-white mt-4 tracking-tight">
            {isMinecraft ? 'Minecraft' : 'Roblox'}
          </h3>
          <p className="text-sm text-gray-300 mt-2 leading-relaxed">
            {isMinecraft
              ? 'Akun Original, Skins HD, Capes eksklusif, Realms 30 Hari & Voucher Minecoins.'
              : 'Item langka Blox Fruit, Fish It, Grow a Garden 2, dan akun max-level siap pakai.'}
          </p>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-mono">
            Tersedia berbagai pilihan item
          </span>

          <Link
            href={`/products?game=${game}`}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all transform group-hover:translate-x-1 ${
              isMinecraft
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/50'
                : 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-950/50'
            }`}
          >
            <span>Lihat Produk</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
