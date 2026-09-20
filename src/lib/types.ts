export type GameCategory = 'minecraft' | 'roblox';

export type SubCategory = {
  id: string;
  name: string;
  childSubcategories?: { id: string; name: string }[];
};

export type GameConfig = {
  id: GameCategory;
  name: string;
  accent: string;
  themeColor: string;
  badgeClass: string;
  subcategories: SubCategory[];
};

export interface CustomSkinDetails {
  description: string;
  skinSize: '32x32' | '64x64' | string;
  skinModel: 'wide' | 'slim' | string;
  referenceImageUrl?: string | null;
}

export interface ProductItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  originalPrice?: number | null;
  discountPercent?: number | null;
  stock: number;
  productType: string;
  imageUrl: string | null;
  game: GameCategory;
  subCategory1: string;
  subCategory2?: string | null;
  deliveryType: 'automatic' | 'manual';
  sortOrder?: number;
  serviceTag?: 'proses-instant' | 'pembuatan-cepat' | string;
  soldCount?: string;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type OrderStatus =
  | 'created'
  | 'waiting_payment'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type PaymentStatus =
  | 'pending'
  | 'pending_manual'
  | 'paid'
  | 'paid_manual'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'rejected';

export type DeliveryStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'resent';

export type PaymentMethod =
  | 'midtrans'
  | 'manual_transfer'
  | 'manual_qris';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityEventType =
  | 'admin_bruteforce_attempt'
  | 'admin_login_failed'
  | 'admin_login_bot_attempt'
  | 'admin_content_change'
  | 'sql_injection_attempt'
  | 'xss_attempt'
  | 'order_enumeration_attempt'
  | 'checkout_abuse'
  | 'order_cancellation_abuse'
  | 'bot_order_attempt'
  | 'invalid_payment_callback'
  | 'unauthorized_admin_access'
  | 'sensitive_path_scan'
  | 'rate_limit_exceeded'
  | 'direct_rds_access_test'
  | 'user_bruteforce_attempt'
  | 'user_login_failed'
  | 'credential_stuffing_attempt'
  | 'account_takeover_attempt'
  | 'suspicious_login_success'
  | 'user_reauthentication_failed'
  | 'user_login_bot_attempt'
  | 'user_registration_bot_attempt'
  | 'user_password_reset_abuse'
  | 'unauthorized_order_access'
  | 'voucher_abuse_attempt';

export interface SecurityEventLog {
  event_type: SecurityEventType | string;
  severity: SecuritySeverity;
  ip_address: string;
  method: string;
  endpoint: string;
  user_agent: string;
  payload_snippet: string;
  status_code: number;
  request_id: string;
  created_at: string;
  account_ref?: string;
  auth_method?: 'password' | 'google';
}

export interface AdminSessionPayload {
  userId: string;
  email: string;
  role: string;
  sessionVersion: number;
}

export interface CustomerSessionPayload {
  userId: string;
  email: string;
  name: string;
  role: 'customer';
  sessionVersion: number;
}

export interface GoogleUserPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}
