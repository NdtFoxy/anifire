"use client";

import { authFetch } from "@/lib/auth-client";

/** Admin user directory: paged search plus a full dossier for one account. */

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
const USERS = `${API_BASE}/api/v1/admin/users`;

export interface AdminUserRow {
  id: number;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  emailVerified: boolean;
  deleted: boolean;
  locked: boolean;
  adsFree: boolean;
  plan: string | null;
  signupCountry: string | null;
  comments: number;
  views: number;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface UserQuery {
  query?: string;
  /** Free text matched against the body of comments the user wrote. */
  comment?: string;
  role?: "USER" | "ADMIN" | "";
  verified?: boolean | null;
  includeDeleted?: boolean;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
  size?: number;
}

export interface UserPage {
  items: AdminUserRow[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface AdminUserDetail {
  profile: {
    id: number;
    email: string;
    displayName: string | null;
    role: string;
    bio: string | null;
    location: string | null;
    birthday: string | null;
    avatarUrl: string | null;
    signupCountry: string | null;
    level: number;
    points: number;
    deleted: boolean;
  };
  timeline: {
    createdAt: string | null;
    updatedAt: string | null;
    passwordChangedAt: string | null;
    lastLoginAt: string | null;
    firstWatchAt: string | null;
    lastActivityAt: string | null;
  };
  security: {
    emailVerified: boolean;
    locked: boolean;
    lockedUntil: string | null;
    failedAttempts: number;
    activeSessions: number;
    passwordNeverChanged: boolean;
  };
  engagement: {
    comments: number;
    views: number;
    distinctTitles: number;
    watchedSeconds: number;
    episodesCompleted: number;
    bookmarks: number;
    friends: number;
    ratings: number;
    averageScore: number | null;
    adsFree: boolean;
    plan: string | null;
    premiumUntil: string | null;
  };
  recentComments: {
    id: number;
    animeId: number | null;
    animeTitle: string | null;
    text: string;
    at: string | null;
  }[];
  recentWatches: { animeKey: string; animeTitle: string | null; episode: number; at: string }[];
  sessions: {
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
  linkedAccounts: { provider: string; linkedAt: string; lastLoginAt: string | null }[];
  ratings: {
    animeId: number;
    title: string;
    imageUrl: string | null;
    score: number;
    review: string | null;
    at: string;
  }[];
}

export async function fetchUsers(input: UserQuery): Promise<UserPage> {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.comment) params.set("comment", input.comment);
  if (input.role) params.set("role", input.role);
  if (input.verified !== null && input.verified !== undefined) {
    params.set("verified", String(input.verified));
  }
  if (input.includeDeleted) params.set("includeDeleted", "true");
  params.set("sort", input.sort ?? "createdAt");
  params.set("direction", input.direction ?? "desc");
  params.set("page", String(input.page ?? 0));
  params.set("size", String(input.size ?? 20));

  const res = await authFetch(`${USERS}?${params}`);
  if (!res.ok) throw new Error("Could not load users.");
  return (await res.json()) as UserPage;
}

export async function fetchUserDetail(id: number): Promise<AdminUserDetail> {
  const res = await authFetch(`${USERS}/${id}`);
  if (!res.ok) throw new Error("Could not load that account.");
  return (await res.json()) as AdminUserDetail;
}

export async function setUserRole(id: number, role: "USER" | "ADMIN"): Promise<void> {
  await authFetch(`${USERS}/${id}`, { method: "PUT", body: JSON.stringify({ role }) });
}
