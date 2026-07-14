/**
 * 单元测试：api-client 安全问题验证（二轮：确认修复）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("🔒 安全问题测试（二轮验证）", () => {
  it("✅ api-client.ts 不再硬编码 API Key", () => {
    const filePath = path.resolve(__dirname, "../lib/api-client.ts");
    const content = readFileSync(filePath, "utf-8");

    // 修复后应该使用环境变量
    const hardcodedPattern = /const API_KEY = ["']chandao-reminder-bot/;
    const hasHardcoded = hardcodedPattern.test(content);

    expect(hasHardcoded).toBe(false);
    console.log("✅ 验证通过: api-client.ts 不再硬编码 API Key");
  });

  it("✅ api-client.ts 使用 process.env 环境变量", () => {
    const filePath = path.resolve(__dirname, "../lib/api-client.ts");
    const content = readFileSync(filePath, "utf-8");

    const usesEnvVar = content.includes("process.env.NEXT_PUBLIC_API_KEY");
    expect(usesEnvVar).toBe(true);
    console.log("✅ 验证通过: api-client.ts 使用环境变量");
  });

  it("✅ apiGet 错误提取服务端错误信息", () => {
    const filePath = path.resolve(__dirname, "../lib/api-client.ts");
    const content = readFileSync(filePath, "utf-8");

    const hasErrorExtraction = content.includes("err.error");
    expect(hasErrorExtraction).toBe(true);
    console.log("✅ 验证通过: apiGet 提取错误详情");
  });
});
