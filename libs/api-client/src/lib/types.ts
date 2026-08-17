export type Role = 'ADMIN' | 'USER';
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
export type SocialPlatform = 'LINKEDIN' | 'FACEBOOK' | 'X';
export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'PARTIAL';
export type PublishStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

// null = unlimited
export interface Plan {
  id: string;
  name: string;
  price: number;
  postsLimit: number | null;
  connectedAccountsLimit: number | null;
  isCustom: boolean;
  isActive: boolean;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  // Per-user overrides of the plan's own limits; null = use the plan's limit.
  postsLimit: number | null;
  connectedAccountsLimit: number | null;
  startDate: string;
  endDate: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  subscription: Subscription | null;
  socialAccounts: { platform: SocialPlatform; connectedAt: string }[];
}

export interface ConnectedAccount {
  id: string;
  platform: SocialPlatform;
  platformUsername: string | null;
  connectedAt: string;
}

export interface PostPublishResult {
  id: string;
  platform: SocialPlatform;
  status: PublishStatus;
  platformPostId: string | null;
  error: string | null;
}

export interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  platforms: SocialPlatform[];
  status: PostStatus;
  scheduledAt: string | null;
  createdAt: string;
  results: PostPublishResult[];
}
