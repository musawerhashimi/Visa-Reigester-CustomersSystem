import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import type { Paginated, Translated } from "@/types/domain";

/** A published CMS record as the public site consumes it. */
export interface PublicContent {
  id: number;
  slug?: string;
  status: string;
  published_at: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface NewsArticle extends PublicContent {
  slug: string;
  title: Translated;
  short_description: Translated;
  content: Translated;
  featured_image: string | null;
  author: string;
  category: string;
  views: number;
}

export interface EventItem extends PublicContent {
  slug: string;
  title: Translated;
  description: Translated;
  start_date: string;
  end_date: string | null;
  location: Translated;
  image: string | null;
  registration_info: Translated;
}

export interface ActivityItem extends PublicContent {
  slug: string;
  title: Translated;
  short_description: Translated;
  full_description: Translated;
  cover_image: string | null;
  date: string | null;
  location: Translated;
  category: string;
}

export interface ServiceItem extends PublicContent {
  slug: string;
  name: Translated;
  description: Translated;
  requirements: Translated;
  processing_info: Translated;
  estimated_time: Translated;
  fee_info: Translated;
  image: string | null;
  is_featured: boolean;
}

export interface GalleryImage extends PublicContent {
  title: Translated;
  description: Translated;
  /** For a video this is the poster frame, and may be empty. */
  image: string | null;
  /** An uploaded video file, if this entry is one. */
  video: string | null;
  /** A YouTube or Vimeo address, as an alternative to uploading. */
  video_url: string;
  /** What the server says this is, so the tile knows how to render. */
  kind: "image" | "video";
  category: string;
  is_featured: boolean;
}

export interface TeamMemberItem extends PublicContent {
  name: string;
  position: Translated;
  bio: Translated;
  photo: string | null;
}

export interface TestimonialItem extends PublicContent {
  customer_name: string;
  content: Translated;
  role: Translated;
  photo: string | null;
  rating: number;
}

export interface FAQItem extends PublicContent {
  question: Translated;
  answer: Translated;
  category: string;
}

export interface CompanyInfo {
  name: Translated;
  description: Translated;
  mission: Translated;
  vision: Translated;
  goals: Translated;
  history: Translated;
  values: Translated;
  working_hours: Translated;
  logo: string | null;
  address: string;
  phone: string;
  email: string;
  /** From address for automatic mail; blank uses the server default. */
  sending_email: string;
  /** Mail server, staff-only: absent from the public response. */
  smtp_host?: string;
  smtp_port?: number | null;
  smtp_username?: string;
  /** True when a password is stored. The value itself is never returned. */
  smtp_password_set?: boolean;
  smtp_use_tls?: boolean;
  smtp_enabled?: boolean;
  website: string;
  social_links: Record<string, string>;
}

/**
 * Read a published CMS collection.
 *
 * The endpoint returns only published records to anonymous callers, so the
 * public site needs no status filter of its own.
 */
export function usePublicContent<T extends PublicContent>(
  endpoint: string,
  options: { limit?: number; params?: Record<string, unknown> } = {},
) {
  return useQuery({
    queryKey: ["public", endpoint, options.params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<Paginated<T>>(`/cms/${endpoint}/`, {
        params: { page_size: options.limit ?? 50, ...options.params },
      });
      return data.results;
    },
  });
}

export function usePublicItem<T extends PublicContent>(
  endpoint: string,
  lookup: string | undefined,
) {
  return useQuery({
    queryKey: ["public", endpoint, lookup],
    queryFn: async () => {
      const { data } = await api.get<T>(`/cms/${endpoint}/${lookup}/`);
      return data;
    },
    enabled: Boolean(lookup),
  });
}

export function useCompanyInfo() {
  return useQuery({
    queryKey: ["public", "company"],
    queryFn: async () => {
      const { data } = await api.get<CompanyInfo>("/cms/company/");
      return data;
    },
  });
}

/**
 * Resolve a media path to a URL the browser can load.
 *
 * Django returns a relative path when no absolute URI is configured; in
 * development the API lives on a different port from the dev server.
 */
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = import.meta.env.VITE_MEDIA_BASE_URL ?? "";
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}
