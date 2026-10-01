'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';

interface MidtransEmbeddedPaymentProps {
  token: string | null;
  paymentUrl: string | null;
  onPaymentActivity: () => void;
}

const EMBED_ID = 'saladinshop-midtrans-payment';

export default function MidtransEmbeddedPayment({
  token,
  paymentUrl,
  onPaymentActivity,
}: MidtransEmbeddedPaymentProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const embeddedToken = useRef<string | null>(null);
  const activityCallback = useRef(onPaymentActivity);
  activityCallback.current = onPaymentActivity;

  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '';
  const snapScript = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

  useEffect(() => {
    if (!sdkReady || !token || embeddedToken.current === token) return;
    if (!window.snap || typeof window.snap.embed !== 'function') {
      setSdkError(true);
      return;
    }

    try {
      // Snap owns this container; never render or generate a merchant QR/VA.
      window.snap.embed(token, {
        embedId: EMBED_ID,
        language: 'id',
        uiMode: 'auto',
        onSuccess: () => activityCallback.current(),
        onPending: () => activityCallback.current(),
        onError: () => setSdkError(true),
      });
      embeddedToken.current = token;
      setSdkError(false);
    } catch {
      setSdkError(true);
    }
  }, [sdkReady, token]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-emerald-500/20 bg-[#171b19] shadow-2xl shadow-black/30">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white sm:text-base">Selesaikan pembayaran</h2>
          <p className="text-xs text-neutral-400">QRIS atau nomor VA resmi ditampilkan oleh Midtrans di bawah ini.</p>
        </div>
      </div>

      {clientKey && token && (
        <Script
          src={snapScript}
          data-client-key={clientKey}
          strategy="afterInteractive"
          onReady={() => setSdkReady(true)}
          onError={() => setSdkError(true)}
        />
      )}

      <div className="p-3 sm:p-5">
        {!sdkReady && !sdkError && token && clientKey && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat metode pembayaran...
          </div>
        )}
        {token && clientKey && (
          <div id={EMBED_ID} className="min-h-[520px] w-full overflow-hidden rounded-2xl bg-white sm:min-h-[600px] [&_iframe]:!w-full" />
        )}
        {(sdkError || !token || !clientKey) && (
          <p className="mt-3 text-center text-xs text-amber-300">
            Tampilan pembayaran tertanam belum tersedia. Gunakan tautan resmi Midtrans berikut.
          </p>
        )}
        {paymentUrl && (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-xs font-semibold text-neutral-200 transition-colors hover:bg-white/5"
          >
            Buka pembayaran di Midtrans <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}
