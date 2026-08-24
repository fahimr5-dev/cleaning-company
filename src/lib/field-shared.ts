/**
 * Types the cleaner's phone needs in the browser.
 * NO DATABASE IMPORTS — everything here is shipped to the phone.
 */

export type FieldJobSummary = {
  id: string;
  jobNo: string;
  status: string;
  start: string;
  end: string;
  durationMinutes: number;
  clientName: string;
  serviceNameEn: string;
  serviceNameAr: string;
  propertyLabel: string;
  addressLine: string;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  mapsUrl: string | null;
  /** Warnings the cleaner must see before knocking on the door. */
  hasPets: boolean;
  petNotes: string | null;
  chemicalAllergies: string | null;
  keyHeldByCompany: boolean;
  keyTag: string | null;
  gateCode: string | null;
  accessNotes: string | null;
  parkingNotes: string | null;
  clientNotes: string | null;
  clockState: "NOT_CLOCKED_IN" | "CLOCKED_IN" | "CLOCKED_OUT";
  checklistTotal: number;
  checklistChecked: number;
  mandatoryOutstanding: number;
  photoCount: number;
};

export type FieldChecklistItem = {
  id: string;
  section: string | null;
  labelEn: string;
  labelAr: string;
  isMandatory: boolean;
  isChecked: boolean;
  sortOrder: number;
};

export type FieldPhoto = {
  id: string;
  kind: "BEFORE" | "AFTER" | "ISSUE";
  storagePath: string;
  caption: string | null;
  takenAt: string;
  /** A short-lived link the phone can actually display. Null if storage is off. */
  signedUrl: string | null;
};

export type FieldJobDetail = FieldJobSummary & {
  checklist: FieldChecklistItem[];
  photos: FieldPhoto[];
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInFlagged: boolean;
  clockInDistanceM: number | null;
  latitude: number | null;
  longitude: number | null;
};

export const ISSUE_TYPES = [
  "DAMAGE", "NO_ACCESS", "ON_SITE_COMPLAINT", "EQUIPMENT_FAULT", "OTHER",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
