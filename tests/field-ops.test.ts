import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  distanceInMetres, checkGeofence, canCompleteJob, clockStateOf, minutesWorked, mapsLink,
} from "../src/lib/field-ops";

/** Dubai Marina, roughly. */
const MARINA = { latitude: 25.0805, longitude: 55.1403 };

describe("distance between two points", () => {
  test("the same point is zero", () => {
    assert.equal(distanceInMetres(MARINA, MARINA), 0);
  });

  test("a known short hop is about right", () => {
    // 0.001 degrees of latitude is ~111 metres anywhere on earth.
    const d = distanceInMetres(MARINA, { ...MARINA, latitude: MARINA.latitude + 0.001 });
    assert.ok(d > 105 && d < 118, `expected ~111m, got ${d}`);
  });

  test("Marina to Mirdif is roughly 30 km", () => {
    const MIRDIF = { latitude: 25.2172, longitude: 55.4208 };
    const d = distanceInMetres(MARINA, MIRDIF);
    assert.ok(d > 25_000 && d < 35_000, `expected ~30km, got ${d}m`);
  });

  test("works across the equator and the meridian without going negative", () => {
    const d = distanceInMetres({ latitude: -1, longitude: -1 }, { latitude: 1, longitude: 1 });
    assert.ok(d > 0);
  });
});

describe("the 200m geofence", () => {
  const radiusMetres = 200;

  test("standing at the property is inside", () => {
    const out = checkGeofence({ property: MARINA, device: MARINA, radiusMetres });
    assert.equal(out.flagged, false);
    assert.equal(out.reason, "INSIDE");
    assert.equal(out.distanceMetres, 0);
  });

  test("100 metres away is inside", () => {
    const out = checkGeofence({
      property: MARINA,
      device: { ...MARINA, latitude: MARINA.latitude + 0.0009 },
      radiusMetres,
    });
    assert.equal(out.flagged, false);
  });

  test("a kilometre away is flagged", () => {
    const out = checkGeofence({
      property: MARINA,
      device: { ...MARINA, latitude: MARINA.latitude + 0.01 },
      radiusMetres,
    });
    assert.equal(out.flagged, true);
    assert.equal(out.reason, "TOO_FAR");
    assert.ok((out.distanceMetres ?? 0) > 900);
  });

  test("being flagged NEVER blocks the cleaner — it only marks for review", () => {
    // The whole contract of this function: it returns a flag, never a refusal.
    const out = checkGeofence({
      property: MARINA,
      device: { latitude: 0, longitude: 0 },
      radiusMetres,
    });
    assert.equal(out.flagged, true);
    assert.equal(typeof out.distanceMetres, "number");
    assert.equal("blocked" in out, false, "there is deliberately no 'blocked' outcome");
  });

  test("a vague GPS reading widens the circle instead of punishing the cleaner", () => {
    // 300m away, but the phone admits it could be 250m out.
    const out = checkGeofence({
      property: MARINA,
      device: { ...MARINA, latitude: MARINA.latitude + 0.0027 },
      accuracyMetres: 250,
      radiusMetres,
    });
    assert.equal(out.flagged, false, "within 200m + 250m of slack");
  });

  test("a wildly vague reading is flagged as vague, not as cheating", () => {
    const out = checkGeofence({
      property: MARINA,
      device: { ...MARINA, latitude: MARINA.latitude + 0.05 },
      accuracyMetres: 600,
      radiusMetres,
    });
    assert.equal(out.flagged, true);
    assert.equal(out.reason, "POOR_ACCURACY");
  });

  test("a property with no coordinates cannot be checked, and is not blamed", () => {
    const out = checkGeofence({ property: null, device: MARINA, radiusMetres });
    assert.equal(out.flagged, false);
    assert.equal(out.reason, "NO_PROPERTY_LOCATION");
    assert.equal(out.distanceMetres, null);
  });

  test("a refused location permission is flagged for review", () => {
    const out = checkGeofence({ property: MARINA, device: null, radiusMetres });
    assert.equal(out.flagged, true);
    assert.equal(out.reason, "NO_DEVICE_LOCATION");
  });
});

describe("finishing a job", () => {
  const items = (spec: [boolean, boolean][]) =>
    spec.map(([isMandatory, isChecked], i) => ({ id: `i${i}`, isMandatory, isChecked }));

  test("cannot finish while every mandatory item is unticked", () => {
    const out = canCompleteJob({ status: "IN_PROGRESS", items: items([[true, false], [true, false]]) });
    assert.equal(out.canComplete, false);
    assert.equal(out.reason, "MANDATORY_INCOMPLETE");
    assert.equal(out.outstandingMandatory.length, 2);
  });

  test("cannot finish with even one mandatory item left", () => {
    const out = canCompleteJob({ status: "IN_PROGRESS", items: items([[true, true], [true, false]]) });
    assert.equal(out.canComplete, false);
    assert.deepEqual(out.outstandingMandatory, ["i1"]);
  });

  test("CAN finish with optional items left unticked", () => {
    const out = canCompleteJob({ status: "IN_PROGRESS", items: items([[true, true], [false, false]]) });
    assert.equal(out.canComplete, true);
    assert.equal(out.checkedCount, 1);
    assert.equal(out.totalCount, 2);
  });

  test("a job with no checklist at all can still be finished", () => {
    const out = canCompleteJob({ status: "IN_PROGRESS", items: [] });
    assert.equal(out.canComplete, true);
  });

  test("a job nobody has arrived at yet cannot be finished", () => {
    const out = canCompleteJob({ status: "SCHEDULED", items: items([[true, true]]) });
    assert.equal(out.canComplete, false);
    assert.equal(out.reason, "NOT_STARTED");
  });

  test("a finished job cannot be finished twice", () => {
    const out = canCompleteJob({ status: "COMPLETED", items: [] });
    assert.equal(out.canComplete, false);
    assert.equal(out.reason, "ALREADY_DONE");
  });

  test("a cancelled or no-access job cannot be finished", () => {
    assert.equal(canCompleteJob({ status: "CANCELLED", items: [] }).reason, "WRONG_STATUS");
    assert.equal(canCompleteJob({ status: "NO_ACCESS", items: [] }).reason, "WRONG_STATUS");
  });

  test("counts are reported so the phone can show 6 of 12", () => {
    const out = canCompleteJob({
      status: "IN_PROGRESS",
      items: items([[true, true], [true, true], [false, false], [true, false]]),
    });
    assert.equal(out.totalCount, 4);
    assert.equal(out.checkedCount, 2);
    assert.equal(out.mandatoryCount, 3);
  });
});

describe("clock state", () => {
  test("no entry means not clocked in", () => {
    assert.equal(clockStateOf(null), "NOT_CLOCKED_IN");
  });
  test("clocked in but not out", () => {
    assert.equal(clockStateOf({ clockInAt: new Date(), clockOutAt: null }), "CLOCKED_IN");
  });
  test("clocked out", () => {
    assert.equal(clockStateOf({ clockInAt: new Date(), clockOutAt: new Date() }), "CLOCKED_OUT");
  });
  test("minutes worked", () => {
    const a = new Date(2026, 0, 5, 9, 0);
    const b = new Date(2026, 0, 5, 11, 30);
    assert.equal(minutesWorked(a, b), 150);
  });
  test("a phone clock running backwards cannot produce negative hours", () => {
    const a = new Date(2026, 0, 5, 11, 0);
    const b = new Date(2026, 0, 5, 9, 0);
    assert.equal(minutesWorked(a, b), 0);
  });
});

describe("directions link", () => {
  test("prefers exact coordinates", () => {
    const link = mapsLink({ latitude: 25.08, longitude: 55.14, address: "Somewhere" });
    assert.match(link ?? "", /destination=25\.08,55\.14/);
  });
  test("falls back to the address, safely encoded", () => {
    const link = mapsLink({ address: "Villa 12, Jumeirah 2 & Co" }) ?? "";
    assert.match(link, /destination=Villa%2012/);
    assert.equal(link.includes("&Co"), false, "the ampersand must be encoded, not end the parameter");
  });
  test("returns nothing when there is nothing to navigate to", () => {
    assert.equal(mapsLink({}), null);
  });
});
