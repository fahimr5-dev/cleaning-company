/**
 * Lead types and constants shared between the server and the browser.
 *
 * PLAIN ENGLISH: this file deliberately contains NO database code. The board
 * component runs in the browser, and anything it imports gets shipped to the
 * visitor — importing the database module here would send the whole Postgres
 * driver to every phone that opens the page.
 */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUOTED", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type BoardLead = {
  id: string;
  referenceNo: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: LeadStatus;
  source: string;
  lostReason: string | null;
  boardPosition: number;
  estimateFils: number | null;
  propertyType: string | null;
  bedrooms: number | null;
  sqm: number | null;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  serviceNameEn: string | null;
  serviceNameAr: string | null;
  frequency: string | null;
  preferredDate: string | null;
  createdAt: string;
  ageDays: number;
  quoteId: string | null;
  quoteNo: string | null;
};

export type LeadBoard = {
  columns: Record<LeadStatus, BoardLead[]>;
  counts: Record<LeadStatus, number>;
  /** Total value sitting in the pipeline, excluding won and lost. */
  openValueFils: number;
  wonValueFils: number;
  conversionRate: number;
};
