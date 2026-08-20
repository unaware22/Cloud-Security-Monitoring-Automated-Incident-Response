import { GameConfig } from './types';

export const GAME_CATEGORIES: GameConfig[] = [
  {
    id: 'minecraft',
    name: 'Minecraft',
    accent: 'emerald',
    themeColor: '#10b981',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    subcategories: [
      { id: 'all', name: 'Semua' },
      { id: 'akun', name: 'Akun' },
      { id: 'skins', name: 'Skins' },
      { id: 'capes', name: 'Capes' },
      { id: 'realms', name: 'Realms' },
      { id: 'minecoins', name: 'Minecoins' },
    ],
  },
  {
    id: 'roblox',
    name: 'Roblox',
    accent: 'rose',
    themeColor: '#ef4444',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    subcategories: [
      {
        id: 'all',
        name: 'Semua',
        childSubcategories: [{ id: 'all', name: 'Semua' }],
      },
      {
        id: 'fish-it',
        name: 'Fish It',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' },
        ],
      },
      {
        id: 'grow-a-garden-2',
        name: 'Grow a Garden 2',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' },
        ],
      },
      {
        id: 'blox-fruit',
        name: 'Blox Fruit',
        childSubcategories: [
          { id: 'all', name: 'Semua' },
          { id: 'akun', name: 'Akun' },
          { id: 'items', name: 'Items' },
        ],
      },
    ],
  },
];

export function getGameConfig(gameId: string): GameConfig | undefined {
  return GAME_CATEGORIES.find((g) => g.id === gameId);
}
