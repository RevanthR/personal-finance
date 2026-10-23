import { describe, it, expect, vi, afterEach } from "vitest";
import { adHocDate } from "./utils";

afterEach(() => vi.useRealTimers());

describe("adHocDate", () => {
  it("stamps the real instant when the picked day is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T11:25:00Z"));
    // A reconcile stamped at 11:25 must not out-sort an expense added for
    // 'today' right after it — so 'today' resolves to now, not midnight.
    expect(adHocDate("2026-09-07").toISOString()).toBe("2026-09-07T11:25:00.000Z");
  });

  it("keeps a backdated day at its plain UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T11:25:00Z"));
    expect(adHocDate("2026-08-15").toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  it("keeps a future day at its plain UTC midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T11:25:00Z"));
    expect(adHocDate("2026-09-20").toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });
});

describe("India calendar dates", () => {
  it("00:30 IST on the 1st is already the new month, even though UTC is still last month", async () => {
    const { monthYearOf, localDateString } = await import("./utils");
    const d = new Date("2026-09-30T19:00:00Z"); // 1 Oct 00:30 IST
    expect(monthYearOf(d)).toEqual({ month: 10, year: 2026 });
    expect(localDateString(d)).toBe("2026-10-01");
  });
  it("a date-only value stays on its own day", async () => {
    const { monthYearOf } = await import("./utils");
    expect(monthYearOf(new Date("2026-10-31"))).toEqual({ month: 10, year: 2026 });
  });
});
