import type { Translated } from "@/types/domain";

/**
 * The CMS content types, described once.
 *
 * Every type is the same shape — translated fields, a status, an optional
 * image — so a single list and a single editor serve all of them rather than
 * eleven near-identical pages that drift apart.
 */

export type FieldKind = "text" | "textarea" | "plain" | "date" | "datetime" | "number";

export interface ContentField {
  name: string;
  label: string;
  kind: FieldKind;
  /** Translated fields carry {en, de, tr}; plain ones are a single value. */
  translated?: boolean;
  required?: boolean;
  hint?: string;
  rows?: number;
}

export interface ContentTypeConfig {
  key: string;
  /** API path segment under /cms/. */
  endpoint: string;
  label: string;
  singular: string;
  /** Lookup used in detail URLs: slug for most, id for the rest. */
  lookup: "slug" | "id";
  /** Field whose English value labels a row in the list. */
  titleField: string;
  permission: string;
  fields: ContentField[];
}

const STATUS_HINT = "Drafts are invisible on the public site.";

export const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    key: "news",
    endpoint: "news",
    label: "News",
    singular: "Article",
    lookup: "slug",
    titleField: "title",
    permission: "cms.news.manage",
    fields: [
      { name: "slug", label: "URL slug", kind: "plain", required: true, hint: "e.g. new-office-opening" },
      { name: "title", label: "Title", kind: "text", translated: true, required: true },
      { name: "short_description", label: "Summary", kind: "textarea", translated: true, rows: 2 },
      { name: "content", label: "Article", kind: "textarea", translated: true, rows: 10 },
      { name: "author", label: "Author", kind: "plain" },
      { name: "category", label: "Category", kind: "plain" },
    ],
  },
  {
    key: "events",
    endpoint: "events",
    label: "Events",
    singular: "Event",
    lookup: "slug",
    titleField: "title",
    permission: "cms.events.manage",
    fields: [
      { name: "slug", label: "URL slug", kind: "plain", required: true },
      { name: "title", label: "Title", kind: "text", translated: true, required: true },
      { name: "description", label: "Description", kind: "textarea", translated: true, rows: 6 },
      { name: "start_date", label: "Starts", kind: "datetime", required: true },
      { name: "end_date", label: "Ends", kind: "datetime" },
      { name: "location", label: "Location", kind: "text", translated: true },
      { name: "registration_info", label: "Registration information", kind: "textarea", translated: true, rows: 3 },
    ],
  },
  {
    key: "activities",
    endpoint: "activities",
    label: "Activities",
    singular: "Activity",
    lookup: "slug",
    titleField: "title",
    permission: "cms.activities.manage",
    fields: [
      { name: "slug", label: "URL slug", kind: "plain", required: true },
      { name: "title", label: "Title", kind: "text", translated: true, required: true },
      { name: "short_description", label: "Summary", kind: "textarea", translated: true, rows: 2 },
      { name: "full_description", label: "Full description", kind: "textarea", translated: true, rows: 8 },
      { name: "date", label: "Date", kind: "date" },
      { name: "location", label: "Location", kind: "text", translated: true },
      { name: "category", label: "Category", kind: "plain" },
    ],
  },
  {
    key: "services",
    endpoint: "services",
    label: "Services",
    singular: "Service",
    lookup: "slug",
    titleField: "name",
    permission: "cms.services.manage",
    fields: [
      { name: "slug", label: "URL slug", kind: "plain", required: true },
      { name: "name", label: "Name", kind: "text", translated: true, required: true },
      { name: "description", label: "Description", kind: "textarea", translated: true, rows: 6 },
      { name: "requirements", label: "Requirements", kind: "textarea", translated: true, rows: 4 },
      { name: "processing_info", label: "Processing information", kind: "textarea", translated: true, rows: 3 },
      { name: "estimated_time", label: "Estimated time", kind: "text", translated: true },
      { name: "fee_info", label: "Fee information", kind: "text", translated: true },
    ],
  },
  {
    key: "faqs",
    endpoint: "faqs",
    label: "FAQs",
    singular: "Question",
    lookup: "id",
    titleField: "question",
    permission: "cms.pages.manage",
    fields: [
      { name: "question", label: "Question", kind: "text", translated: true, required: true },
      { name: "answer", label: "Answer", kind: "textarea", translated: true, required: true, rows: 5 },
      { name: "category", label: "Category", kind: "plain" },
    ],
  },
  {
    key: "testimonials",
    endpoint: "testimonials",
    label: "Testimonials",
    singular: "Testimonial",
    lookup: "id",
    titleField: "customer_name",
    permission: "cms.pages.manage",
    fields: [
      { name: "customer_name", label: "Customer name", kind: "plain", required: true },
      { name: "content", label: "Testimonial", kind: "textarea", translated: true, required: true, rows: 4 },
      { name: "role", label: "Role", kind: "text", translated: true },
      { name: "rating", label: "Rating (1-5)", kind: "number" },
    ],
  },
  {
    key: "team",
    endpoint: "team",
    label: "Team",
    singular: "Team member",
    lookup: "id",
    titleField: "name",
    permission: "cms.pages.manage",
    fields: [
      { name: "name", label: "Name", kind: "plain", required: true },
      { name: "position", label: "Position", kind: "text", translated: true },
      { name: "bio", label: "Biography", kind: "textarea", translated: true, rows: 5 },
    ],
  },
  {
    key: "pages",
    endpoint: "pages",
    label: "Pages",
    singular: "Page",
    lookup: "slug",
    titleField: "title",
    permission: "cms.pages.manage",
    fields: [
      { name: "slug", label: "URL slug", kind: "plain", required: true },
      { name: "title", label: "Title", kind: "text", translated: true, required: true },
      { name: "content", label: "Content", kind: "textarea", translated: true, rows: 12 },
      { name: "meta_description", label: "Meta description", kind: "textarea", translated: true, rows: 2, hint: "Shown in search results." },
    ],
  },
];

export const CONTENT_TYPE_BY_KEY = new Map(
  CONTENT_TYPES.map((type) => [type.key, type]),
);

export interface ContentRecord {
  id: number;
  slug?: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  display_order: number;
  missing_translations: string[];
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export function recordTitle(record: ContentRecord, config: ContentTypeConfig): string {
  const value = record[config.titleField];
  if (typeof value === "string") return value || "(untitled)";
  if (value && typeof value === "object") {
    return (value as Translated).en || "(untitled)";
  }
  return "(untitled)";
}

export { STATUS_HINT };
