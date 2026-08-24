/**
 * The rules the cleaner's phone follows.
 *
 * PLAIN ENGLISH: how far away a clock-in was, whether that is close enough,
 * and whether a job is allowed to be marked finished. Pure logic with no
 * database and no clock of its own, so every rule can be tested directly.
 */

export type Coordinates = { latitude: number; longitude: number };

const EARTH_RADIUS_METRES = 6_371_000;

/**
 * Distance between two points on the earth, in metres.
 *
 * Uses the haversine formula, which is accurate to a few metres over the
 * distances that matter here — far better than the geofence needs.
 */
export function distanceInMetres(a: Coordinates, b: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h))));
}

export type GeofenceResult = {
  /** Metres from the property, or null when we could not tell. */
  distanceMetres: number | null;
  /** True when this needs a manager's eyes. Never blocks the cleaner. */
  flagged: boolean;
  reason: "INSIDE" | "TOO_FAR" | "NO_PROPERTY_LOCATION" | "NO_DEVICE_LOCATION" | "POOR_ACCURACY";
};

/**
 * Checks a clock-in against the property's location.
 *
 * IMPORTANT: this NEVER stops a cleaner working. Phone GPS is unreliable
 * indoors, in basements and in tower blocks, and a cleaner standing in a
 * client's kitchen unable to start their shift is a worse problem than a
 * timesheet that needs a glance. A mismatch is flagged for review instead.
 */
export function checkGeofence(input: {
  property: Coordinates | null;
  device: Coordinates | null;
  /** How confident the phone is, in metres. */
  accuracyMetres?: number | null;
  radiusMetres: number;
}): GeofenceResult {
  if (!input.property) {
    return { distanceMetres: null, flagged: false, reason: "NO_PROPERTY_LOCATION" };
  }
  if (!input.device) {
    // The cleaner may have refused location permission. Flag it so a manager
    // can see the pattern, but let them get on with the job.
    return { distanceMetres: null, flagged: true, reason: "NO_DEVICE_LOCATION" };
  }

  const distanceMetres = distanceInMetres(input.property, input.device);

  // A reading the phone itself says is vague cannot fairly be held against
  // anyone, so we widen the circle by the phone's own margin of error.
  const accuracy = input.accuracyMetres ?? 0;
  const allowed = input.radiusMetres + Math.max(0, accuracy);

  if (distanceMetres <= allowed) {
    return { distanceMetres, flagged: false, reason: "INSIDE" };
  }
  if (accuracy > input.radiusMetres * 2) {
    return { distanceMetres, flagged: true, reason: "POOR_ACCURACY" };
  }
  return { distanceMetres, flagged: true, reason: "TOO_FAR" };
}

/* ------------------------------- checklists ------------------------------- */

export type ChecklistItemState = {
  id: string;
  isMandatory: boolean;
  isChecked: boolean;
};

export type CompletionCheck = {
  canComplete: boolean;
  totalCount: number;
  checkedCount: number;
  mandatoryCount: number;
  outstandingMandatory: string[];
  reason?: "MANDATORY_INCOMPLETE" | "NOT_STARTED" | "ALREADY_DONE" | "WRONG_STATUS";
};

/**
 * Decides whether a job may be marked finished.
 *
 * The rule from the brief: every mandatory item must be ticked first. Optional
 * items are exactly that — a cleaner should not be blocked because the client
 * had no towels to replace.
 */
export function canCompleteJob(input: {
  status: string;
  items: ChecklistItemState[];
}): CompletionCheck {
  const { items } = input;
  const mandatory = items.filter((i) => i.isMandatory);
  const outstandingMandatory = mandatory.filter((i) => !i.isChecked).map((i) => i.id);

  const base = {
    totalCount: items.length,
    checkedCount: items.filter((i) => i.isChecked).length,
    mandatoryCount: mandatory.length,
    outstandingMandatory,
  };

  if (input.status === "COMPLETED") {
    return { ...base, canComplete: false, reason: "ALREADY_DONE" };
  }
  if (input.status === "CANCELLED" || input.status === "NO_ACCESS") {
    return { ...base, canComplete: false, reason: "WRONG_STATUS" };
  }
  if (input.status === "SCHEDULED") {
    // The team has to actually arrive before a job can be finished.
    return { ...base, canComplete: false, reason: "NOT_STARTED" };
  }
  if (outstandingMandatory.length > 0) {
    return { ...base, canComplete: false, reason: "MANDATORY_INCOMPLETE" };
  }

  return { ...base, canComplete: true };
}

/* ----------------------------- clocking in/out ---------------------------- */

export type ClockState = "NOT_CLOCKED_IN" | "CLOCKED_IN" | "CLOCKED_OUT";

export function clockStateOf(entry: { clockInAt: Date | null; clockOutAt: Date | null } | null): ClockState {
  if (!entry || !entry.clockInAt) return "NOT_CLOCKED_IN";
  return entry.clockOutAt ? "CLOCKED_OUT" : "CLOCKED_IN";
}

/** Minutes worked, never negative even if the phone's clock is wrong. */
export function minutesWorked(clockInAt: Date, clockOutAt: Date): number {
  return Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60_000));
}

/** A Google Maps link that opens turn-by-turn directions on a phone. */
export function mapsLink(input: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}): string | null {
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${input.latitude},${input.longitude}`;
  }
  if (input.address?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.address.trim())}`;
  }
  return null;
}
