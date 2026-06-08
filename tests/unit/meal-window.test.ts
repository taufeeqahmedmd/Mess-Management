import { describe, it, expect } from "vitest";
import { activeMealNow, minutesOfDay, type MealWindow } from "@/services/meal-window";

const MEALS: MealWindow[] = [
  { id: "1", name: "Breakfast", startTime: "07:00", endTime: "11:00" },
  { id: "2", name: "Lunch", startTime: "11:30", endTime: "15:00" },
  { id: "3", name: "Dinner", startTime: "19:00", endTime: "22:00" },
];

const at = (h: number, m = 0) => h * 60 + m;

describe("activeMealNow", () => {
  it("matches inside a window (start inclusive, end exclusive)", () => {
    expect(activeMealNow(MEALS, at(7, 0))?.name).toBe("Breakfast"); // start inclusive
    expect(activeMealNow(MEALS, at(12, 0))?.name).toBe("Lunch");
    expect(activeMealNow(MEALS, at(21, 59))?.name).toBe("Dinner");
  });

  it("returns null outside all windows", () => {
    expect(activeMealNow(MEALS, at(11, 0))).toBeNull(); // breakfast end exclusive
    expect(activeMealNow(MEALS, at(15, 0))).toBeNull(); // lunch end exclusive
    expect(activeMealNow(MEALS, at(3, 0))).toBeNull();
    expect(activeMealNow(MEALS, at(23, 30))).toBeNull();
  });

  it("handles an overnight window (start > end wraps midnight)", () => {
    const night: MealWindow[] = [{ id: "9", name: "Late", startTime: "22:00", endTime: "02:00" }];
    expect(activeMealNow(night, at(23, 0))?.name).toBe("Late");
    expect(activeMealNow(night, at(1, 0))?.name).toBe("Late");
    expect(activeMealNow(night, at(2, 0))).toBeNull(); // end exclusive
    expect(activeMealNow(night, at(21, 0))).toBeNull();
  });

  it("returns the first match by input order", () => {
    const overlap: MealWindow[] = [
      { id: "a", name: "A", startTime: "10:00", endTime: "13:00" },
      { id: "b", name: "B", startTime: "12:00", endTime: "14:00" },
    ];
    expect(activeMealNow(overlap, at(12, 30))?.name).toBe("A");
  });

  it("minutesOfDay reflects the clock", () => {
    expect(minutesOfDay(new Date(2026, 0, 1, 13, 45))).toBe(13 * 60 + 45);
  });
});
