/**
 * 单元测试：CSV 导入日期解析逻辑（二轮：适配修复后的代码）
 */
import { describe, it, expect } from "vitest";

// ============================================================
// 修复后的 parseDateValue: (value, year) → 含日历校验 + 无跨年
// ============================================================

function parseDateValue(value: string, year: number): string | null {
  value = value.trim();
  if (!value) return null;

  let month: number;
  let day: number;

  if (value.includes("/")) {
    const parts = value.split("/");
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
  } else {
    month = parseInt(value.slice(0, 2), 10);
    day = parseInt(value.slice(2, 4), 10);
  }

  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // 验证实际日历日
  const testDate = new Date(year, month - 1, day);
  if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    return null;
  }

  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

describe("parseDateValue (修复后) - 日期解析", () => {
  describe("M/D 格式", () => {
    it("正常解析 12/19", () => {
      expect(parseDateValue("12/19", 2026)).toBe("2026-12-19");
    });
    it("正常解析 5/9", () => {
      expect(parseDateValue("5/9", 2026)).toBe("2026-05-09");
    });
    it("带空格 trim", () => {
      expect(parseDateValue("  6/18  ", 2026)).toBe("2026-06-18");
    });
  });

  describe("MMDD 格式", () => {
    it("正常解析 0106", () => {
      expect(parseDateValue("0106", 2026)).toBe("2026-01-06");
    });
    it("正常解析 0707", () => {
      expect(parseDateValue("0707", 2026)).toBe("2026-07-07");
    });
  });

  describe("✅ 修复验证: 跨年逻辑不再在 parseDateValue 内", () => {
    it("year=2026, 日期=2/15 → 正确返回 2026-02-15", () => {
      expect(parseDateValue("2/15", 2026)).toBe("2026-02-15");
    });
    it("year=2026, 日期=7/7 → 正确返回 2026-07-07", () => {
      expect(parseDateValue("7/7", 2026)).toBe("2026-07-07");
    });
  });

  describe("✅ 修复验证: 日历校验", () => {
    it("2/30（2月30日）返回 null", () => {
      expect(parseDateValue("2/30", 2026)).toBeNull();
    });
    it("2/29 闰年有效", () => {
      expect(parseDateValue("2/29", 2024)).toBe("2024-02-29");
    });
    it("2/29 非闰年返回 null", () => {
      expect(parseDateValue("2/29", 2025)).toBeNull();
    });
    it("4/31 返回 null", () => {
      expect(parseDateValue("4/31", 2026)).toBeNull();
    });
  });

  describe("边界条件", () => {
    it("空字符串返回 null", () => {
      expect(parseDateValue("", 2026)).toBeNull();
    });
    it("非法月份返回 null", () => {
      expect(parseDateValue("13/01", 2026)).toBeNull();
      expect(parseDateValue("00/01", 2026)).toBeNull();
    });
    it("非数字返回 null", () => {
      expect(parseDateValue("abc", 2026)).toBeNull();
    });
  });
});
