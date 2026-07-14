/**
 * 单元测试：占位符替换逻辑
 *
 * 从 src/app/api/trigger/route.ts 提取纯函数进行测试
 */
import { describe, it, expect } from "vitest";
import { format, addDays, subDays } from "date-fns";

// ============================================================
// 从 trigger/route.ts 提取的纯函数（不依赖 Supabase）
// ============================================================

function toDateOnly(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekday(d: Date): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return days[d.getDay()];
}

function replacePlaceholders(
  template: string,
  releaseDate: Date,
  planningDate: Date,
  chanzhouNum: number
): string {
  // {禅道编号} and {禅道编号+N} / {禅道编号-N}
  let result = template.replace(/\{禅道编号(\+|-)(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    return String(op === "+" ? chanzhouNum + n : chanzhouNum - n);
  });
  result = result.replace(/\{禅道编号\}/g, String(chanzhouNum));

  // {发版日日期} and {发版日日期+N} / {发版日日期-N}
  result = result.replace(/\{发版日日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(releaseDate, n) : subDays(releaseDate, n);
    return toDateOnly(target);
  });

  // {规划会日期+N} / {规划会日期-N}
  result = result.replace(/\{规划会日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(planningDate, n) : subDays(planningDate, n);
    return toDateOnly(target);
  });

  // {发版日日期所在星期}
  result = result.replace(/\{发版日日期所在星期\}/g, getWeekday(releaseDate));
  // {规划会日期所在星期}
  result = result.replace(/\{规划会日期所在星期\}/g, getWeekday(planningDate));

  // {发版日日期}
  result = result.replace(/\{发版日日期\}/g, toDateOnly(releaseDate));
  // {规划会日期}
  result = result.replace(/\{规划会日期\}/g, toDateOnly(planningDate));

  return result;
}

// ============================================================
// 测试用例
// ============================================================

describe("占位符替换 replacePlaceholders", () => {
  // 测试日期: 发版日 2026-07-07 (周二), 规划会 2026-06-18 (周四)
  const releaseDate = new Date("2026-07-07T00:00:00");
  const planningDate = new Date("2026-06-18T00:00:00");
  const chanzhouNum = 351;

  it("TC-TRIG-004: {发版日日期} 正确渲染", () => {
    const result = replacePlaceholders("{发版日日期}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("7/7");
  });

  it("TC-TRIG-005: {发版日日期+3} 正确计算", () => {
    const result = replacePlaceholders("{发版日日期+3}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("7/10");
  });

  it("TC-TRIG-006: {发版日日期-1} 正确计算", () => {
    const result = replacePlaceholders("{发版日日期-1}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("7/6");
  });

  it("TC-TRIG-007: {发版日日期所在星期} 正确渲染（周二）", () => {
    const result = replacePlaceholders("{发版日日期所在星期}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("周二");
  });

  it("TC-TRIG-008: {规划会日期} 正确渲染", () => {
    const result = replacePlaceholders("{规划会日期}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("6/18");
  });

  it("TC-TRIG-008b: {规划会日期+1} 正确计算", () => {
    const result = replacePlaceholders("{规划会日期+1}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("6/19");
  });

  it("TC-TRIG-008c: {规划会日期所在星期} 正确渲染（周四）", () => {
    const result = replacePlaceholders("{规划会日期所在星期}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("周四");
  });

  it("TC-TRIG-009: {禅道编号} 正确渲染", () => {
    const result = replacePlaceholders("{禅道编号}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("351");
  });

  it("TC-TRIG-010: {禅道编号+2} 正确计算", () => {
    const result = replacePlaceholders("{禅道编号+2}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("353");
  });

  it("TC-TRIG-011: {禅道编号-1} 正确计算", () => {
    const result = replacePlaceholders("{禅道编号-1}", releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("350");
  });

  it("TC-TRIG-012: 跨月日期正确计算 (8/1的前一天是7/31)", () => {
    const release = new Date("2026-08-01T00:00:00");
    const result = replacePlaceholders("{发版日日期-1}", release, planningDate, chanzhouNum);
    expect(result).toBe("7/31");
  });

  it("TC-TRIG-013: 所有占位符混合使用全部正确替换", () => {
    const template =
      "【{发版日日期}迭代】规划会{规划会日期}，禅道{禅道编号}，" +
      "提前一天{发版日日期-1}，星期{发版日日期所在星期}，下个编号{禅道编号+1}";
    const result = replacePlaceholders(template, releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("【7/7迭代】规划会6/18，禅道351，提前一天7/6，星期周二，下个编号352");
  });

  it("TC-TRIG-014: 占位符中繁体字不被替换（保留原文）", () => {
    const template = "{禅道编号} 与 {禪道編號} 不同";
    const result = replacePlaceholders(template, releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("351 与 {禪道編號} 不同");
  });

  it("未定义的占位符保持不变", () => {
    const template = "{未知占位符} and {发版日日期}";
    const result = replacePlaceholders(template, releaseDate, planningDate, chanzhouNum);
    expect(result).toBe("{未知占位符} and 7/7");
  });

  it("禅道编号可为负数（边界）", () => {
    const result = replacePlaceholders("{禅道编号}", releaseDate, planningDate, -5);
    expect(result).toBe("-5");
  });

  it("禅道编号+偏移为负数", () => {
    const result = replacePlaceholders("{禅道编号-10}", releaseDate, planningDate, 5);
    expect(result).toBe("-5");
  });
});

describe("toDateOnly 日期格式化", () => {
  it("正常日期格式化", () => {
    expect(toDateOnly(new Date("2026-01-01"))).toBe("1/1");
    expect(toDateOnly(new Date("2026-12-31"))).toBe("12/31");
    expect(toDateOnly(new Date("2026-07-07"))).toBe("7/7");
  });

  it("单数字月日不带前导零", () => {
    const result = toDateOnly(new Date("2026-01-05"));
    expect(result).toBe("1/5"); // 不是 01/05
  });
});

describe("getWeekday 星期计算", () => {
  it("周日 = 0", () => {
    // 2026-01-04 is Sunday
    expect(getWeekday(new Date("2026-01-04"))).toBe("周日");
  });

  it("周一 = 1", () => {
    expect(getWeekday(new Date("2026-01-05"))).toBe("周一");
  });

  it("周六 = 6", () => {
    expect(getWeekday(new Date("2026-01-03"))).toBe("周六");
  });

  it("2026-07-07 是周二", () => {
    expect(getWeekday(new Date("2026-07-07"))).toBe("周二");
  });
});
