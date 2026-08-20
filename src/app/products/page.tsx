'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  SlidersHorizontal,
  Box,
  Layers,
  Sparkles,
  Loader2,
  Gamepad2,
} from 'lucide-react';
import ProductCard from '@/components/product/ProductCard';
import { GAME_CATEGORIES } from '@/lib/categories';
import { ProductItem } from '@/lib/types';

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialGame = searchParams.get('game') || 'all';
  const initialSub1 = searchParams.get('subCategory1') || 'all';
  const initialSub2 = searchParams.get('subCategory2') || 'all';
  const initialSearch = searchParams.get('search') || '';
  const initialSort = searchParams.get('sort') || 'popular';

  const [selectedGame, setSelectedGame] = useState<string>(initialGame);
  const [selectedSub1, setSelectedSub1] = useState<string>(initialSub1);
  const [selectedSub2, setSelectedSub2] = useState<string>(initialSub2);
  const [searchTerm, setSearchTerm] = useState<string>(initialSearch);
  const [sortBy, setSortBy] = useState<string>(initialSort);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch products based on filters
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (selectedGame !== 'all') query.set('game', selectedGame);
        if (selectedSub1 !== 'all') query.set('subCategory1', selectedSub1);
        if (selectedSub2 !== 'all') query.set('subCategory2', selectedSub2);
        if (searchTerm.trim()) query.set('search', searchTerm.trim());
        if (sortBy) query.set('sort', sortBy);

        const res = await fetch(`/api/products?${query.toString()}`);
        const json = await res.json();
        if (json.success) {
          setProducts(json.data);
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.error('Error fetching products:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchProducts();
    }, 250);

    return () => clearTimeout(timer);
  }, [selectedGame, selectedSub1, selectedSub2, searchTerm, sortBy]);

  const activeGameConfig = GAME_CATEGORIES.find((g) => g.id === selectedGame);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-surface border border-surface-border relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold mb-3">
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Katalog Resmi Game Item</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Katalog Produk Digital
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Pilih game dan filter kategori untuk menemukan akun, items, skins, dan paket game yang Anda cari.
          </p>
        </div>
      </div>

      {/* Main Filter Section */}
      <div className="space-y-4">
        {/* 1. Game Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-surface-border">
          <button
            onClick={() => {
              setSelectedGame('all');
              setSelectedSub1('all');
              setSelectedSub2('all');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              selectedGame === 'all'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-surface text-gray-400 hover:text-white hover:bg-surface-hover border border-surface-border'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Semua Game</span>
          </button>

          <button
            onClick={() => {
              setSelectedGame('minecraft');
              setSelectedSub1('all');
              setSelectedSub2('all');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              selectedGame === 'minecraft'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                : 'bg-surface text-gray-400 hover:text-emerald-400 hover:bg-surface-hover border border-surface-border'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-emerald-400" />
            <span>Minecraft</span>
          </button>

          <button
            onClick={() => {
              setSelectedGame('roblox');
              setSelectedSub1('all');
              setSelectedSub2('all');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              selectedGame === 'roblox'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                : 'bg-surface text-gray-400 hover:text-rose-400 hover:bg-surface-hover border border-surface-border'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-rose-400" />
            <span>Roblox</span>
          </button>
        </div>

        {/* 2. Subcategory Level 1 (Dynamic based on selected game) */}
        {activeGameConfig && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-gray-500 font-mono text-[11px] uppercase mr-1">Kategori:</span>
            {activeGameConfig.subcategories.map((sub) => {
              const isSelected = selectedSub1 === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSelectedSub1(sub.id);
                    setSelectedSub2('all');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isSelected
                      ? selectedGame === 'minecraft'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-surface/60 text-gray-400 hover:text-white border border-surface-border/60'
                  }`}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 3. Subcategory Level 2 (For Roblox Sub-Games) */}
        {selectedGame === 'roblox' &&
          selectedSub1 !== 'all' &&
          activeGameConfig?.subcategories
            .find((s) => s.id === selectedSub1)
            ?.childSubcategories && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs pl-2 border-l-2 border-rose-500/50">
              <span className="text-gray-500 font-mono text-[11px] uppercase mr-1">Tipe:</span>
              {activeGameConfig.subcategories
                .find((s) => s.id === selectedSub1)
                ?.childSubcategories?.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedSub2(child.id)}
                    className={`px-3 py-1 rounded-md font-medium transition-all text-xs ${
                      selectedSub2 === child.id
                        ? 'bg-rose-950 text-rose-300 border border-rose-500/40 font-bold'
                        : 'bg-surface text-gray-400 hover:text-gray-200 border border-surface-border'
                    }`}
                  >
                    {child.name}
                  </button>
                ))}
            </div>
          )}

        {/* 4. Search and Sort Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama item atau keyword..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-400">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="popular">Terpopuler</option>
              <option value="price_asc">Harga Termurah</option>
              <option value="price_desc">Harga Termahal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-gray-400">Memuat produk...</p>
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="p-16 rounded-3xl bg-surface/50 border border-surface-border text-center space-y-3">
          <p className="text-sm font-semibold text-gray-300">Tidak ada produk yang cocok</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Coba ubah kata kunci pencarian atau ganti kategori filter di atas.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-32 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-xs text-gray-400">Memuat katalog produk...</p>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
