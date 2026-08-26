'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Plus,
  Edit2,
  Power,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Trash2,
  Percent,
  Zap,
  Key,
  Shield,
  FileText,
  Mail,
  Lock,
  Info,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MoveVertical,
  ExternalLink,
} from 'lucide-react';
import { formatIDR } from '@/lib/utils';
import { parseDeliveryContent, DeliveryCategory } from '@/lib/delivery-parser';

interface AdminDeliveryItem {
  id: string;
  email: string;
  password: string;
  code: string;
  robloxUsername: string;
  privateServerUrl: string;
  keterangan: string;
}

function parseDeliveryContentToAdminItems(
  raw: string,
  category: DeliveryCategory
): AdminDeliveryItem[] {
  if (!raw || !raw.trim()) {
    return [
      {
        id: `item-${Date.now()}-0`,
        email: '',
        password: '',
        code: '',
        robloxUsername: 'SaladinRoblox_Official',
        privateServerUrl: '',
        keterangan: '',
      },
    ];
  }
  const parsed = parseDeliveryContent(raw, category);
  if (parsed.length === 0) {
    return [
      {
        id: `item-${Date.now()}-0`,
        email: '',
        password: '',
        code: '',
        robloxUsername: 'SaladinRoblox_Official',
        privateServerUrl: '',
        keterangan: '',
      },
    ];
  }

  return parsed.map((p, idx) => ({
    id: `item-${Date.now()}-${idx}`,
    email: p.email || '',
    password: p.password || '',
    code: p.code || '',
    robloxUsername: p.robloxUsername || 'SaladinRoblox_Official',
    privateServerUrl: p.privateServerUrl || '',
    keterangan: p.notes || '',
  }));
}

function serializeAdminItemsToString(
  items: AdminDeliveryItem[],
  category: DeliveryCategory
): string {
  return items
    .map((item) => {
      const parts: string[] = [];
      if (category === 'account') {
        if (item.email.trim()) parts.push(`Email: ${item.email.trim()}`);
        if (item.password.trim()) parts.push(`Pass: ${item.password.trim()}`);
        if (item.keterangan.trim()) parts.push(`Catatan: ${item.keterangan.trim()}`);
      } else if (category === 'redeem_code') {
        if (item.code.trim()) parts.push(`Kode: ${item.code.trim()}`);
        if (item.keterangan.trim()) parts.push(`Catatan: ${item.keterangan.trim()}`);
      } else if (category === 'roblox') {
        if (item.robloxUsername.trim()) parts.push(`Username Roblox Admin: ${item.robloxUsername.trim()}`);
        if (item.privateServerUrl.trim()) parts.push(`Link World Private: ${item.privateServerUrl.trim()}`);
        if (item.keterangan.trim()) parts.push(`Catatan: ${item.keterangan.trim()}`);
      }
      return parts.join(' | ');
    })
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGameTab, setSelectedGameTab] = useState<'all' | 'minecraft' | 'roblox'>('all');
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Delete State
  const [productToDelete, setProductToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState<number>(199000);
  const [discountPercent, setDiscountPercent] = useState<number>(30);
  const [stock, setStock] = useState<number>(4);
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [serviceTag, setServiceTag] = useState<'proses-instant' | 'pembuatan-cepat'>('proses-instant');
  const [soldCount, setSoldCount] = useState<string>('19rb+ Terjual');
  const [game, setGame] = useState<'minecraft' | 'roblox'>('minecraft');
  const [subCategory1, setSubCategory1] = useState('akun');
  const [subCategory2, setSubCategory2] = useState<string>('items');
  const [deliveryType, setDeliveryType] = useState<'automatic' | 'manual'>('automatic');
  const [deliveryCategory, setDeliveryCategory] = useState<DeliveryCategory>('account');
  const [deliveryItems, setDeliveryItems] = useState<AdminDeliveryItem[]>([
    {
      id: '1',
      email: '',
      password: '',
      code: '',
      robloxUsername: 'SaladinRoblox_Official',
      privateServerUrl: '',
      keterangan: '',
    },
  ]);
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetDiscounts = [0, 10, 20, 30, 40, 50, 60, 70];

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products');
      const json = await res.json();
      if (json.success) {
        setProducts(json.data);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setSlug('');
    setPrice(199000);
    setDiscountPercent(30);
    setStock(1);
    setSortOrder(products.length + 1);
    setServiceTag('proses-instant');
    setSoldCount('19rb+ Terjual');
    setGame('minecraft');
    setSubCategory1('akun');
    setSubCategory2('item');
    setDeliveryType('automatic');
    setDeliveryCategory('account');
    setDeliveryItems([
      {
        id: `item-${Date.now()}-0`,
        email: '',
        password: '',
        code: '',
        robloxUsername: 'SaladinRoblox_Official',
        privateServerUrl: '',
        keterangan: 'Full Access Migration di https://account.mojang.com',
      },
    ]);
    setImageUrl('');
    setIsActive(true);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (prod: any) => {
    setEditingProduct(prod);
    setName(prod.name);
    setSlug(prod.slug);
    setPrice(prod.price);
    setDiscountPercent(prod.discountPercent !== undefined && prod.discountPercent !== null ? prod.discountPercent : 30);
    setStock(prod.stock);
    setSortOrder(prod.sortOrder ?? 1);
    setServiceTag(prod.serviceTag === 'pembuatan-cepat' ? 'pembuatan-cepat' : 'proses-instant');
    setSoldCount(prod.soldCount || '19rb+ Terjual');
    setGame(prod.game);
    setSubCategory1(prod.subCategory1);
    setSubCategory2(prod.subCategory2 === 'items' ? 'item' : (prod.subCategory2 || 'item'));
    setDeliveryType(prod.deliveryType || 'automatic');

    let cat: DeliveryCategory = prod.deliveryCategory;
    if (!cat) {
      if (prod.game === 'roblox' || /roblox/i.test(prod.deliveryContent || '')) {
        cat = 'roblox';
      } else if (
        /kode|redeem|voucher|minecoin/i.test(prod.deliveryContent || '') ||
        /minecoin/i.test(prod.subCategory1 || '')
      ) {
        cat = 'redeem_code';
      } else {
        cat = 'account';
      }
    }
    setDeliveryCategory(cat);
    setDeliveryItems(parseDeliveryContentToAdminItems(prod.deliveryContent || '', cat));
    setImageUrl(prod.imageUrl || '');
    setIsActive(prod.isActive);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingProduct) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError('Ukuran gambar maksimal 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        fetchProducts();
      }
    } catch (err) {
      console.error('Toggle status error:', err);
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/products/${productToDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProductToDelete(null);
        fetchProducts();
      } else {
        const json = await res.json();
        alert(json.message || 'Gagal menghapus produk');
      }
    } catch (err) {
      console.error('Delete product error:', err);
      alert('Terjadi kesalahan saat menghapus produk');
    } finally {
      setDeleting(false);
    }
  };

  // Reorder product up / down
  const handleMoveOrder = async (id: string, direction: 'up' | 'down') => {
    setReorderingId(id);
    try {
      const res = await fetch('/api/admin/products/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, direction }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setProducts(json.data);
        } else {
          fetchProducts();
        }
      }
    } catch (err) {
      console.error('Reorder error:', err);
    } finally {
      setReorderingId(null);
    }
  };

  // Set explicit sort order
  const handleQuickSortOrderChange = async (id: string, newOrder: number) => {
    try {
      const res = await fetch('/api/admin/products/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, sort_order: newOrder }),
      });
      if (res.ok) {
        fetchProducts();
      }
    } catch (err) {
      console.error('Update order error:', err);
    }
  };

  const originalPriceCalculated =
    discountPercent > 0
      ? Math.round((price / Math.max(1, 100 - discountPercent)) * 100)
      : price;

  // Account item handlers
  // Delivery item handlers
  const handleAddDeliveryItem = () => {
    const newId = `item-${Date.now()}-${deliveryItems.length}`;
    const defaultNote =
      deliveryCategory === 'account'
        ? 'Full Access Migration di https://account.mojang.com'
        : deliveryCategory === 'redeem_code'
        ? 'Tukarkan di https://minecraft.net/redeem/minecoins'
        : 'Silakan add username Roblox di atas lalu join private server untuk trade.';

    const updated = [
      ...deliveryItems,
      {
        id: newId,
        email: '',
        password: '',
        code: '',
        robloxUsername: 'SaladinRoblox_Official',
        privateServerUrl:
          deliveryCategory === 'roblox'
            ? 'https://www.roblox.com/games/2753915549/BloxFruits?privateServerLinkCode=88192019482910'
            : '',
        keterangan: defaultNote,
      },
    ];
    setDeliveryItems(updated);
    setStock(updated.length);
  };

  const handleRemoveDeliveryItem = (id: string) => {
    if (deliveryItems.length <= 1) return;
    const updated = deliveryItems.filter((a) => a.id !== id);
    setDeliveryItems(updated);
    setStock(updated.length);
  };

  const handleDeliveryItemChange = (
    id: string,
    field: keyof AdminDeliveryItem,
    value: string
  ) => {
    setDeliveryItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError('');

    const serializedDelivery = serializeAdminItemsToString(deliveryItems, deliveryCategory);

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      description: 'OFFICIAL STORE',
      price: Number(price),
      discount_percent: Number(discountPercent),
      original_price: Number(originalPriceCalculated),
      stock: Number(stock),
      sort_order: Number(sortOrder),
      service_tag: serviceTag,
      sold_count: soldCount.trim() || '19rb+ Terjual',
      product_type: 'digital',
      game,
      sub_category_1: subCategory1,
      sub_category_2: game === 'roblox' ? subCategory2 : null,
      delivery_type: deliveryType,
      delivery_category: deliveryCategory,
      delivery_content: serializedDelivery,
      image_url: imageUrl.trim(),
      is_active: isActive,
    };

    try {
      let res;
      if (editingProduct) {
        res = await fetch(`/api/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        setFormError(json.message || 'Gagal menyimpan data produk');
        setFormSubmitting(false);
        return;
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch {
      setFormError('Terjadi kesalahan jaringan');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      p.game.toLowerCase().includes(search.toLowerCase());

    const matchGame = selectedGameTab === 'all' || p.game === selectedGameTab;

    return matchSearch && matchGame;
  });

  const mcCount = products.filter((p) => p.game === 'minecraft').length;
  const rbCount = products.filter((p) => p.game === 'roblox').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Product Catalog Management</h1>
          <p className="text-xs text-gray-400 mt-1">
            Kelola urutan tampilan produk di beranda customer (▲ / ▼), diskon harga, stok, dan akun digital.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Produk Baru</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Game Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface rounded-xl border border-surface-border w-fit">
          <button
            type="button"
            onClick={() => setSelectedGameTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedGameTab === 'all'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Semua Game ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedGameTab('minecraft')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedGameTab === 'minecraft'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Minecraft ({mcCount})
          </button>
          <button
            type="button"
            onClick={() => setSelectedGameTab('roblox')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedGameTab === 'roblox'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Roblox ({rbCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, slug, game..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-surface-border text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="rounded-2xl bg-surface border border-surface-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-hover/50 text-gray-400 uppercase font-semibold border-b border-surface-border">
              <tr>
                <th className="px-4 py-3.5 text-center">Urutan</th>
                <th className="px-5 py-3.5">Produk</th>
                <th className="px-4 py-3.5">Game / Kategori</th>
                <th className="px-4 py-3.5">Harga &amp; Diskon</th>
                <th className="px-4 py-3.5">Stok</th>
                <th className="px-4 py-3.5">Data Akun / Delivery</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-gray-300">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-400 mb-2" />
                    Memuat daftar produk...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-500">
                    Tidak ada produk yang sesuai dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod, index) => {
                  const accountsCount = prod.deliveryContent
                    ? prod.deliveryContent.split(/\r?\n/).filter(Boolean).length
                    : 0;
                  const isFirst = index === 0;
                  const isLast = index === filteredProducts.length - 1;

                  return (
                    <tr key={prod.id} className="hover:bg-surface-hover/30 transition-colors">
                      {/* Urutan / Reorder Controls */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={isFirst || reorderingId === prod.id}
                            onClick={() => handleMoveOrder(prod.id, 'up')}
                            className="p-1 rounded bg-surface hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-300 disabled:opacity-20 transition-all border border-surface-border"
                            title="Pindah ke Atas (Prioritas Tampil Lebih Awal)"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <span className="w-6 text-center font-mono font-black text-emerald-400 text-xs">
                            #{index + 1}
                          </span>

                          <button
                            type="button"
                            disabled={isLast || reorderingId === prod.id}
                            onClick={() => handleMoveOrder(prod.id, 'down')}
                            className="p-1 rounded bg-surface hover:bg-emerald-600/30 text-gray-400 hover:text-emerald-300 disabled:opacity-20 transition-all border border-surface-border"
                            title="Pindah ke Bawah"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-lg overflow-hidden bg-neutral-900 border border-surface-border flex-shrink-0 flex items-center justify-center">
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-gray-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white line-clamp-1">{prod.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-gray-500">{prod.slug}</span>
                              <span className="text-gray-600">•</span>
                              <span className="text-[10px] text-amber-400 font-bold">{prod.soldCount || '19rb+ Terjual'}</span>
                              <span className="text-gray-600">•</span>
                              {prod.serviceTag === 'pembuatan-cepat' ? (
                                <span className="text-[10px] text-purple-300 font-semibold flex items-center gap-0.5">
                                  🚀 Pembuatan Cepat
                                </span>
                              ) : (
                                <span className="text-[10px] text-cyan-300 font-semibold flex items-center gap-0.5">
                                  ⚡ Proses Instant
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="capitalize font-semibold text-gray-300">{prod.game}</span>
                        <span className="text-[10px] text-gray-500 block uppercase font-mono">
                          {prod.subCategory1 || '-'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-emerald-400">
                          {formatIDR(prod.price)}
                        </div>
                        {prod.discountPercent ? (
                          <div className="text-[10px] text-rose-400 font-bold">
                            Diskon {prod.discountPercent}%
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${
                            prod.stock > 0
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {prod.stock > 0 ? `${prod.stock} Unit` : 'HABIS'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-[11px] font-mono text-cyan-300 flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                          <span>{accountsCount > 0 ? `${accountsCount} Akun Siap Kirim` : 'Tersedia'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => handleToggleActive(prod.id, prod.isActive)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            prod.isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'
                          }`}
                        >
                          {prod.isActive ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(prod)}
                            className="p-1.5 rounded-lg bg-surface-hover hover:bg-surface border border-surface-border text-gray-300 hover:text-white transition-all"
                            title="Edit Produk & Data Akun"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setProductToDelete(prod)}
                            className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-400 hover:text-rose-200 transition-all"
                            title="Hapus Produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Product */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="max-w-3xl w-full max-h-[92vh] sm:max-h-[88vh] rounded-2xl bg-[#181818] border border-neutral-800 shadow-2xl flex flex-col text-xs overflow-hidden">
            {/* 1. Sticky Modal Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-neutral-800 bg-[#202020] flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white tracking-tight">
                    {editingProduct ? 'Edit Data Produk & Akun' : 'Tambah Produk Baru'}
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Lengkapi informasi produk, klasifikasi game, harga diskon, dan stok akun delivery otomatis.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-gray-400 hover:text-white border border-neutral-700/60 transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form with Scrollable Body and Sticky Action Footer */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {formError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 flex items-center gap-2.5 text-xs animate-in slide-in-from-top-1">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
              {/* 1. Nama, Slug, dan Urutan Tampil */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-gray-400 mb-1 font-semibold">Nama Produk *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Contoh: Akun Minecraft Java"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-hover border border-surface-border text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-gray-400 mb-1 font-semibold">Slug URL *</label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="akun-minecraft-java"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-hover border border-surface-border text-gray-300 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-emerald-400 mb-1 font-bold flex items-center gap-1">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>Urutan Tampil (No. #) *</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    placeholder="1"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-surface-hover border border-emerald-500/40 text-emerald-300 font-mono font-bold focus:outline-none focus:border-emerald-400"
                    title="Angka 1 akan tampil paling awal / paling kiri di beranda"
                  />
                </div>
              </div>

              {/* 2. Upload Gambar Produk */}
              <div className="space-y-2">
                <label className="block text-gray-400 font-semibold">Upload Gambar Produk *</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />

                <div className="flex items-center gap-4">
                  {imageUrl ? (
                    <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-md group/preview">
                      <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center text-rose-400 opacity-0 group-hover/preview:opacity-100 transition-opacity"
                        title="Hapus Gambar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-6 py-4 rounded-2xl border-2 border-dashed border-surface-border hover:border-emerald-500 bg-surface-hover/50 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-emerald-400 transition-all cursor-pointer"
                    >
                      <Upload className="w-6 h-6 text-emerald-400" />
                      <span className="font-bold text-xs">Pilih / Upload Gambar dari Device</span>
                      <span className="text-[10px] text-gray-500">PNG, JPG, WEBP (Max 5MB)</span>
                    </button>
                  )}

                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-surface-hover hover:bg-surface text-gray-300 text-xs font-bold border border-surface-border flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Ganti Gambar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Fitur Diskon & Harga Jual */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/30 via-surface-hover/50 to-surface-hover/30 border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-rose-400" />
                    <span>Fitur Diskon &amp; Harga Promo</span>
                  </span>
                  {discountPercent > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-extrabold">
                      Diskon {discountPercent}% Aktif
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 mb-1 font-semibold">
                      Harga Jual / Promo (IDR) *
                    </label>
                    <input
                      type="number"
                      required
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-surface-border text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono font-bold text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 mb-1 font-semibold">
                      Persentase Diskon (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={95}
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-surface-border text-rose-400 focus:outline-none focus:border-rose-500 font-mono font-bold text-sm"
                    />
                  </div>
                </div>

                {/* Preset Discount Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-400 font-medium mr-1">Pilih Cepat Diskon:</span>
                  {presetDiscounts.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscountPercent(pct)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border ${
                        discountPercent === pct
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-surface hover:bg-surface-hover text-gray-400 border-surface-border'
                      }`}
                    >
                      {pct === 0 ? 'Tanpa Diskon' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {discountPercent > 0 && (
                  <div className="p-3 rounded-xl bg-black/40 border border-surface-border flex items-center justify-between text-[11px]">
                    <div>
                      <span className="text-gray-400 block">Harga Coret (Sebelum Diskon):</span>
                      <span className="text-gray-300 font-mono line-through font-bold">
                        {formatIDR(originalPriceCalculated)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-400 block">Pembeli Menghemat:</span>
                      <span className="text-rose-400 font-mono font-black">
                        {formatIDR(originalPriceCalculated - price)} (-{discountPercent}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Game & Klasifikasi */}
              <div className="p-4 rounded-2xl bg-surface-hover/40 border border-surface-border space-y-3">
                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">
                  Klasifikasi Game &amp; Stok
                </span>

                <div className={`grid grid-cols-1 ${game === 'roblox' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
                  <div>
                    <label className="block text-gray-400 mb-1 font-medium">Game *</label>
                    <select
                      value={game}
                      onChange={(e) => {
                        const newGame = e.target.value as any;
                        setGame(newGame);
                        if (newGame === 'minecraft') {
                          setSubCategory1('akun');
                        } else {
                          setSubCategory1('blox-fruit');
                          setSubCategory2('item');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-border text-white focus:outline-none focus:border-emerald-500 font-bold"
                    >
                      <option value="minecraft">Minecraft</option>
                      <option value="roblox">Roblox</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1 font-medium">Kategori Game *</label>
                    {game === 'minecraft' ? (
                      <select
                        value={subCategory1}
                        onChange={(e) => setSubCategory1(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-border text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="akun">Akun</option>
                        <option value="skins">Skins</option>
                        <option value="capes">Capes</option>
                        <option value="realms">Realms</option>
                        <option value="minecoins">Minecoins</option>
                      </select>
                    ) : (
                      <select
                        value={subCategory1}
                        onChange={(e) => setSubCategory1(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-border text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="blox-fruit">Blox Fruit</option>
                        <option value="fish-it">Fish it</option>
                        <option value="grow-a-garden-2">Grow a Garden 2</option>
                      </select>
                    )}
                  </div>

                  {game === 'roblox' && (
                    <div>
                      <label className="block text-gray-400 mb-1 font-medium">Sub Kategori *</label>
                      <select
                        value={subCategory2 || 'item'}
                        onChange={(e) => setSubCategory2(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface border border-surface-border text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="akun">Akun</option>
                        <option value="item">Item</option>
                        <option value="joki">Joki</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Stok Unit *</label>
                    <input
                      type="number"
                      required
                      value={stock}
                      onChange={(e) => setStock(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl bg-surface border border-surface-border text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Fitur Tag Layanan (Proses Instant / Pembuatan Cepat) & Custom Terjual */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/20 via-surface-hover/50 to-surface-hover/30 border border-cyan-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>Tag Layanan &amp; Label Terjual (Tampilan Customer)</span>
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">
                    Menyesuaikan badge &amp; info di katalog
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pilihan Tag Layanan */}
                  <div className="space-y-2">
                    <label className="block text-gray-300 font-semibold text-xs">Pilih Tag Layanan *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setServiceTag('proses-instant')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 text-center transition-all ${
                          serviceTag === 'proses-instant'
                            ? 'bg-cyan-950/70 border-cyan-400 text-white shadow-lg ring-2 ring-cyan-500/40'
                            : 'bg-surface hover:bg-surface-hover border-surface-border text-gray-400'
                        }`}
                      >
                        <img
                          src="/images/tag-proses-instant.png"
                          alt="Proses Instant"
                          className="h-4 w-auto object-contain"
                        />
                        <span className="text-[11px] font-bold">Proses Instant</span>
                        <span className="text-[9px] text-gray-400">Siap kirim otomatis</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setServiceTag('pembuatan-cepat')}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 text-center transition-all ${
                          serviceTag === 'pembuatan-cepat'
                            ? 'bg-purple-950/70 border-purple-400 text-white shadow-lg ring-2 ring-purple-500/40'
                            : 'bg-surface hover:bg-surface-hover border-surface-border text-gray-400'
                        }`}
                      >
                        <img
                          src="/images/tag-pembuatan-cepat.png"
                          alt="Pembuatan Cepat"
                          className="h-4 w-auto object-contain"
                        />
                        <span className="text-[11px] font-bold">Pembuatan Cepat</span>
                        <span className="text-[9px] text-gray-400">Custom skins / jasa</span>
                      </button>
                    </div>
                  </div>

                  {/* Input Label Terjual */}
                  <div className="space-y-2">
                    <label className="block text-gray-300 font-semibold text-xs">
                      Label Jumlah Terjual *
                    </label>
                    <input
                      type="text"
                      required
                      value={soldCount}
                      onChange={(e) => setSoldCount(e.target.value)}
                      placeholder="Contoh: 19rb+ Terjual"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-surface-border text-amber-300 font-bold text-xs focus:outline-none focus:border-amber-400"
                    />

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-gray-400">Preset Cepat:</span>
                      {['19rb+ Terjual', '1.5rb+ Terjual', '500+ Terjual', '100+ Terjual', '25 Terjual'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setSoldCount(preset)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                            soldCount === preset
                              ? 'bg-amber-500 text-black border-amber-400 font-black'
                              : 'bg-surface hover:bg-surface-hover text-gray-400 border-surface-border'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. STRUCTURED DIGITAL DELIVERY CREDENTIALS BY 3 CATEGORIES */}
              <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-400" />
                    <label className="block text-emerald-300 font-bold text-xs uppercase tracking-wider">
                      Format Pengiriman Digital ({deliveryItems.length} Unit Terdaftar)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddDeliveryItem}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Unit</span>
                    </button>

                    {deliveryItems.length !== stock && (
                      <button
                        type="button"
                        onClick={() => setStock(deliveryItems.length)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase transition-all"
                        title="Sesuaikan stok dengan jumlah data pengiriman di bawah"
                      >
                        ⚡ Samakan Stok ({deliveryItems.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* 3 Categories Selection Tabs */}
                <div className="space-y-2">
                  <label className="block text-gray-300 font-semibold text-xs">Pilih Kategori Delivery *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDeliveryCategory('account')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-center transition-all ${
                        deliveryCategory === 'account'
                          ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-lg ring-2 ring-emerald-500/40'
                          : 'bg-surface hover:bg-surface-hover border-surface-border text-gray-400'
                      }`}
                    >
                      <span className="text-base">🎮</span>
                      <span className="text-xs font-bold">Kategori Akun</span>
                      <span className="text-[9px] text-gray-400">Email, Pass, Catatan</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryCategory('redeem_code')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-center transition-all ${
                        deliveryCategory === 'redeem_code'
                          ? 'bg-amber-950/80 border-amber-400 text-white shadow-lg ring-2 ring-amber-500/40'
                          : 'bg-surface hover:bg-surface-hover border-surface-border text-gray-400'
                      }`}
                    >
                      <span className="text-base">🎟️</span>
                      <span className="text-xs font-bold">Kategori Kode Redeem</span>
                      <span className="text-[9px] text-gray-400">Kode, Catatan / Link</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeliveryCategory('roblox')}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-center transition-all ${
                        deliveryCategory === 'roblox'
                          ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-lg ring-2 ring-cyan-500/40'
                          : 'bg-surface hover:bg-surface-hover border-surface-border text-gray-400'
                      }`}
                    >
                      <span className="text-base">🧱</span>
                      <span className="text-xs font-bold">Kategori Roblox</span>
                      <span className="text-[9px] text-gray-400">Add User, Private Link, Note</span>
                    </button>
                  </div>
                </div>

                {/* Delivery Items List */}
                <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                  {deliveryItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-black/60 border border-emerald-500/30 space-y-2.5 relative group"
                    >
                      {/* Box Header */}
                      <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            {deliveryCategory === 'account'
                              ? `Data Akun #${index + 1}`
                              : deliveryCategory === 'redeem_code'
                              ? `Data Kode Redeem #${index + 1}`
                              : `Data Item Roblox #${index + 1}`}
                          </span>
                        </span>

                        {deliveryItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDeliveryItem(item.id)}
                            className="text-rose-400 hover:text-rose-300 text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 border border-rose-500/30 transition-all"
                            title="Hapus Unit Ini"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>

                      {/* FIELD RENDERING: CATEGORY 1 (ACCOUNT) */}
                      {deliveryCategory === 'account' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                              <Mail className="w-3 h-3 text-cyan-400" />
                              <span>1. Email / Username *</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={item.email}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'email', e.target.value)}
                              placeholder="user@mojang.com"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                              <Lock className="w-3 h-3 text-amber-400" />
                              <span>2. Password *</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={item.password}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'password', e.target.value)}
                              placeholder="SecretPass#123"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                              <Info className="w-3 h-3 text-emerald-400" />
                              <span>3. Catatan / Panduan</span>
                            </label>
                            <input
                              type="text"
                              value={item.keterangan}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'keterangan', e.target.value)}
                              placeholder="Full Access Migration: mojang.com"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-gray-300 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* FIELD RENDERING: CATEGORY 2 (REDEEM CODE) */}
                      {deliveryCategory === 'redeem_code' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                              <Key className="w-3 h-3 text-amber-400" />
                              <span>1. Kode Redeem / Lisensi *</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={item.code}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'code', e.target.value)}
                              placeholder="MNCN-310-SLDN-8812-9912"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-amber-500/50 text-amber-300 text-xs font-mono font-bold focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                              <Info className="w-3 h-3 text-cyan-400" />
                              <span>2. Catatan / Link Penukaran</span>
                            </label>
                            <input
                              type="text"
                              value={item.keterangan}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'keterangan', e.target.value)}
                              placeholder="Tukarkan di https://minecraft.net/redeem/minecoins"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-gray-300 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* FIELD RENDERING: CATEGORY 3 (ROBLOX) */}
                      {deliveryCategory === 'roblox' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                              <Key className="w-3 h-3 text-amber-400" />
                              <span>1. Username Roblox Admin *</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={item.robloxUsername}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'robloxUsername', e.target.value)}
                              placeholder="SaladinRoblox_Official"
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-amber-500/50 text-amber-300 text-xs font-mono font-bold focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-sky-400 font-bold flex items-center gap-1">
                              <ExternalLink className="w-3 h-3 text-sky-400" />
                              <span>2. Link World Private Server *</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={item.privateServerUrl}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'privateServerUrl', e.target.value)}
                              placeholder="https://www.roblox.com/games/2753915549/BloxFruits?privateServerLinkCode=..."
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-cyan-500/50 text-sky-300 text-xs font-mono focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                              <Info className="w-3 h-3 text-emerald-400" />
                              <span>3. Catatan / Petunjuk Trade</span>
                            </label>
                            <input
                              type="text"
                              value={item.keterangan}
                              onChange={(e) => handleDeliveryItemChange(item.id, 'keterangan', e.target.value)}
                              placeholder="Silakan add username Roblox di atas lalu join ke server."
                              className="w-full px-3 py-2 rounded-lg bg-surface border border-surface-border text-gray-300 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                  💡 <strong>Sistem Otomatis:</strong> Setiap unit pengiriman di atas akan dikirimkan satu per satu secara berurutan (*FIFO*) ke masing-masing pembeli yang pesanannya diverifikasi.
                </p>
              </div>

              </div>

              {/* 6. Sticky Action Footer */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-neutral-800 bg-[#202020] flex flex-col sm:flex-row items-center justify-between gap-3 z-10">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 bg-neutral-900 border-neutral-700"
                  />
                  <span className="text-gray-300 font-semibold text-xs">Produk Aktif untuk Dijual</span>
                </label>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/80 text-gray-300 font-semibold transition-all hover:text-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {formSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{formSubmitting ? 'Menyimpan...' : 'Simpan Produk'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Produk */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-surface border border-rose-500/30 shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Hapus Produk?</h3>
                <p className="text-[11px] text-gray-400">Tindakan ini permanen dan akan menghapus produk dari katalog.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-black/50 border border-surface-border flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 border border-surface-border flex-shrink-0 flex items-center justify-center">
                {productToDelete.imageUrl ? (
                  <img src={productToDelete.imageUrl} alt={productToDelete.name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div>
                <div className="font-bold text-white line-clamp-1">{productToDelete.name}</div>
                <div className="text-[10px] text-gray-400 font-mono">{productToDelete.slug}</div>
                <div className="text-[10px] text-emerald-400 font-bold font-mono mt-0.5">{formatIDR(productToDelete.price)}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-surface-border">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-surface-border text-gray-300 font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteProduct}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/50 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Produk</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
