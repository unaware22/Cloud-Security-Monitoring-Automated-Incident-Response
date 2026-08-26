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
  | 'rejected';

export type DeliveryStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'resent';

export type PaymentMethod =
  | 'xendit_invoice'
  | 'manual_transfer'
  | 'manual_qris';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityEventType =
  | 'admin_bruteforce_attempt'
  | 'sql_injection_attempt'
  | 'xss_attempt'
  | 'order_enumeration_attempt'
  | 'checkout_abuse'
  | 'invalid_payment_callback'
  | 'unauthorized_admin_access'
  | 'sensitive_path_scan'
  | 'rate_limit_exceeded'
  | 'direct_rds_access_test';

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
}

export interface AdminSessionPayload {
  userId: string;
  email: string;
  role: string;
}
