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
