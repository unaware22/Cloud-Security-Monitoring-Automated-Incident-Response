import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Checkout uses Midtrans. The legacy public submission API must not mutate orders. */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Gone',
      message: 'Konfirmasi pembayaran manual tidak tersedia. Gunakan pembayaran melalui Midtrans.',
    },
    { status: 410 }
  );
}
