import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting SALADINSHOP Database Seeding ---');

  // 1. Seed Admin User
  const adminEmail = 'admin@saladinshop.com';
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('AdminSaladin123!', salt);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    console.log(`[Seed] Admin user created: ${admin.email} (ID: ${admin.id})`);
  } else {
    console.log(`[Seed] Admin user already exists: ${adminEmail}`);
  }

  // 2. Seed Minecraft & Roblox Digital Game Products
  const products = [
    // --- MINECRAFT PRODUCTS ---
    {
      name: 'Akun Minecraft Java & Bedrock Edition',
      slug: 'akun-minecraft-java-bedrock-edition',
      description: 'OFFICIAL STORE • FULL ACCESS',
      price: 199000,
      stock: 4,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'akun',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: [
        'Email: saladin-vip01@mojangmail.com | Pass: SaladinSecure#2026_01 | Keterangan: Full Access Migration: https://account.mojang.com',
        'Email: saladin-vip02@mojangmail.com | Pass: SaladinSecure#2026_02 | Keterangan: Full Access Migration: https://account.mojang.com',
        'Email: saladin-vip03@mojangmail.com | Pass: SaladinSecure#2026_03 | Keterangan: Full Access Migration: https://account.mojang.com',
        'Email: saladin-vip04@mojangmail.com | Pass: SaladinSecure#2026_04 | Keterangan: Full Access Migration: https://account.mojang.com',
      ].join('\n'),
      imageUrl: '/images/produk1.jpg',
      isActive: true,
    },
    {
      name: 'Bundle Akun Minecraft Java + Skin Standar',
      slug: 'bundle-akun-minecraft-java-skin-standar',
      description: 'Paket bundling hemat: 1x Akun Full Access Minecraft Java Edition + 1x Custom HD Skin Standar siap pakai.',
      price: 211000,
      stock: 8,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'skins',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: 'Account: bundle-mc-9921@saladinmail.net | Pass: BundleSkin#882 | Skin Pack HD: https://saladinshop.com/dl/skin-bundle-v1.zip',
      imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Custom Skin Minecraft',
      slug: 'custom-skin-minecraft',
      description: 'Layanan pembuatan custom skin HD Minecraft sesuai request atau karakter pilihan Anda. Hasil rapi dengan 3D dual layer.',
      price: 19999,
      stock: 79,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'skins',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: 'Skin File Download: https://saladinshop.com/skins/custom-skin-hd-77812.png | Tutorial Pasang: https://saladinshop.com/guide/skins',
      imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Minecoins 3200 Minecraft Bedrock Edition',
      slug: 'minecoins-3200-minecraft-bedrock',
      description: 'Voucher digital 3200 Minecoins resmi Mojang untuk membeli skin, map, worlds, dan textures di Marketplace.',
      price: 285000,
      stock: 20,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'minecoins',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: 'Redeem Code: MNCN-3200-SLDN-9941-8821 | Redeem URL: https://minecraft.net/redeem/minecoins',
      imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Minecraft Custom Cape Migrator & Special',
      slug: 'minecraft-custom-cape-migrator',
      description: 'Kode aktivasi cape kosmetik eksklusif event untuk launcher Minecraft Java & Bedrock.',
      price: 99000,
      stock: 35,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'capes',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: 'Cape Code: MC-CAPE-SLDN-9823-XKLP | Redeem at: https://minecraft.net/redeem',
      imageUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Minecraft Realms Plus 3 Bulan Subscription',
      slug: 'minecraft-realms-plus-3-bulan',
      description: 'Token langganan Minecraft Realms Plus 90 hari untuk server pribadi hingga 10 teman + 150+ marketplace packs.',
      price: 299000,
      stock: 12,
      productType: 'digital',
      game: 'minecraft',
      subCategory1: 'realms',
      subCategory2: null,
      deliveryType: 'automatic',
      deliveryContent: 'Realms Token: REALM-PLUS-90D-8827-SLDN | Activation: Menu Minecraft -> Realms -> Extend',
      imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },

    // --- ROBLOX PRODUCTS ---
    {
      name: 'Blox Fruit — Kitsune Fruit (Physical / Stored)',
      slug: 'blox-fruit-kitsune-fruit',
      description: 'Mythical Beast Kitsune Fruit untuk game Blox Fruit Roblox. Pengiriman cepat via trade server aman.',
      price: 185000,
      stock: 15,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'blox-fruit',
      subCategory2: 'items',
      deliveryType: 'automatic',
      deliveryContent: 'Trade Server Link: https://roblox.com/games/2753915549?privateServerLinkCode=trade-kitsune-9821 | Trade Bot: SaladinBot_01',
      imageUrl: 'https://images.unsplash.com/photo-1612287233207-6f684cf0423c?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Blox Fruit — Max Level 2550 Godhuman + CDK Account',
      slug: 'blox-fruit-max-level-godhuman-cdk-account',
      description: 'Akun Roblox Blox Fruit Max Level 2550, Cursed Dual Katana (CDK), Godhuman Fighting Style, Soul Guitar, V4 Race unlocked.',
      price: 320000,
      stock: 8,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'blox-fruit',
      subCategory2: 'akun',
      deliveryType: 'automatic',
      deliveryContent: 'Username: SaladinBlox_2550 | Pass: SaladinTitan#889 | Backup Codes: 849201, 773104 | Unverified Email',
      imageUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Fish It — Mythic Poseidon Fishing Rod + 1M Coins',
      slug: 'fish-it-mythic-poseidon-rod-coins',
      description: 'Item pancingan langka Tier Mythic Poseidon Rod dengan boost 500% luck + 1.000.000 Coins untuk game Roblox Fish It.',
      price: 75000,
      stock: 30,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'fish-it',
      subCategory2: 'items',
      deliveryType: 'automatic',
      deliveryContent: 'Trade Server Link: https://roblox.com/games/fish-it?privateServerLinkCode=fish-poseidon-3312 | Gift ID: ITEM-POS-9982',
      imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Fish It — VIP Fisher Level 100 Account',
      slug: 'fish-it-vip-fisher-account',
      description: 'Akun Roblox Fish It level 100 dengan semua rod legendaris terbuka dan 5.000.000 koin saldo.',
      price: 150000,
      stock: 5,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'fish-it',
      subCategory2: 'akun',
      deliveryType: 'automatic',
      deliveryContent: 'Username: FishMaster_Saladin | Pass: OceanKing#2026 | Recovery Codes: 192837, 482910 | Clean Email',
      imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Grow a Garden 2 — Golden Sprinkler & Ancient Seeds Pack',
      slug: 'grow-a-garden-2-golden-sprinkler-pack',
      description: 'Paket perkebunan elit: Golden Auto Sprinkler + 50x Ancient Legendary Seeds untuk game Roblox Grow a Garden 2.',
      price: 65000,
      stock: 25,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'grow-a-garden-2',
      subCategory2: 'items',
      deliveryType: 'automatic',
      deliveryContent: 'Redeem Link: https://roblox.com/games/grow-a-garden?code=GARDEN-GOLDEN-8821 | Delivery Pin: 4920',
      imageUrl: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
    {
      name: 'Grow a Garden 2 — Level 100 VIP Farmer Account',
      slug: 'grow-a-garden-2-vip-farmer-account',
      description: 'Akun Roblox Grow a Garden 2 level 100, VIP Gamepass aktif, kebun max tier dengan auto-harvester.',
      price: 210000,
      stock: 5,
      productType: 'digital',
      game: 'roblox',
      subCategory1: 'grow-a-garden-2',
      subCategory2: 'akun',
      deliveryType: 'automatic',
      deliveryContent: 'Username: GreenThumb_VIP100 | Pass: GardenKing#2026 | Recovery Codes: 192837, 482910 | Clean Email',
      imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&auto=format&fit=crop&q=80',
      isActive: true,
    },
  ];

  for (let i = 0; i < products.length; i++) {
    const item = { ...products[i], sortOrder: i + 1 };
    const existing = await prisma.product.findUnique({
      where: { slug: item.slug },
    });
    if (!existing) {
      await prisma.product.create({ data: item });
      console.log(`[Seed] Created product: ${item.name} (Urutan: #${i + 1})`);
    } else {
      await prisma.product.update({
        where: { slug: item.slug },
        data: item,
      });
      console.log(`[Seed] Updated product: ${item.name} (Urutan: #${i + 1})`);
    }
  }

  console.log('--- SALADINSHOP Database Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
