import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'SALADINSHOP',
  description: 'Toko Minecraft dan Roblox Indonesia terpercaya.',
  icons: {
    icon: '/enderman.png',
    shortcut: '/enderman.png',
    apple: '/enderman.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" type="image/png" href="/enderman.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/enderman.png" />
      </head>
      <body className="bg-[#111111] text-white antialiased selection:bg-[#367723] selection:text-white min-h-screen flex flex-col font-sans">
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
