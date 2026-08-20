'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  ChevronDown,
  MessageCircle,
} from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_LIST: FAQItem[] = [
  {
    question: 'Bagaimana cara menerima data akun setelah melakukan pembayaran?',
    answer:
      'Setelah pembayaran Anda berhasil (atau disahkan oleh Admin), data akun digital berupa Email & Password akun Minecraft/Roblox serta panduan migrasi akan langsung tampil seketika di layar Status Pesanan dan instruksi pembayaran Anda, tanpa perlu menunggu lama.',
  },
  {
    question: 'Apakah akun game yang dibeli di SALADINSHOP bergaransi?',
    answer:
      'Ya! Semua akun resmi bergaransi 100% Full Access. Anda memiliki hak akses penuh untuk mengganti email utama, password, skin, dan gamertag/nickname sesuai dengan panduan keamanan yang kami sediakan.',
  },
  {
    question: 'Metode pembayaran apa saja yang tersedia di SALADINSHOP?',
    answer:
      'Kami mendukung berbagai kanal pembayaran populer: QRIS Standar Nasional (GoPay, OVO, DANA, ShopeePay, LinkAja, BCA QRIS), E-Wallet Transfer, serta Virtual Account / Rekening Bank (BCA, Mandiri, BNI, BRI).',
  },
  {
    question: 'Apakah akun Minecraft Java Edition sudah termasuk Bedrock Edition?',
    answer:
      'Ya, untuk produk Akun Minecraft Java & Bedrock Edition Original, Anda mendapatkan bundle resmi Microsoft yang mencakup akses ke kedua versi Minecraft (Java Edition untuk PC dan Bedrock Edition untuk Windows 10/11) dalam 1 akun.',
  },
  {
    question: 'Apa yang harus dilakukan jika mengalami kendala login atau lupa password?',
    answer:
      'Anda dapat langsung membuka menu Bantuan (Saladin Service) di navbar untuk mengajukan tiket komplain perbaikan, atau menghubungi tim Customer Service kami via WhatsApp dengan menyertakan kode Invoice pesanan.',
  },
  {
    question: 'Bagaimana cara menjual akun game pribadi ke SALADINSHOP?',
    answer:
      'Klik tombol "Jual Akun" di pojok kanan atas navbar untuk langsung terhubung dengan admin appraisal kami via WhatsApp resmi. Tim kami akan melakukan penilaian akun dan pembayaran instan setelah data diverifikasi.',
  },
  {
    question: 'Apakah Minecoins dan Realms Plus aman dari ban?',
    answer:
      '100% aman dan legal. Semua kode redeem dan produk Minecoins / Realms Plus dibeli dari distributor resmi Microsoft/Mojang tanpa menggunakan metode ilegal.',
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const waSupportUrl = `https://wa.me/6281234567890?text=${encodeURIComponent(
    'Halo Admin SALADINSHOP, saya ingin bertanya seputar produk/layanan.'
  )}`;

  return (
    <div className="min-h-screen bg-[#111111] text-white pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8 space-y-10">
      {/* Header Section */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-none bg-[#181818] text-[#38bdf8] border border-cyan-900/60 text-xs font-bold shadow-sm">
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>PUSAT BANTUAN &amp; TANYA JAWAB</span>
        </div>

        <h1 className="minecraft-font-folder text-2xl sm:text-3xl text-white tracking-wide font-normal">
          PERTANYAAN UMUM (FAQ)
        </h1>

        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
          Temukan jawaban cepat mengenai proses pembelian, metode pembayaran, garansi akun, dan pengiriman otomatis di <strong>SALADINSHOP</strong>.
        </p>
      </div>

      {/* FAQ Accordion List */}
      <div className="max-w-3xl mx-auto space-y-3.5">
        {FAQ_LIST.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className={`rounded-none border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? 'bg-[#181818] border-[#367723] shadow-lg ring-1 ring-[#367723]/40'
                  : 'bg-[#181818] border-neutral-800 hover:border-neutral-700 shadow-sm'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleFAQ(index)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 focus:outline-none select-none"
              >
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {faq.question}
                </h3>
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 text-neutral-400 transition-transform duration-300 ${
                    isOpen ? 'rotate-180 text-emerald-400' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-neutral-300 leading-relaxed border-t border-neutral-800 animate-fadeIn">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Still Have Questions CTA */}
      <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-none bg-[#181818] border border-neutral-700/80 text-center space-y-4 shadow-xl">
        <h3 className="minecraft-font-folder text-lg text-white">
          MASIH MEMILIKI PERTANYAAN LAIN?
        </h3>
        <p className="text-xs text-neutral-300 max-w-md mx-auto leading-relaxed">
          Tim Customer Support kami siap membantu Anda 24/7 melalui layanan WhatsApp resmi SALADINSHOP.
        </p>
        <div className="pt-2">
          <a
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-none text-xs font-black text-white bg-[#367723] hover:bg-[#418e2a] border-b-4 border-[#1f4813] active:border-b-0 active:translate-y-1 shadow-lg uppercase tracking-wider transition-all select-none"
          >
            <MessageCircle className="w-4 h-4" />
            <span>HUBUNGI VIA WHATSAPP</span>
          </a>
        </div>
      </div>
    </div>
  );
}
