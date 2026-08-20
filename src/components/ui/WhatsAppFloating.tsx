'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';

interface WhatsAppFloatingProps {
  phoneNumber?: string;
  message?: string;
}

export default function WhatsAppFloating({
  phoneNumber = '6281234567890',
  message = 'Halo Admin SALADINSHOP, saya ingin bertanya seputar produk Minecraft & pembayaran.',
}: WhatsAppFloatingProps) {
  const waUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center group">
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 px-4 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full shadow-2xl hover:shadow-[#25D366]/40 transition-all transform hover:scale-105 duration-300 border-2 border-white/20"
        title="Tanya Admin via WhatsApp"
      >
        <div className="relative">
          <MessageCircle className="w-6 h-6 fill-white text-[#25D366]" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        </div>
        <span className="font-bold text-sm tracking-tight pr-1">Tanya Admin</span>
      </a>
    </div>
  );
}
