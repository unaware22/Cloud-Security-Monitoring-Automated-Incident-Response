// In-memory persistent fallback product store for development & offline DB scenarios

export interface FallbackProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  stock: number;
  sortOrder?: number;
  productType: string;
  game: 'minecraft' | 'roblox';
  subCategory1: string;
  subCategory2?: string | null;
  deliveryType: 'automatic' | 'manual';
  deliveryContent: string;
  serviceTag?: string;
  soldCount?: string;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Initial seed products with explicit real assets from Image folder
const INITIAL_PRODUCTS: FallbackProduct[] = [
  {
    id: 'prod-mc-1',
    name: 'Akun Minecraft Java & Bedrock Edition',
    slug: 'akun-minecraft-java-bedrock-edition',
    description: 'OFFICIAL STORE • FULL ACCESS',
    price: 199000,
    originalPrice: 450000,
    discountPercent: 56,
    stock: 4,
    sortOrder: 1,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'akun',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: [
      'Email: saladin-vip01@mojangmail.com | Pass: SaladinSecure#2026_01 | Full Access Migration: https://account.mojang.com',
      'Email: saladin-vip02@mojangmail.com | Pass: SaladinSecure#2026_02 | Full Access Migration: https://account.mojang.com',
      'Email: saladin-vip03@mojangmail.com | Pass: SaladinSecure#2026_03 | Full Access Migration: https://account.mojang.com',
      'Email: saladin-vip04@mojangmail.com | Pass: SaladinSecure#2026_04 | Full Access Migration: https://account.mojang.com',
    ].join('\n'),
    imageUrl: '/images/produk1.jpg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-2',
    name: 'Bundle Akun Minecraft Java + Skin Standar',
    slug: 'bundle-akun-minecraft-java-skin-standar',
    description: '3D DUAL LAYER • POPULAR',
    price: 211000,
    originalPrice: 469000,
    discountPercent: 55,
    stock: 8,
    sortOrder: 2,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'skins',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Account: bundle-mc-9921@saladinmail.net | Pass: BundleSkin#882 | Skin Pack HD: https://saladinshop.com/dl/skin-bundle-v1.zip',
    imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-3',
    name: 'Custom Skin Minecraft HD 3D',
    slug: 'custom-skin-minecraft',
    description: 'CUSTOM SKIN • 3D DUAL LAYER',
    price: 19999,
    originalPrice: 50000,
    discountPercent: 60,
    stock: 79,
    sortOrder: 3,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'skins',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Skin File Download: https://saladinshop.com/skins/custom-skin-hd-77812.png | Tutorial: https://saladinshop.com/guide/skins',
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-minecoins-310',
    name: 'Minecoins 310 Minecraft Bedrock Edition',
    slug: 'minecoins-310-minecraft-bedrock',
    description: 'REDEEM RESMI • 310 COINS',
    price: 35000,
    originalPrice: 45000,
    discountPercent: 22,
    stock: 25,
    sortOrder: 4,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'minecoins',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Redeem Code: MNCN-310-SLDN-8812-9912 | Redeem URL: https://minecraft.net/redeem/minecoins',
    imageUrl: '/images/minecoins310.jpg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-minecoins-1000',
    name: 'Minecoins 1020 Minecraft Bedrock Edition',
    slug: 'minecoins-1020-minecraft-bedrock',
    description: 'REDEEM RESMI • 1020 COINS',
    price: 99000,
    originalPrice: 130000,
    discountPercent: 24,
    stock: 20,
    sortOrder: 5,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'minecoins',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Redeem Code: MNCN-1020-SLDN-4421-8891 | Redeem URL: https://minecraft.net/redeem/minecoins',
    imageUrl: '/images/minecoins1000.jpg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-minecoins-3500',
    name: 'Minecoins 3500 Minecraft Bedrock Edition',
    slug: 'minecoins-3500-minecraft-bedrock',
    description: 'REDEEM RESMI • 3500 COINS',
    price: 299000,
    originalPrice: 399000,
    discountPercent: 25,
    stock: 15,
    sortOrder: 6,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'minecoins',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Redeem Code: MNCN-3500-SLDN-7712-4419 | Redeem URL: https://minecraft.net/redeem/minecoins',
    imageUrl: '/images/minecoins3500.jpg',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-5',
    name: 'OptiFine Custom Animated Cape',
    slug: 'optifine-custom-animated-cape',
    description: 'OFFICIAL CAPE • INSTANT TRANSFER',
    price: 99000,
    originalPrice: 150000,
    discountPercent: 34,
    stock: 15,
    sortOrder: 7,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'capes',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Optifine Transfer Key: OF-CAPE-8821-9932 | Panduan Aktivasi: https://optifine.net/capeChange',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-mc-6',
    name: 'Minecraft Realms Plus Subscription 3 Bulan',
    slug: 'minecraft-realms-plus-3-bulan',
    description: 'MULTI-PLAYER SERVER • 10 FRIENDS',
    price: 320000,
    originalPrice: 420000,
    discountPercent: 24,
    stock: 12,
    sortOrder: 8,
    productType: 'digital',
    game: 'minecraft',
    subCategory1: 'realms',
    subCategory2: null,
    deliveryType: 'automatic',
    deliveryContent: 'Voucher Realms: REALM-PLUS-3M-991204 | Redeem: https://account.microsoft.com/billing/redeem',
    imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-rb-1',
    name: 'Blox Fruit Leopard Fruit (Physical / Perm)',
    slug: 'blox-fruit-leopard-fruit',
    description: 'MYTHICAL FRUIT • INSTANT TRADE',
    price: 145000,
    originalPrice: 220000,
    discountPercent: 34,
    stock: 9,
    sortOrder: 9,
    productType: 'digital',
    game: 'roblox',
    subCategory1: 'fisch',
    subCategory2: 'item',
    deliveryType: 'automatic',
    deliveryContent: 'Private Server Link: https://www.roblox.com/games/2753915549/BloxFruits?privateServerLinkCode=992188 | Bot Trade Username: SaladinTradeBot_01',
    imageUrl: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-rb-2',
    name: 'Roblox Account Old 2018 + 5000 Robux',
    slug: 'roblox-account-old-2018-robux',
    description: 'OLD ACCOUNT • CLEAN PIN 0%',
    price: 350000,
    originalPrice: 550000,
    discountPercent: 36,
    stock: 3,
    sortOrder: 10,
    productType: 'digital',
    game: 'roblox',
    subCategory1: 'bloxfruits',
    subCategory2: 'akun',
    deliveryType: 'automatic',
    deliveryContent: [
      'Username: SaladinBlox_2018A | Pass: SaladinTitan#889_A | Backup Codes: 849201, 773104 | Unverified Email',
      'Username: SaladinBlox_2018B | Pass: SaladinTitan#889_B | Backup Codes: 119402, 638201 | Unverified Email',
      'Username: SaladinBlox_2018C | Pass: SaladinTitan#889_C | Backup Codes: 559103, 992014 | Unverified Email',
    ].join('\n'),
    imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Global in-memory array for process lifecycle
const globalForProducts = globalThis as unknown as { fallbackProducts: FallbackProduct[] };
if (!globalForProducts.fallbackProducts) {
  globalForProducts.fallbackProducts = [...INITIAL_PRODUCTS];
}

export const fallbackProducts = globalForProducts.fallbackProducts;

export const fallbackStore = {
  getProducts: (filters?: { game?: string; subCategory1?: string; subCategory2?: string; isActive?: boolean }) => {
    let result = [...fallbackProducts];
    if (filters) {
      if (filters.game && filters.game !== 'all') {
        result = result.filter((p) => p.game === filters.game);
      }
      if (filters.subCategory1 && filters.subCategory1 !== 'all') {
        result = result.filter((p) => p.subCategory1 === filters.subCategory1);
      }
      if (filters.subCategory2 && filters.subCategory2 !== 'all') {
        result = result.filter((p) => p.subCategory2 === filters.subCategory2);
      }
      if (filters.isActive !== undefined) {
        result = result.filter((p) => p.isActive === filters.isActive);
      }
    }
    result.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    return result;
  },
  getProductById: (id: string) => fallbackProducts.find((p) => p.id === id),
  getProductBySlug: (slug: string) => fallbackProducts.find((p) => p.slug === slug),
  createProduct: (data: Omit<FallbackProduct, 'id' | 'createdAt' | 'updatedAt'>) => {
    const maxOrder = fallbackProducts.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0);
    const newProduct: FallbackProduct = {
      id: `prod-${Date.now()}`,
      ...data,
      sortOrder: data.sortOrder ?? maxOrder + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fallbackProducts.push(newProduct);
    return newProduct;
  },
  updateProduct: (id: string, data: Partial<FallbackProduct>) => {
    const index = fallbackProducts.findIndex((p) => p.id === id || p.slug === id);
    if (index === -1) return null;

    const cleanData: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    fallbackProducts[index] = {
      ...fallbackProducts[index],
      ...cleanData,
      updatedAt: new Date().toISOString(),
    };
    return fallbackProducts[index];
  },
  deleteProduct: (id: string) => {
    const index = fallbackProducts.findIndex((p) => p.id === id || p.slug === id);
    if (index === -1) return false;
    fallbackProducts.splice(index, 1);
    fallbackProducts.forEach((p, idx) => {
      p.sortOrder = idx + 1;
    });
    return true;
  },
};

export function deleteFallbackProduct(id: string): boolean {
  return fallbackStore.deleteProduct(id);
}

export function getAllFallbackProducts(): FallbackProduct[] {
  return [...fallbackProducts].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export function reorderFallbackProduct(id: string, direction: 'up' | 'down'): FallbackProduct[] {
  fallbackProducts.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  const index = fallbackProducts.findIndex((p) => p.id === id || p.slug === id);
  if (index === -1) return fallbackProducts;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= fallbackProducts.length) return fallbackProducts;

  const temp = fallbackProducts[index];
  fallbackProducts[index] = fallbackProducts[targetIndex];
  fallbackProducts[targetIndex] = temp;

  fallbackProducts.forEach((p, idx) => {
    p.sortOrder = idx + 1;
    p.updatedAt = new Date().toISOString();
  });

  return [...fallbackProducts].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export function setFallbackProductOrder(id: string, newOrder: number): FallbackProduct[] {
  const index = fallbackProducts.findIndex((p) => p.id === id || p.slug === id);
  if (index === -1) return fallbackProducts;

  fallbackProducts[index].sortOrder = newOrder;
  fallbackProducts[index].updatedAt = new Date().toISOString();
  fallbackProducts.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  fallbackProducts.forEach((p, idx) => {
    p.sortOrder = idx + 1;
  });

  return [...fallbackProducts].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}

export function getFallbackProductBySlug(slug: string): FallbackProduct | undefined {
  return fallbackProducts.find((p) => p.slug === slug);
}

export function getFallbackProductById(id: string): FallbackProduct | undefined {
  return fallbackProducts.find((p) => p.id === id);
}

export function addFallbackProduct(data: Omit<FallbackProduct, 'id' | 'createdAt' | 'updatedAt'>): FallbackProduct {
  return fallbackStore.createProduct(data);
}

export function decrementProductStock(identifier: string, quantity = 1): FallbackProduct | null {
  const index = fallbackProducts.findIndex((p) => p.id === identifier || p.slug === identifier);
  if (index === -1) return null;
  const currentStock = fallbackProducts[index].stock;
  const newStock = Math.max(0, currentStock - quantity);
  fallbackProducts[index] = {
    ...fallbackProducts[index],
    stock: newStock,
    updatedAt: new Date().toISOString(),
  };
  return fallbackProducts[index];
}

/**
 * Dispatches distinct delivery data items from the product's pool of delivery credentials.
 * If multiple lines exist (1 per stock unit), pops the top 'quantity' lines for the customer,
 * saves the remaining lines back into the product, and updates the stock accordingly.
 */
export function dispatchProductDelivery(
  identifier: string,
  quantity = 1
): { dispatchedContent: string; remainingStock: number } | null {
  const index = fallbackProducts.findIndex((p) => p.id === identifier || p.slug === identifier);
  if (index === -1) return null;

  const product = fallbackProducts[index];
  const rawContent = product.deliveryContent || '';
  const lines = rawContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let dispatchedContent = '';
  let remainingLines: string[] = [];

  if (lines.length > 0) {
    const taken = lines.slice(0, quantity);
    dispatchedContent = taken.join('\n');
    remainingLines = lines.slice(quantity);
  } else {
    dispatchedContent =
      rawContent ||
      'Email: saladin-vip892@mojangmail.com | Pass: SaladinSecure#2026 | Full Access Migration: https://account.mojang.com';
  }

  const newStock = Math.max(0, lines.length > 0 ? remainingLines.length : product.stock - quantity);
  const newDeliveryContent = remainingLines.join('\n');

  fallbackProducts[index] = {
    ...fallbackProducts[index],
    stock: newStock,
    deliveryContent: newDeliveryContent,
    updatedAt: new Date().toISOString(),
  };

  return {
    dispatchedContent,
    remainingStock: newStock,
  };
}

export function updateFallbackProduct(id: string, data: Partial<FallbackProduct>): FallbackProduct | null {
  return fallbackStore.updateProduct(id, data);
}
