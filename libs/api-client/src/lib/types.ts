import type { DestinationType as CoreDestinationType, PlatformId } from '@syncpost/platform-core';

export type Role = 'ADMIN' | 'USER';
export type SubscriptionStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

/**
 * Re-exported from `@syncpost/platform-core` so the platform union has exactly
 * one definition. These were hand-mirrored copies of the Prisma enums with no
 * compile-time link to them.
 */
export type SocialPlatform = PlatformId;
export type DestinationType = CoreDestinationType;
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
  platforms: SocialPlatform[];
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
  startDate: string;
  endDate: string | null;
}

export interface MySubscription {
  subscription: Subscription | null;
  plans: Plan[];
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
  destinationType: DestinationType;
  platformUsername: string | null;
  connectedAt: string;
}

// Every field is optional because not every platform's API exposes every metric
// (e.g. LinkedIn has no share/impression count on its free-tier endpoint).
export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
}

export interface PostPublishResult {
  id: string;
  socialAccountId: string | null;
  platform: SocialPlatform;
  destinationLabel: string | null;
  status: PublishStatus;
  platformPostId: string | null;
  error: string | null;
  publishedAt: string | null;
  // Only present on GET /posts/:id and GET /posts/analytics — the plain list
  // endpoint doesn't fetch live platform metrics, to keep it cheap.
  metrics?: PostMetrics | null;
}

export interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  destinationIds: string[];
  platforms: SocialPlatform[];
  status: PostStatus;
  scheduledAt: string | null;
  createdAt: string;
  results: PostPublishResult[];
}

export interface CombinedPostStats {
  published: number;
  failed: number;
  partial: number;
  scheduled: number;
  total: number;
}

export interface RecentPlatformPost {
  postId: string;
  content: string;
  destinationLabel: string | null;
  publishedAt: string | null;
  metrics: PostMetrics | null;
}

export interface PlatformAnalytics {
  platform: SocialPlatform;
  success: number;
  failed: number;
  pending: number;
  attempts: number;
  totals: { likes: number; comments: number; shares: number; impressions: number };
  recentPosts: RecentPlatformPost[];
}

export interface PostAnalytics {
  combined: CombinedPostStats;
  platforms: PlatformAnalytics[];
}

export interface AdminPlatformStats {
  platform: SocialPlatform;
  success: number;
  failed: number;
  pending: number;
  attempts: number;
}

export interface AdminTopPoster {
  userId: string;
  name: string;
  email: string;
  postCount: number;
}

export interface AdminPostAnalytics {
  combined: CombinedPostStats;
  platforms: AdminPlatformStats[];
  topPosters: AdminTopPoster[];
}

export interface AdminPlanBreakdown {
  planId: string;
  name: string;
  price: number;
  subscribers: number;
  mrr: number;
}

export interface AdminRecentPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  planName: string | null;
}

export interface AdminBillingOverview {
  totalSubscribers: number;
  byStatus: Record<SubscriptionStatus, number>;
  byPlan: AdminPlanBreakdown[];
  mrr: number;
  recentPayments: { available: boolean; payments: AdminRecentPayment[] };
}
