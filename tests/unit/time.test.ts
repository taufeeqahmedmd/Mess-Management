import { describe, it, expect } from "vitest";
import { localDateValue, localDayRange, minutesOfDayInZone } from "@/lib/time";

const IST = "Asia/Kolkata"; // UTC+5:30, no DST — exact for the deployment target

describe("minutesOfDayInZone", () => {
  it("returns minutes since LOCAL midnight, not the server clock", () => {
    // 2026-06-09T10:00Z == 15:30 IST
    expect(minutesOfDayInZone(new Date("2026-06-09T10:00:00Z"), IST)).toBe(15 * 60 + 30);
    // 2026-06-09T19:00Z == 00:30 IST (next local day)
    expect(minutesOfDayInZone(new Date("2026-06-09T19:00:00Z"), IST)).toBe(30);
  });
});

describe("localDateValue", () => {
  it("uses the local calendar date — the timezone-split-brain regression", () => {
    // 20:00Z is already 01:30 the NEXT day in IST → date must roll over.
    expect(localDateValue(new Date("2026-06-09T20:00:00Z"), IST).toISOString()).toBe(
      "2026-06-10T00:00:00.000Z",
    );
    // 10:00Z is 15:30 IST, still the same date.
    expect(localDateValue(new Date("2026-06-09T10:00:00Z"), IST).toISOString()).toBe(
      "2026-06-09T00:00:00.000Z",
    );
  });
});

describe("localDayRange", () => {
  it("brackets the local calendar day as instants (IST midnight = 18:30Z prior day)", () => {
    const { start, end } = localDayRange(new Date("2026-06-09T10:00:00Z"), IST);
    expect(start.toISOString()).toBe("2026-06-08T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-06-09T18:30:00.000Z");
  });

  it("a tap just after local midnight falls in the new local day's range", () => {
    const at = new Date("2026-06-09T19:00:00Z"); // 00:30 IST on Jun 10
    const { start, end } = localDayRange(at, IST);
    expect(at >= start && at < end).toBe(true);
    expect(start.toISOString()).toBe("2026-06-09T18:30:00.000Z"); // IST midnight Jun 10
  });
});
