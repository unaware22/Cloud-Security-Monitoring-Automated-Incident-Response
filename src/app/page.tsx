'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  LayoutGrid, Gem, User, Shirt, Layers, Coins,
  Gamepad2, Box, Fish, Flame, Sprout,
  Package, UserCheck, Loader2, ChevronRight,
} from 'lucide-react';
import ProductCard from '@/components/product/ProductCard';
import { ProductItem } from '@/lib/types';

/* ────────────────────────────────────────────────────────────
   TYPEWRITER HOOK (Animated Typewriter Effect with Restart)
──────────────────────────────────────────────────────────── */
function useTypewriter(words: string[], isActive = true, speed = 75, pause = 2200, deleteSpeed = 35) {
  const [index, setIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [blink, setBlink] = useState(true);

  // Restart typewriter animation whenever isActive turns true (e.g. scroll into view)
  useEffect(() => {
    if (isActive) {
      setIndex(0);
      setSubIndex(0);
      setIsDeleting(false);
    }
  }, [isActive]);

  useEffect(() => {
    const blinkInterval = setInterval(() => setBlink((v) => !v), 450);
    return () => clearInterval(blinkInterval);
  }, []);

  useEffect(() => {
    if (!isActive) return;

    if (subIndex === words[index].length + 1 && !isDeleting) {
      const timeout = setTimeout(() => setIsDeleting(true), pause);
      return () => clearTimeout(timeout);
    }

    if (subIndex === 0 && isDeleting) {
      setIsDeleting(false);
      setIndex((prev) => (prev + 1) % words.length);
      return;
    }

    const timeout = setTimeout(
      () => {
        setSubIndex((prev) => prev + (isDeleting ? -1 : 1));
      },
      isDeleting ? deleteSpeed : speed
    );

    return () => clearTimeout(timeout);
  }, [subIndex, index, isDeleting, words, speed, pause, deleteSpeed, isActive]);

  return { text: words[index].substring(0, subIndex), blink };
}

/* ────────────────────────────────────────────────────────────
   3 HERO WORLDS (High-Res 5K / 4K / Full HD from folder Image)
──────────────────────────────────────────────────────────── */
const HERO_WORLDS = [
  {
    id: 'gambar1',
    bgImage: '/images/gambar1.jpg',
    targetGame: 'minecraft' as const,
  },
  {
    id: 'gambarnew',
    bgImage: '/images/gambarnew.jpg',
    targetGame: 'minecraft' as const,
  },
  {
    id: 'gambar4',
    bgImage: '/images/gambar4.png',
    targetGame: 'roblox' as const,
  },
];

/* ────────────────────────────────────────────────────────────
   5-SECOND INFINITE CAROUSEL BANNERS (Auto-Slides every 5s)
──────────────────────────────────────────────────────────── */
const BASE_BANNERS = [
  {
    id: 1,
    tag: '',
    badge: '',
    title: '',
    sub: '',
    overlay: '',
    ring: 'ring-sky-500/30',
    tagColor: '',
    img: '/images/kotak1.jpg',
    imageOnly: true,
  },
  {
    id: 2,
    tag: '',
    badge: '',
    title: '',
    sub: '',
    overlay: '',
    ring: 'ring-amber-500/30',
    tagColor: '',
    img: '/images/kotak2.png',
    imageOnly: true,
  },
  {
    id: 3,
    tag: '',
    badge: '',
    title: '',
    sub: '',
    overlay: '',
    ring: 'ring-emerald-500/30',
    tagColor: '',
    img: '/images/kotak3.jpg',
    imageOnly: true,
  },
];

const CLONED = [
  ...BASE_BANNERS,
  ...BASE_BANNERS,
  ...BASE_BANNERS,
  ...BASE_BANNERS,
  ...BASE_BANNERS,
];
const N = BASE_BANNERS.length; // 3
const MID = N * 2;             // start in middle set (index 6)

export default function HomePage() {
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);

  // Section 2 Intersection Observer for Typewriter restart on scroll
  const statsSectionRef = useRef<HTMLDivElement | null>(null);
  const [statsInView, setStatsInView] = useState(true);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStatsInView(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    if (statsSectionRef.current) observer.observe(statsSectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Typewriter headlines for the stats section (restarts when in view)
  const typewriterStats = useTypewriter(
    [
      '10.000+ PELANGGAN PUAS',
      '1 TAHUN BERDIRI RESMI',
      '4.9/5.0 RATING BINTANG',
    ],
    statsInView
  );

  // 5-Second Carousel State
  const [slide, setSlide] = useState(MID);
  const [animated, setAnimated] = useState(true);
  const [pausedCarousel, setPausedCarousel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const autoRef = useRef<NodeJS.Timeout | null>(null);

  // Responsive device detector
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Product Catalog State
  const [selectedGame, setSelectedGame] = useState<'minecraft' | 'roblox'>('minecraft');
  const [minecraftSub, setMinecraftSub] = useState('all');
  const [robloxGame, setRobloxGame] = useState('all');
  const [robloxSub, setRobloxSub] = useState('all');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-switch Hero Background every 6 seconds if not hovered
  useEffect(() => {
    if (isHeroPaused) return;
    const timer = setInterval(() => {
      setActiveHeroIndex((prev) => (prev + 1) % HERO_WORLDS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isHeroPaused]);

  // Auto-slide 5-Second Carousel every 5 seconds
  useEffect(() => {
    if (pausedCarousel) return;
    autoRef.current = setInterval(() => {
      setAnimated(true);
      setSlide((s) => s + 1);
    }, 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [pausedCarousel]);

  // Infinite carousel loop reset
  useEffect(() => {
    if (slide >= N * 4) {
      const t = setTimeout(() => {
        setAnimated(false);
        setSlide(MID);
      }, 720);
      return () => clearTimeout(t);
    }
    if (slide <= 0) {
      const t = setTimeout(() => {
        setAnimated(false);
        setSlide(MID);
      }, 720);
      return () => clearTimeout(t);
    }
  }, [slide]);

  const activeWorld = HERO_WORLDS[activeHeroIndex];
  const activeDot = slide % N;
  const itemsPerView = isMobile ? 1 : 3;

  const handleSelectWorld = (index: number) => {
    setActiveHeroIndex(index);
    setSelectedGame(HERO_WORLDS[index].targetGame);
  };

  // Fetch product catalog from API (reads both data.data & data.products)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let url = `/api/products?game=${selectedGame}`;
        if (selectedGame === 'minecraft') {
          if (minecraftSub !== 'all') url += `&subCategory1=${minecraftSub}`;
        } else {
          if (robloxGame !== 'all') url += `&subCategory1=${robloxGame}`;
          if (robloxSub !== 'all') url += `&subCategory2=${robloxSub}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        const productList = (data && (data.data || data.products)) || [];
        setProducts(productList);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedGame, minecraftSub, robloxGame, robloxSub]);

  const mcTabs = [
    { id: 'all', label: 'Semua', Icon: LayoutGrid },
    { id: 'akun', label: 'Akun', Icon: Gem },
    { id: 'skins', label: 'Skins', Icon: User },
    { id: 'capes', label: 'Capes', Icon: Shirt },
    { id: 'minecoins', label: 'Minecoins', Icon: Coins },
    { id: 'realms', label: 'Realms Plus', Icon: Layers },
  ];

  const rbGames = [
    { id: 'all', label: 'Semua Game', Icon: LayoutGrid },
    { id: 'fisch', label: 'Fisch', Icon: Fish },
    { id: 'bloxfruits', label: 'Blox Fruits', Icon: Flame },
    { id: 'growagirl', label: 'Grow a Girl', Icon: Sprout },
    { id: 'robux', label: 'Robux', Icon: Coins },
  ];

  const rbSubs = [
    { id: 'all', label: 'Semua Produk', Icon: LayoutGrid },
    { id: 'akun', label: 'Akun', Icon: UserCheck },
    { id: 'item', label: 'Item & Pass', Icon: Package },
    { id: 'currency', label: 'Currency', Icon: Coins },
  ];

  return (
    <div className="w-full min-h-screen bg-[#111111] text-white">

      {/* ══════════════════════════════════════════════════════════════
          1. HERO & FLASHSALE SECTION (Matching Exact Minecraft.net Layout)
      ══════════════════════════════════════════════════════════════ */}
      <section
        className="relative w-full bg-[#181818] overflow-hidden pt-[68px] sm:pt-[78px] md:pt-[86px] lg:pt-0"
        onMouseEnter={() => { setIsHeroPaused(true); setPausedCarousel(true); }}
        onMouseLeave={() => { setIsHeroPaused(false); setPausedCarousel(false); }}
      >
        {/* === Hero Artwork Canvas (Extended Downwards so FLASHSALE is Hidden Below the Fold) === */}
        <div className="relative w-full h-[620px] sm:h-[680px] md:h-[760px] lg:h-[800px] xl:h-[800px] 2xl:h-[800px] min-h-[600px] overflow-hidden bg-[#0c1220]">
          {HERO_WORLDS.map((world, idx) => (
            <div
              key={world.id}
              className={`hero-bg-crisp absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out ${activeHeroIndex === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              style={{
                backgroundImage: `url(${world.bgImage})`,
              }}
            />
          ))}
          {/* Subtle ambient light */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* === Overlapping Row: Action Box (Left) + 3 Thumbnails (Right) === */}
        <div className="relative z-30 w-full max-w-[1580px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 -mt-28 sm:-mt-32 md:-mt-36 lg:-mt-44">

          {/* Desktop 2-Column Row (lg:grid) */}
          <div className="hidden lg:grid grid-cols-12 gap-8 items-end">

            {/* Left Action Box - Shortened Horizontally, Seamless Without Borders or Shadows */}
            <div className="lg:col-span-6 xl:col-span-5 max-w-md xl:max-w-[460px] w-full">
              {/* Stepped Pixel Notches on Top Edge */}
              <div className="flex items-end gap-1.5 pl-8">
                <div className="w-5 h-3 bg-[#181818]" />
                <div className="w-5 h-5 bg-[#181818]" />
                <div className="w-5 h-3 bg-[#181818]" />
              </div>

              {/* Action Box Body (Seamless, No Border, No Shadow) */}
              <div className="bg-[#181818] p-6 md:p-7 lg:p-8 space-y-3.5 md:space-y-4">
                <h2 className="text-[20px] md:text-[23px] lg:text-[26px] leading-tight space-y-1 select-none font-normal tracking-wide">
                  <span className="minecraft-font-folder block text-white whitespace-nowrap drop-shadow-sm">
                    TOKO MINECRAFT DAN
                  </span>
                  <span className="minecraft-font-folder block text-white whitespace-nowrap drop-shadow-sm">
                    ROBLOX INDONESIA
                  </span>
                </h2>

                <p className="text-sm md:text-base text-neutral-200 leading-relaxed font-config-text font-normal">
                  Semua kebutuhan game Minecraft &amp; Roblox resmi, terpercaya, dan bergaransi 100%.
                </p>

                <div className="pt-1.5">
                  <a
                    href="#catalog"
                    onClick={() => setSelectedGame(activeWorld.targetGame)}
                    className="inline-flex items-center justify-center gap-3 px-8 md:px-10 py-3.5 md:py-4 text-sm md:text-base lg:text-lg font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 transition-all select-none uppercase tracking-wider rounded-none sm:rounded-sm"
                  >
                    <span>BELI SEKARANG</span>
                    <ChevronRight className="w-5 h-5 md:w-5 md:h-5 stroke-[3]" />
                  </a>
                </div>
              </div>
            </div>

            {/* Right: 3 Thumbnails (Smaller & Horizontally Aligned with Action Box) */}
            <div className="lg:col-span-6 xl:col-span-7 flex justify-end items-end pb-0">
              <div className="flex items-center gap-3 sm:gap-3.5">
                {HERO_WORLDS.map((world, idx) => {
                  const isActive = activeHeroIndex === idx;
                  return (
                    <button
                      key={world.id}
                      onClick={() => handleSelectWorld(idx)}
                      type="button"
                      aria-label={`Pilih Latar ${idx + 1}`}
                      className={`
                        relative rounded-none overflow-hidden w-20 sm:w-22 lg:w-24 aspect-square transition-all duration-150
                        border-2 select-none flex-shrink-0
                        ${isActive
                          ? 'border-[#69c944] ring-2 ring-[#69c944]/80 scale-105'
                          : 'border-white/20 hover:border-white/60 opacity-60 hover:opacity-100 hover:scale-102'
                        }
                      `}
                    >
                      <img
                        src={world.bgImage}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Mobile Stacked Seam (< lg) */}
          <div className="block lg:hidden space-y-4">
            {/* Centered Action Box (Seamless, No Border, No Shadow) */}
            <div className="w-full max-w-sm sm:max-w-md mx-auto bg-[#181818] p-5 sm:p-6 space-y-3 text-center">
              <h2 className="text-lg sm:text-xl font-normal tracking-wide text-center leading-snug">
                <span className="minecraft-font-folder block text-white whitespace-nowrap drop-shadow-sm">
                  TOKO MINECRAFT DAN
                </span>
                <span className="minecraft-font-folder block text-white whitespace-nowrap drop-shadow-sm">
                  ROBLOX INDONESIA
                </span>
              </h2>

              <p className="text-sm sm:text-base text-neutral-200 leading-relaxed font-config-text text-center px-1">
                Semua kebutuhan game Minecraft &amp; Roblox resmi, terpercaya, dan bergaransi 100%.
              </p>

              <div className="flex justify-center pt-1">
                <a
                  href="#catalog"
                  onClick={() => setSelectedGame(activeWorld.targetGame)}
                  className="w-full sm:w-auto px-8 sm:px-10 py-3 sm:py-3.5 text-sm sm:text-base font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 transition-all select-none uppercase tracking-wider rounded-none inline-flex items-center justify-center gap-2.5"
                >
                  <span>BELI SEKARANG</span>
                  <ChevronRight className="w-5 h-5 stroke-[3]" />
                </a>
              </div>
            </div>

            {/* 3 Thumbnails Centered below */}
            <div className="flex justify-center items-center gap-2.5 sm:gap-3 pt-1">
              {HERO_WORLDS.map((world, idx) => {
                const isActive = activeHeroIndex === idx;
                return (
                  <button
                    key={world.id}
                    onClick={() => handleSelectWorld(idx)}
                    type="button"
                    aria-label={`Pilih Latar ${idx + 1}`}
                    className={`
                      relative rounded-none overflow-hidden w-18 sm:w-20 aspect-square transition-all duration-150
                      border-2 select-none flex-shrink-0
                      ${isActive
                        ? 'border-[#69c944] ring-2 ring-[#69c944]/80 scale-105'
                        : 'border-white/20 hover:border-white/60 opacity-60 hover:opacity-100'
                      }
                    `}
                  >
                    <img
                      src={world.bgImage}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* === FLASHSALE TITLE & CAROUSEL SECTION === */}
        <div className="w-full max-w-[1580px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 pt-16 sm:pt-20 md:pt-14 lg:pt-22 pb-20 sm:pb-24 md:pb-8 lg:pb-8 space-y-8">

          {/* FLASHSALE Title Centered in Minecraft Font (Matches DISCOVER OUR GAMES in screenshot) */}
          <div className="text-center">
            <h2 className="minecraft-font-folder text-3xl sm:text-4xl md:text-5xl lg:text-[54px] text-white tracking-widest uppercase drop-shadow-md select-none pb-20 sm:pb-24 md:pb-8 lg:pb-8">
              FLASHSALE
            </h2>
          </div>

          {/* Carousel Banner Track */}
          <div className="w-full overflow-hidden">
            <div
              className="flex"
              style={{
                width: `${CLONED.length * (100 / itemsPerView)}%`,
                transform: `translateX(-${(slide / CLONED.length) * 100}%)`,
                transition: animated ? 'transform 0.7s cubic-bezier(0.77,0,0.175,1)' : 'none',
              }}
            >
              {CLONED.map((b, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 px-2 sm:px-3 py-2"
                  style={{ width: `${100 / CLONED.length}%` }}
                >
                  {/* Card */}
                  <div className={`relative h-[210px] sm:h-[250px] md:h-[280px] rounded-none sm:rounded-sm overflow-hidden ring-2 ${b.ring} shadow-2xl group cursor-pointer`}>
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url(${b.img})` }}
                    />

                    {!b.imageOnly && (
                      <>
                        <div className={`absolute inset-0 bg-gradient-to-t ${b.overlay}`} />
                        <div className="relative h-full p-5 sm:p-6 flex flex-col justify-between text-white">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-none text-[10px] font-black uppercase tracking-wider bg-black/50 backdrop-blur-sm border border-white/10 ${b.tagColor}`}>
                              {b.tag}
                            </span>
                            <span className="px-2.5 py-1 rounded-none text-[10px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-sm border border-white/20 text-white">
                              {b.badge}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-base sm:text-lg md:text-xl font-black leading-tight drop-shadow-md">
                              {b.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-300 font-medium font-config-text">
                              {b.sub}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carousel indicator dots */}
          <div className="flex justify-center items-center gap-2 pt-2">
            {BASE_BANNERS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setAnimated(true);
                  setSlide(MID + (i - (MID % N)));
                }}
                className={`h-2 rounded-none transition-all duration-300 ${activeDot === i ? 'w-8 bg-[#ffc825] shadow-md' : 'w-2 bg-white/30 hover:bg-white/60'
                  }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          3. STATS SECTION (Swapped to Section 3)
      ══════════════════════════════════════════════════════════════ */}
      <section
        ref={statsSectionRef}
        className="relative w-full py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-[#060e1e] via-[#091738] to-[#060e1e] border-y border-cyan-950/80 overflow-hidden"
      >
        {/* Minecraft Pixel Pattern Background */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

        <div className="relative z-10 w-full max-w-[1580px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-14 items-center">

            {/* Left: Heroic Artwork Box with border.png (7 cols, max-w-[800px]) */}
            <div className="lg:col-span-7 flex justify-center lg:justify-start w-full">
              <div className="relative w-full max-w-[800px] aspect-[1672/941] select-none">

                {/* Inner Artwork Image */}
                <div className="absolute inset-[2.8%] overflow-hidden bg-[#07132a]">
                  <img
                    src="/images/gambarborder.jpg"
                    alt="Minecraft Artwork"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07132a]/30 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* User's Exact border.png Frame Overlay */}
                <img
                  src="/images/border.png"
                  alt="Minecraft Cyan Border Frame"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-[0_0_20px_rgba(56,189,248,0.65)]"
                />
              </div>
            </div>

            {/* Right: Clean Typewriter Title + 3 Stat Blocks (5 cols) */}
            <div className="lg:col-span-5 space-y-6 text-center lg:text-left">

              {/* Typewriter Title in Authentic Minecraft Font */}
              <div className="min-h-[85px] sm:min-h-[105px] flex items-center justify-center lg:justify-start">
                <h2 className="minecraft-font-folder text-[24px] sm:text-[32px] md:text-[36px] lg:text-[40px] text-white leading-tight uppercase tracking-wide drop-shadow-md">
                  {typewriterStats.text}
                  <span className={`inline-block ml-1 text-cyan-400 font-mono ${typewriterStats.blink ? 'opacity-100' : 'opacity-0'}`}>
                    █
                  </span>
                </h2>
              </div>

              {/* 3 Prominent Minecraft Pixel Stat Blocks */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-4 pt-1 max-w-xl mx-auto lg:mx-0">

                {/* Stat 1: Pelanggan */}
                <div className="p-3.5 sm:p-4 bg-[#07132a]/90 border-2 border-cyan-500/40 rounded-none text-center shadow-lg">
                  <p className="minecraft-font-folder text-lg sm:text-2xl text-cyan-300 font-bold leading-none">
                    10RB+
                  </p>
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-neutral-300 mt-1.5">
                    Pelanggan
                  </p>
                </div>

                {/* Stat 2: Tahun Berdiri */}
                <div className="p-3.5 sm:p-4 bg-[#07132a]/90 border-2 border-cyan-500/40 rounded-none text-center shadow-lg">
                  <p className="minecraft-font-folder text-lg sm:text-2xl text-emerald-400 font-bold leading-none">
                    1 THN
                  </p>
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-neutral-300 mt-1.5">
                    Berdiri
                  </p>
                </div>

                {/* Stat 3: Rating Bintang */}
                <div className="p-3.5 sm:p-4 bg-[#07132a]/90 border-2 border-cyan-500/40 rounded-none text-center shadow-lg">
                  <p className="minecraft-font-folder text-lg sm:text-2xl text-white font-bold leading-none">
                    4.9<span className="text-yellow-400 text-xl ml-0.5">★</span>
                  </p>
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-neutral-300 mt-1.5">
                    Rating
                  </p>
                </div>

              </div>

            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          4. PRODUCT CATALOG SECTION (Background #262423)
      ══════════════════════════════════════════════════════════════ */}
      <section id="catalog" className="w-full bg-[#262423] py-14 sm:py-20">
        <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 space-y-8">

          {/* Game Switcher Tabs: Minecraft & Roblox */}
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            <button
              onClick={() => { setSelectedGame('minecraft'); setMinecraftSub('all'); }}
              className={`flex items-center gap-2.5 px-7 sm:px-10 py-3 sm:py-3.5 rounded-none text-xs sm:text-sm font-black transition-all duration-200 border ${selectedGame === 'minecraft'
                ? 'bg-[#367723] text-white border-b-4 border-[#1f4813] ring-2 ring-[#367723]/50 shadow-xl scale-105'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                }`}
            >
              <img src="/images/minecraft-icon.png" alt="Minecraft" className="w-5 h-5 sm:w-6 sm:h-6 object-contain select-none flex-shrink-0" />
              <span>MINECRAFT</span>
            </button>

            <button
              onClick={() => { setSelectedGame('roblox'); setRobloxGame('all'); setRobloxSub('all'); }}
              className={`flex items-center gap-2.5 px-7 sm:px-10 py-3 sm:py-3.5 rounded-none text-xs sm:text-sm font-black transition-all duration-200 border ${selectedGame === 'roblox'
                ? 'bg-[#0095f6] text-white border-b-4 border-[#006bb3] ring-2 ring-sky-500/40 shadow-xl scale-105'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                }`}
            >
              <img src="/images/roblox-icon.png" alt="Roblox" className="w-5 h-5 sm:w-6 sm:h-6 object-contain select-none flex-shrink-0" />
              <span>ROBLOX</span>
            </button>
          </div>

          {/* Subcategory Filter Pills for Minecraft */}
          {selectedGame === 'minecraft' && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {mcTabs.map(({ id, label, Icon }) => {
                const isActive = minecraftSub === id;
                return (
                  <button
                    key={id}
                    onClick={() => setMinecraftSub(id)}
                    className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-none text-xs sm:text-sm font-bold transition-all border ${isActive
                      ? 'bg-[#367723] text-white border-[#367723] shadow-md'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800 shadow-sm'
                      }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-emerald-400'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Subcategory Filter Pills for Roblox */}
          {selectedGame === 'roblox' && (
            <div className="space-y-2.5">
              {/* Row 1: Roblox Sub-Games */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {rbGames.map(({ id, label, Icon }) => {
                  const isActive = robloxGame === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setRobloxGame(id)}
                      className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-none text-xs sm:text-sm font-bold transition-all border ${isActive
                        ? 'bg-[#0095f6] text-white border-[#0095f6] shadow-md'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800 shadow-sm'
                        }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-sky-400'}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Row 2: Roblox Product Types */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {rbSubs.map(({ id, label, Icon }) => {
                  const isActive = robloxSub === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setRobloxSub(id)}
                      className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-none text-xs sm:text-sm font-bold transition-all border ${isActive
                        ? 'bg-[#0095f6] text-white border-[#0095f6] shadow-md'
                        : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-800 shadow-sm'
                        }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Product Grid: Compact 4 Columns with Generous Side Margins */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-xs text-neutral-400 font-medium">Memuat katalog produk...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center text-neutral-400 text-sm bg-neutral-900/60 rounded-none border border-neutral-800 p-8">
              Belum ada produk yang tersedia untuk kategori ini.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

        </div>
      </section>

    </div>
  );
}
