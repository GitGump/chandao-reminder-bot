/**
 * 单元测试：工作日/节假日处理逻辑（二轮：适配修复后的 getNextWorkingDay）
 */
import { describe, it, expect } from "vitest";
import { format, addDays, isWeekend } from "date-fns";

function isHoliday(date: Date, holidayDates: Set<string>): boolean {
  const dateStr = format(date, "yyyy-MM-dd");
  return holidayDates.has(dateStr);
}

// ✅ 修复：兜底返回推进30天后
function getNextWorkingDay(date: Date, holidayDates: Set<string>): Date {
  let current = date;
  for (let i = 0; i < 30; i++) {
    if (!isWeekend(current) && !isHoliday(current, holidayDates)) {
      return current;
    }
    current = addDays(current, 1);
  }
  return addDays(date, 30);
}

describe("getNextWorkingDay (修复后)", () => {
  const holidays2026 = new Set([
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-05", "2026-10-06", "2026-10-07",
  ]);

  it("工作日不变化", () => {
    const result = getNextWorkingDay(new Date("2026-06-22"), holidays2026);
    expect(format(result, "yyyy-MM-dd")).toBe("2026-06-22");
  });

  it("周六顺延到下周一", () => {
    const result = getNextWorkingDay(new Date("2026-06-20"), holidays2026);
    expect(format(result, "yyyy-MM-dd")).toBe("2026-06-22");
  });

  it("国庆节顺延到10/8", () => {
    const result = getNextWorkingDay(new Date("2026-10-01"), holidays2026);
    expect(format(result, "yyyy-MM-dd")).toBe("2026-10-08");
  });

  it("✅ 修复验证: 30天全非工作日时返回推进30天后的日期", () => {
    const allYear = new Set<string>();
    const d = new Date("2026-01-01");
    for (let i = 0; i < 365; i++) {
      allYear.add(format(addDays(d, i), "yyyy-MM-dd"));
    }
    const original = new Date("2026-06-01");
    const result = getNextWorkingDay(original, allYear);
    const expected = addDays(original, 30);
    expect(format(result, "yyyy-MM-dd")).toBe(format(expected, "yyyy-MM-dd"));
  });
});
