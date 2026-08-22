import React from 'react';
import Link from 'next/link';
import { Star, ChevronRight } from 'lucide-react';
import { formatIDR } from '@/lib/utils';
import { ProductItem } from '@/lib/types';

interface ProductCardProps {
  product: ProductItem;
}

/**
 * Service tag determination:
 * - PEMBUATAN CEPAT: custom skins, capes, realms, minecoins
 * - PROSES INSTANT: akun bundles, Java, Bedrock, roblox pass
 */
function getProductTag(product: ProductItem): 'pembuatan-cepat' | 'proses-instant' {
  const slug = product.slug.toLowerCase();
  const name = product.name.toLowerCase();
  const sub1 = (product.subCategory1 || '').toLowerCase();

  const isPembuatanCepat =
    sub1 === 'skins' ||
    sub1 === 'capes' ||
    sub1 === 'realms' ||
    sub1 === 'minecoins' ||
    slug.includes('skin') ||
    slug.includes('cape') ||
    slug.includes('realm') ||
    slug.includes('minecoins') ||
    name.includes('skin') ||
    name.includes('cape') ||
    name.includes('realm') ||
    name.includes('minecoin');

  return isPembuatanCepat ? 'pembuatan-cepat' : 'proses-instant';
}

export default function ProductCard({ product }: ProductCardProps) {
  const isAvailable = product.isActive && (product.stock ?? 0) > 0;

  // Discount calculation
  const discountPercent =
    product.discountPercent !== undefined && product.discountPercent !== null
      ? product.discountPercent
      : product.slug.includes('skin')
      ? 60
      : product.slug.includes('bundle')
      ? 55
      : 25;

  const originalPrice =
    product.originalPrice && product.originalPrice > product.price
      ? product.originalPrice
      : discountPercent > 0
      ? Math.round((product.price / Math.max(1, 100 - discountPercent)) * 100)
      : product.price;

  const tagType = product.serviceTag || getProductTag(product);
  const soldCountDisplay = product.soldCount || '19rb+ Terjual';

  return (
    <div className={`group rounded-none bg-[#181818] text-white border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xl hover:shadow-2xl select-none ${
      isAvailable ? 'border-neutral-800 hover:border-neutral-600' : 'border-neutral-900 opacity-75'
    }`}>

      {/* 1. Game Cover Art (Taller aspect-square with object-top for clear logo visibility) */}
      <div className="relative aspect-square w-full overflow-hidden bg-[#0c1220]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover object-top transition-transform duration-500 ${isAvailable ? 'group-hover:scale-105' : 'grayscale-[40%]'}`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-500 font-mono text-xs">
            SALADINSHOP
          </div>
        )}

        {/* Discount Badge (Top-Right) */}
        {discountPercent > 0 && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-0.5 rounded-none text-[11px] font-black bg-rose-600 text-white shadow-lg flex items-center tracking-tight">
              -{discountPercent}%
            </span>
          </div>
        )}

        {/* Subtle Dark Gradient at bottom of image */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#181818] to-transparent pointer-events-none" />
      </div>

      {/* 2. Card Content Body */}
      <div className="p-3.5 sm:p-4 flex-grow flex flex-col justify-between space-y-3">
        
        <div className="space-y-2.5">
          {/* Product Title (Fixed height equal to 2 lines so 1-line titles align perfectly with 2-line titles) */}
          <div className="min-h-[2.6rem] sm:min-h-[2.85rem] flex items-start">
            {isAvailable ? (
              <Link href={`/checkout/${product.slug}`} className="w-full">
                <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-[#ffc825] transition-colors line-clamp-2 leading-snug">
                  {product.name}
                </h3>
              </Link>
            ) : (
              <h3 className="text-sm sm:text-base font-bold text-neutral-400 line-clamp-2 leading-snug cursor-not-allowed w-full">
                {product.name}
              </h3>
            )}
          </div>

          {/* Service Tag + Rating & Terjual Row (Single Compact Row) */}
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-0.5">
            {/* Tag Badge (Compact) */}
            {tagType === 'pembuatan-cepat' ? (
              <img
                src="/images/tag-pembuatan-cepat.png"
                alt="Pembuatan Cepat"
                className="h-3.5 w-auto object-contain flex-shrink-0"
              />
            ) : (
              <img
                src="/images/tag-proses-instant.png"
                alt="Proses Instant"
                className="h-3.5 w-auto object-contain flex-shrink-0"
              />
            )}

            {/* Rating & Terjual */}
            <div className="flex items-center gap-1 font-medium">
              <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                4.9
              </span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-400 text-[10px] sm:text-[11px]">{soldCountDisplay}</span>
            </div>
          </div>
        </div>

        {/* 3. Price, Discount & Stock Row */}
        <div className="pt-2 border-t border-neutral-800/80 space-y-2.5">
          {/* Discount details & Sisa Stok on same row */}
          <div className="flex items-center justify-between gap-1 text-[10px]">
            {discountPercent > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500 line-through font-mono">
                  {formatIDR(originalPrice)}
                </span>
                <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 border border-rose-500/20 px-1 py-0.5">
                  Hemat {formatIDR(originalPrice - product.price)}
                </span>
              </div>
            ) : <div />}

            {/* Sisa Stok Pill */}
            {isAvailable ? (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                Sisa {product.stock}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-neutral-900 text-neutral-500 border border-neutral-800 whitespace-nowrap">
                HABIS
              </span>
            )}
          </div>

          {/* Main Price */}
          <span className="text-lg sm:text-xl font-black text-white tracking-tight block font-mono">
            {formatIDR(product.price)}
          </span>

          {/* Minecraft.net 3D Gold Action Button */}
          {isAvailable ? (
            <Link
              href={`/checkout/${product.slug}`}
              className="w-full py-2.5 px-3 text-xs font-black text-[#111111] bg-[#ffc825] hover:bg-[#ffcf3d] border-b-4 border-[#b87e00] active:border-b-0 active:translate-y-1 shadow-md transition-all flex items-center justify-center gap-1 uppercase tracking-wider rounded-none select-none hover:scale-[1.01]"
            >
              <span>BELI SEKARANG</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />
            </Link>
          ) : (
            <button
              disabled
              className="w-full py-2.5 px-3 text-xs font-bold text-neutral-500 bg-neutral-900 border border-neutral-800 cursor-not-allowed text-center uppercase tracking-wider rounded-none"
            >
              STOK HABIS
            </button>
          )}
        </div>

      </div>

    </div>
  );
}
