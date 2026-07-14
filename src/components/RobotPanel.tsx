"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Send, ToggleLeft, ToggleRight } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Robot {
  id: number;
  name: string;
  webhook_url: string;
  is_active: boolean;
}

function maskWebhook(url: string): string {
  if (url.length <= 30) return url;
  const prefix = url.slice(0, 25);
  const suffix = url.slice(-10);
  return `${prefix}...${suffix}`;
}

export default function RobotPanel() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editRobot, setEditRobot] = useState<Robot | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchRobots = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<Robot[]>("/api/robot");
      setRobots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载机器人列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRobots();
  }, [fetchRobots]);

  function openAddForm() {
    setEditRobot(null);
    setFormName("");
    setFormUrl("");
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(robot: Robot) {
    setEditRobot(robot);
    setFormName(robot.name);
    setFormUrl(robot.webhook_url);
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditRobot(null);
    setFormName("");
    setFormUrl("");
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    const trimmedUrl = formUrl.trim();

    if (!trimmedName) {
      setFormError("请输入机器人名称");
      return;
    }
    if (!trimmedUrl) {
      setFormError("请输入 Webhook 地址");
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      setFormError("请输入有效的 URL 地址");
      return;
    }

    setSubmitting(true);
    try {
      if (editRobot) {
        await apiPut<Robot>(`/api/robot/${editRobot.id}`, {
          name: trimmedName,
          webhook_url: trimmedUrl,
        });
      } else {
        await apiPost<Robot>("/api/robot", {
          name: trimmedName,
          webhook_url: trimmedUrl,
        });
      }
      closeForm();
      await fetchRobots();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(robot: Robot) {
    try {
      setError(null);
      await apiPut<Robot>(`/api/robot/${robot.id}`, {
        is_active: !robot.is_active,
      });
      setRobots((prev) =>
        prev.map((r) =>
          r.id === robot.id ? { ...r, is_active: !r.is_active } : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "切换状态失败");
    }
  }

  async function handleDelete(robot: Robot) {
    if (!confirm(`确定要删除机器人「${robot.name}」吗？此操作不可撤销。`)) return;
    setDeletingId(robot.id);
    try {
      setError(null);
      await apiDelete(`/api/robot/${robot.id}`);
      setRobots((prev) => prev.filter((r) => r.id !== robot.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTest(robot: Robot) {
    setTestingId(robot.id);
    setTestResult(null);
    try {
      const data = await apiPost<{ ok: boolean; message: string }>(
        `/api/robot/${robot.id}/test`
      );
      setTestResult({ id: robot.id, ...data });
      setTimeout(() => setTestResult(null), 5000);
    } catch (err) {
      setTestResult({
        id: robot.id,
        ok: false,
        message: err instanceof Error ? err.message : "测试发送失败",
      });
      setTimeout(() => setTestResult(null), 5000);
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-blue-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-gray-500">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          云之家机器人管理
        </h2>
        <button
          onClick={openAddForm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          添加机器人
        </button>
      </div>

      {/* Global Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeForm}
          />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              {editRobot ? "编辑机器人" : "添加机器人"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  机器人名称
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：产研通知机器人"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Webhook 地址
                </label>
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && (
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                  {editRobot ? "保存" : "添加"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Robot List */}
      {robots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-gray-400">
          <p className="text-sm">暂无机器人，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {robots.map((robot) => {
            const isTesting = testingId === robot.id;
            const isDeleting = deletingId === robot.id;
            const result = testResult?.id === robot.id ? testResult : null;

            return (
              <div
                key={robot.id}
                className={cn(
                  "rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
                  robot.is_active
                    ? "border-gray-200"
                    : "border-gray-100 bg-gray-50/60"
                )}
              >
                {/* Name & Active Badge */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-gray-900">
                      {robot.name}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      robot.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {robot.is_active ? "启用" : "停用"}
                  </span>
                </div>

                {/* Webhook URL */}
                <p
                  className="mb-4 cursor-default truncate text-xs text-gray-500"
                  title={robot.webhook_url}
                >
                  {maskWebhook(robot.webhook_url)}
                </p>

                {/* Test Result */}
                {result && (
                  <div
                    className={cn(
                      "mb-3 rounded-lg px-3 py-2 text-xs",
                      result.ok
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    )}
                  >
                    {result.message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(robot)}
                    title={robot.is_active ? "点击停用" : "点击启用"}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    {robot.is_active ? (
                      <ToggleRight size={20} className="text-green-600" />
                    ) : (
                      <ToggleLeft size={20} />
                    )}
                  </button>

                  {/* Test */}
                  <button
                    onClick={() => handleTest(robot)}
                    disabled={isTesting}
                    title="测试发送"
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <Send size={16} />
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(robot)}
                    title="编辑"
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Pencil size={16} />
                  </button>

                  <div className="flex-1" />

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(robot)}
                    disabled={isDeleting}
                    title="删除"
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
