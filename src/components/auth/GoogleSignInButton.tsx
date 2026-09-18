'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Loader2 } from 'lucide-react';

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (error: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  disabled?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'continue_with',
  disabled = false,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const initialClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const [clientId, setClientId] = useState<string>(initialClientId);
  const [isCheckingConfig, setIsCheckingConfig] = useState(
    !initialClientId || initialClientId.includes('REPLACE_ME')
  );

  // Store callbacks in refs to avoid triggering re-renders of the Google button
  // when parent components re-render on keystrokes in form fields
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!initialClientId || initialClientId.includes('REPLACE_ME')) {
      fetch('/api/auth/config')
        .then((res) => res.json())
        .then((data) => {
          if (data?.googleClientId) {
            setClientId(data.googleClientId);
          }
        })
        .catch(() => {})
        .finally(() => {
          setIsCheckingConfig(false);
        });
    }
  }, [initialClientId]);

  const isConfigured = Boolean(clientId && !clientId.includes('REPLACE_ME'));

  useEffect(() => {
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
    }
  }, []);

  // Render button only when Google script is ready and client ID is present.
  // We deliberately do NOT include onSuccess, onError, or disabled in dependencies
  // so typing in the form will never clear innerHTML and recreate the iframe.
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !isConfigured) return;
    if (!window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: any) => {
          if (response?.credential) {
            onSuccessRef.current(response.credential);
          } else {
            onErrorRef.current?.('Gagal mendapatkan kredensial Google.');
          }
        },
      });

      containerRef.current.innerHTML = '';

      const containerWidth = containerRef.current.clientWidth || 360;
      const targetWidth = Math.min(Math.max(containerWidth, 240), 380);

      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text,
        width: targetWidth,
        locale: 'id',
      });
    } catch (err: any) {
      onErrorRef.current?.(err?.message || 'Gagal memuat Google Sign-In');
    }
  }, [scriptLoaded, isConfigured, clientId, text]);

  if (isCheckingConfig) {
    return (
      <div className="w-full flex items-center justify-center p-3 text-neutral-500 text-xs gap-2 min-h-[44px]">
        <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
        <span>Memuat opsi login Google...</span>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="p-3 bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs text-center min-h-[44px] flex flex-col justify-center">
        <p className="font-semibold text-neutral-300">Login Google Tersedia</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">
          (Atur <code className="text-amber-400 font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> di <code className="text-neutral-400 font-mono">.env</code> untuk mengaktifkan)
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div
        ref={containerRef}
        className={`w-full flex justify-center min-h-[44px] transition-opacity duration-200 ${
          disabled ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'opacity-100'
        }`}
      />
    </div>
  );
}
