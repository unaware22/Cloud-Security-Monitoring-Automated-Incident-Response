'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: 'dark' | 'light' | 'auto';
      size: 'normal' | 'compact' | 'flexible';
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': (errorCode?: string) => void;
    }
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  resetKey: number;
  action?: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
};

export default function TurnstileWidget({
  siteKey,
  resetKey,
  action = 'checkout',
  onVerify,
  onExpire,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onVerify, onExpire, onError });
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onVerify, onExpire, onError };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady || !window.turnstile || !containerRef.current || !siteKey) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'dark',
      size: 'flexible',
      action,
      callback: (token) => callbacksRef.current.onVerify(token),
      'expired-callback': () => callbacksRef.current.onExpire(),
      'error-callback': () => callbacksRef.current.onError(),
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [action, scriptReady, siteKey, resetKey]);

  if (!siteKey) return null;

  return (
    <div className="space-y-2">
      <Script
        id="cloudflare-turnstile-api"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-[65px] w-full" aria-label="Verifikasi keamanan CAPTCHA" />
      <p className="text-center text-[10px] text-neutral-500">
        Verifikasi anti-bot dilindungi oleh Cloudflare Turnstile.
      </p>
    </div>
  );
}
