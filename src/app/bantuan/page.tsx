'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  MessageCircle,
  FileText,
  X,
  HelpCircle,
} from 'lucide-react';

export default function BantuanPage() {
  const [invoice, setInvoice] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [productName, setProductName] = useState('');
  const [complaintReason, setComplaintReason] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const productOptions = [
    'Akun Minecraft Java & Bedrock Edition',
    'Minecraft Realms Plus 30 Hari',
    'Custom Skin HD Minecraft Eksklusif',
    'Minecoins Minecraft 1720 Coins',
    'Akun Roblox Robux Murah',
    'Lainnya / Pertanyaan Umum',
  ];

  const complaintReasons = [
    'Akun tidak bisa login / Password salah',
    'Produk belum diterima setelah transaksi',
    'Akun terkena banned / suspend / lock',
    'Email tidak bisa diganti / kendala verifikasi',
    'Kendala akses Multiplayer / Server game',
    'Lainnya',
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Ukuran file maksimal 5MB');
        return;
      }
      setSelectedFile(file);
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!invoice.trim()) {
      setErrorMessage('Nomor invoice wajib diisi');
      return;
    }
    if (!whatsapp.trim() || whatsapp.trim().length < 8) {
      setErrorMessage('Nomor WhatsApp / HP valid wajib diisi');
      return;
    }
    if (!productName) {
      setErrorMessage('Silakan pilih nama produk');
      return;
    }
    if (!complaintReason) {
      setErrorMessage('Silakan pilih alasan komplain');
      return;
    }

    setLoading(true);

    // Simulate sending complaint
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 800);
  };

  const waSupportUrl = `https://wa.me/6281234567890?text=${encodeURIComponent(
    `Halo CS SALADINSHOP, saya ingin menindaklanjuti tiket komplain:\nInvoice: ${invoice}\nProduk: ${productName}\nAlasan: ${complaintReason}\nKeterangan: ${description}`
  )}`;

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-none bg-[#181818] text-[#38bdf8] border border-cyan-900/60 text-xs font-bold shadow-sm">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>SALADIN SERVICE &amp; BANTUAN</span>
          </div>
          <h1 className="minecraft-font-folder text-2xl sm:text-3xl text-white tracking-wide font-normal">
            PUSAT BANTUAN &amp; KOMPLAIN
          </h1>
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            Ada kendala dengan akun atau pesanan Anda? Kirim tiket bantuan di bawah ini atau hubungi Customer Service kami.
          </p>
        </div>

        {submitted ? (
          /* Success Card */
          <div className="rounded-none bg-[#181818] text-white border border-neutral-700 shadow-2xl p-8 sm:p-10 text-center space-y-5 animate-fadeIn">
            <div className="w-16 h-16 rounded-none bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="minecraft-font-folder text-xl text-white">
                TIKET KOMPLAIN TERKIRIM
              </h2>
              <p className="text-xs text-neutral-300 leading-relaxed max-w-sm mx-auto">
                Laporan Anda untuk Invoice <strong className="text-white font-mono">{invoice}</strong> telah kami terima. Tim CS kami akan menghubungi Anda melalui WhatsApp dalam 15-30 menit.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <MessageCircle className="w-4 h-4" />
                <span>FOLLOW-UP VIA WHATSAPP</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setInvoice('');
                  setWhatsapp('');
                  setDescription('');
                  setSelectedFile(null);
                }}
                className="w-full py-2.5 rounded-none text-xs font-bold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800"
              >
                Kirim Laporan Lain
              </button>
            </div>
          </div>
        ) : (
          /* Complaint Form */
          <div className="rounded-none bg-[#181818] border border-neutral-700/80 shadow-2xl p-6 sm:p-8 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Nomor Invoice / Kode Pesanan *
                </label>
                <input
                  type="text"
                  required
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value.toUpperCase())}
                  placeholder="Contoh: ORD-X7F9K2Q8"
                  className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723] uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Nomor WhatsApp Pembeli *
                </label>
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="08123456789"
                  className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Nama Produk *
                </label>
                <select
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white focus:outline-none focus:border-[#367723]"
                >
                  <option value="" disabled>Pilih Produk yang Dibeli</option>
                  {productOptions.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#181818] text-white">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Alasan Komplain *
                </label>
                <select
                  required
                  value={complaintReason}
                  onChange={(e) => setComplaintReason(e.target.value)}
                  className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white focus:outline-none focus:border-[#367723]"
                >
                  <option value="" disabled>Pilih Alasan Kendala</option>
                  {complaintReasons.map((r) => (
                    <option key={r} value={r} className="bg-[#181818] text-white">
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Keterangan Kendala (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan detail kendala yang dialami secara singkat..."
                  className="w-full px-4 py-3 rounded-none bg-[#111111] border border-neutral-700 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#367723]"
                />
              </div>

              {/* Upload Screenshot */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 uppercase tracking-wider">
                  Upload Bukti Screenshot (Opsional)
                </label>
                <label className="border-2 border-dashed border-neutral-700 hover:border-[#367723] rounded-none p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#111111]">
                  <UploadCloud className="w-6 h-6 text-neutral-400 mb-1" />
                  <span className="text-xs font-bold text-neutral-300">
                    {selectedFile ? selectedFile.name : 'Pilih File Screenshot (Maks 5MB)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-none bg-rose-950/60 border border-rose-600/50 flex items-center gap-2.5 text-xs text-rose-300 font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 uppercase tracking-wider shadow-lg disabled:opacity-50 select-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>MENGIRIM TIKET...</span>
                  </>
                ) : (
                  <span>KIRIM TIKET BANTUAN</span>
                )}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
