/**
 * Shared Digital Delivery Parser & Types for 3 Standard Categories:
 * 1. 'account'     -> Email, Password, Catatan
 * 2. 'redeem_code' -> Kode Redeem, Catatan
 * 3. 'roblox'      -> Username Roblox Admin (Add Friend), Link World Private Server, Catatan
 */

export type DeliveryCategory = 'account' | 'redeem_code' | 'roblox';

export interface ParsedDeliveryItem {
  category: DeliveryCategory;
  // Category: account
  email?: string;
  password?: string;
  // Category: redeem_code
  code?: string;
  // Category: roblox
  robloxUsername?: string;
  privateServerUrl?: string;
  // Common
  notes?: string;
  raw: string;
}

export function parseDeliveryContent(
  rawDelivery: string,
  forceCategory?: DeliveryCategory
): ParsedDeliveryItem[] {
  if (!rawDelivery) return [];
  const lines = rawDelivery
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  return lines.map((line) => parseDeliveryLine(line, forceCategory));
}

export function parseDeliveryLine(
  line: string,
  forceCategory?: DeliveryCategory
): ParsedDeliveryItem {
  const parts = line.split('|').map((p) => p.trim()).filter(Boolean);

  let email = '';
  let password = '';
  let code = '';
  let robloxUsername = '';
  let privateServerUrl = '';
  const otherNotes: string[] = [];

  for (const part of parts) {
    if (
      /^(email|username|user|akun)\s*:\s*/i.test(part) &&
      !/^(username roblox|roblox user|user roblox|roblox admin|admin roblox)/i.test(part)
    ) {
      email = part.replace(/^(email|username|user|akun)\s*:\s*/i, '').trim();
    } else if (/^(pass|password|pwd|kata sandi)\s*:\s*/i.test(part)) {
      password = part.replace(/^(pass|password|pwd|kata sandi)\s*:\s*/i, '').trim();
    } else if (
      /^(redeem code|kode redeem|kode lisensi|kode|voucher|gift code|lisensi|license key)\s*:\s*/i.test(part)
    ) {
      code = part
        .replace(
          /^(redeem code|kode redeem|kode lisensi|kode|voucher|gift code|lisensi|license key)\s*:\s*/i,
          ''
        )
        .trim();
    } else if (
      /^(username roblox admin|username roblox|roblox admin|admin roblox|roblox username|roblox user|add roblox|user roblox)\s*:\s*/i.test(
        part
      )
    ) {
      robloxUsername = part
        .replace(
          /^(username roblox admin|username roblox|roblox admin|admin roblox|roblox username|roblox user|add roblox|user roblox)\s*:\s*/i,
          ''
        )
        .trim();
    } else if (
      /^(link private server|link world private|private server link|private server|link private|world private|link roblox|link)\s*:\s*/i.test(
        part
      ) &&
      (/roblox\.com/i.test(part) || /privateServerLink/i.test(part) || /^https?:\/\//i.test(part))
    ) {
      privateServerUrl = part
        .replace(
          /^(link private server|link world private|private server link|private server|link private|world private|link roblox|link)\s*:\s*/i,
          ''
        )
        .trim();
    } else if (/^(redeem url|link redeem|link penukaran|url redeem|website)\s*:\s*/i.test(part)) {
      const url = part.replace(/^(redeem url|link redeem|link penukaran|url redeem|website)\s*:\s*/i, '').trim();
      otherNotes.push(`Link Penukaran: ${url}`);
    } else if (/^https?:\/\/(www\.)?roblox\.com/i.test(part)) {
      privateServerUrl = part.trim();
    } else {
      const cleanNote = part
        .replace(/^(catatan|keterangan|ket|info|detail|note|notes)\s*:\s*/i, '')
        .trim();
      if (cleanNote) otherNotes.push(cleanNote);
    }
  }

  const notes = otherNotes.join(' | ');

  // Determine Category automatically if not forced
  let category: DeliveryCategory = forceCategory || 'account';
  if (!forceCategory) {
    if (
      robloxUsername ||
      privateServerUrl ||
      /roblox\.com/i.test(line) ||
      /roblox/i.test(line) ||
      /private server/i.test(line)
    ) {
      category = 'roblox';
    } else if (code || /redeem/i.test(line) || /voucher/i.test(line) || /minecoin/i.test(line)) {
      category = 'redeem_code';
    } else if (email || password) {
      category = 'account';
    }
  }

  if (category === 'roblox') {
    return {
      category: 'roblox',
      robloxUsername: robloxUsername || 'SaladinRoblox_Official',
      privateServerUrl:
        privateServerUrl ||
        'https://www.roblox.com/games/2753915549/BloxFruits?privateServerLinkCode=88192019482910',
      notes:
        notes ||
        'Silakan add friend username Roblox admin di atas, lalu join ke link World Private Server untuk proses trade item.',
      raw: line,
    };
  }

  if (category === 'redeem_code') {
    return {
      category: 'redeem_code',
      code: code || line,
      notes: notes || undefined,
      raw: line,
    };
  }

  return {
    category: 'account',
    email: email || undefined,
    password: password || undefined,
    notes: notes || undefined,
    raw: line,
  };
}
