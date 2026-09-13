/** Content languages of the public site. The MIS itself is English-only. */
export const CONTENT_LANGUAGES = ["en", "de", "tr"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/**
 * Translatable text as the API returns it. English is always present and acts
 * as the fallback; the other two may still be empty while the CMS catches up.
 */
export type Translated = { en: string } & Partial<Record<ContentLanguage, string>>;

export type UserRole =
  | "super_admin"
  | "admin"
  | "visa_officer"
  | "cms_manager"
  | "customer";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  permissions: string[];
  created_at: string;
}

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "received"
  | "under_review"
  | "documents_required"
  | "documents_submitted"
  | "verification"
  | "verified"
  | "processing"
  | "submitted_to_authority"
  | "decision_pending"
  | "approved"
  | "completed"
  | "rejected"
  | "cancelled"
  | "withdrawn";

export type DocumentStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "resubmit_required";

export type Priority = "low" | "normal" | "high" | "urgent";

export interface Country {
  id: number;
  code: string;
  name: Translated;
  flag_emoji: string;
  /** Inactive countries stay out of the applicant's picker. */
  is_active?: boolean;
}

export interface VisaCategory {
  id: number;
  slug: string;
  name: Translated;
  description: Translated;
  status?: string;
  display_order?: number;
}

export interface RequiredDocument {
  id: number;
  document_type: DocumentType;
  is_mandatory: boolean;
  notes: Translated;
  display_order: number;
}

export interface VisaType {
  id: number;
  slug: string;
  name: Translated;
  country: Country;
  description: Translated;
  requirements: Translated;
  application_instructions: Translated;
  processing_time: Translated;
  validity: Translated;
  entry_type: string;
  fee_amount: string | null;
  fee_currency: string;
  image: string | null;
  is_featured: boolean;
  category: VisaCategory | null;
  /** Only published types are offered on the application form. */
  status: string;
  display_order: number;
  /** The checklist an applicant must satisfy before submitting. */
  required_documents: RequiredDocument[];
  missing_translations: ContentLanguage[];
}

/** Visa identity as nested inside an application row. */
export type VisaTypeBrief = Pick<VisaType, "id" | "slug" | "name"> & {
  country: Country;
};

export interface ApplicationSummary {
  id: number;
  application_number: string;
  /** Name as declared on the application itself. */
  full_name: string;
  /** Name on the customer's account, which may differ from the application. */
  customer_name: string;
  status: ApplicationStatus;
  priority: Priority;
  visa_type: VisaTypeBrief;
  submitted_at: string | null;
  created_at: string;
  assigned_to: StaffBrief | null;
}

export interface StaffBrief {
  id: number | null;
  full_name: string;
}

export interface CustomerBrief {
  id: number;
  customer_code: string;
  full_name: string;
  email: string;
  phone: string;
}

export interface StatusOption {
  value: ApplicationStatus;
  label: string;
}

export interface PipelineStage extends StatusOption {
  state: "done" | "current" | "upcoming";
}

export interface DocumentType {
  id: number;
  code: string;
  name: Translated;
  description: Translated;
}

export interface InternalNote {
  id: number;
  application: number;
  body: string;
  author_name: string | null;
  created_at: string;
}

/** Full application record as the MIS detail view consumes it. */
export interface ApplicationDetail extends ApplicationSummary {
  middle_name: string;
  father_name: string;
  mother_name: string;
  date_of_birth: string | null;
  place_of_birth: string;
  gender: string;
  nationality: string;
  marital_status: string;

  email: string;
  phone: string;
  alternative_phone: string;
  current_address: string;
  city: string;
  country: string;

  passport_number: string;
  passport_type: string;
  passport_issue_date: string | null;
  passport_expiry_date: string | null;
  passport_issue_country: string;

  purpose_of_travel: string;
  expected_travel_date: string | null;
  expected_return_date: string | null;
  previous_visa: string;
  previous_travel_history: string;

  education: string;
  occupation: string;
  employer: string;
  emergency_contact: string;
  additional_notes: string;

  verified_at: string | null;
  decided_at: string | null;
  rejection_reason: string;
  cancellation_reason: string;

  is_editable_by_customer: boolean;
  missing_documents: string[];
  customer: CustomerBrief | null;
  allowed_transitions: StatusOption[];
  /** The ordered happy-path stages, for the MIS progress stepper. */
  pipeline: PipelineStage[];
  documents: AppDocument[];
  /** Pending requests from staff, beyond the visa type's own checklist. */
  document_requests: DocumentRequest[];
  timeline: TimelineEntry[];
}

export interface DocumentRequest {
  id: number;
  application: number;
  document_type: DocumentType;
  message: string;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
}

export interface TimelineEntry {
  id: number;
  action: string;
  description: string;
  from_status: string;
  to_status: string;
  actor_name: string | null;
  created_at: string;
}

export interface AppDocument {
  id: number;
  document_type: { id: number; code: string; name: Translated };
  original_filename: string;
  size_bytes: number;
  status: DocumentStatus;
  rejection_reason: string;
  verified_at: string | null;
  /** Null for customers: who reviewed a file is internal detail. */
  verified_by_name: string | null;
  download_url: string;
  content_type: string;
  created_at: string;
}

export interface Notification {
  id: number;
  category: string;
  title: string;
  message: string;
  reference_number: string;
  link: string;
  is_read: boolean;
  play_sound: boolean;
  created_at: string;
}

export interface Receipt {
  id: number;
  receipt_number: string;
  application: number;
  download_url: string;
  is_available_to_customer: boolean;
  created_at: string;
}

export interface Payment {
  id: number;
  application: number;
  application_number: string;
  customer_name: string;
  amount: string;
  currency: string;
  method: "cash" | "bank_transfer" | "other";
  status: "unpaid" | "partial" | "paid" | "refunded";
  paid_at: string;
  reference: string;
  note: string;
  /** Null for customers: who took the money is internal detail. */
  recorded_by_name: string | null;
  receipt: Receipt | null;
  created_at: string;
}

export interface OfficialDocument {
  id: number;
  application: number;
  kind: "verification" | "approval" | "other";
  title: string;
  download_url: string;
  /** The stored file's real name, so a scan is not saved as ".pdf". */
  filename: string;
  generated_by_name: string | null;
  is_available_to_customer: boolean;
  created_at: string;
}

export interface EmailTemplate {
  id: number;
  code: string;
  name: string;
  subject: string;
  body: string;
  trigger: string;
  is_active: boolean;
  available_variables: string[];
}

export interface EmailAttachment {
  id: number;
  original_filename: string;
  size_bytes: number;
  download_url: string;
}

export interface EmailLog {
  id: number;
  to_email: string;
  cc: string;
  subject: string;
  body: string;
  application: number | null;
  application_number: string | null;
  template_name: string | null;
  sent_by_name: string | null;
  is_automatic: boolean;
  status: "queued" | "sent" | "failed";
  sent_at: string | null;
  error_message: string;
  attachments: EmailAttachment[];
  created_at: string;
}

/** Shape of every list endpoint, per the DRF pagination class. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
