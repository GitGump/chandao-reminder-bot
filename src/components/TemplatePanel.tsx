"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import { Pencil, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

/* ──────────────────── 类型定义 ──────────────────── */

interface MessageTemplate {
  id: number;
  message_type: number;
  template_content: string;
  is_active: boolean;
}

interface ChanZhouConfig {
  id: number;
  base_iteration: string;
  base_chanzhou_num: number;
  increment: number;
}

/* ──────────────────── 静态数据 ──────────────────── */

const MESSAGE_TYPE_LABELS: Record<number, string> = {
  1: "规划会提醒",
  2: "全员进度更新",
  3: "发版后状态更新",
  4: "部门进度更新",
};

const PLACEHOLDERS = [
  { label: "{发版日日期}", desc: "发版日日期" },
  { label: "{规划会日期}", desc: "规划会日期" },
  { label: "{禅道编号}", desc: "当前迭代禅道编号" },
  { label: "{发版日日期-1}", desc: "发版日前 1 天" },
  { label: "{发版日日期+3}", desc: "发版日后 3 天" },
  { label: "{发版日日期所在星期}", desc: "发版日所在星期" },
  { label: "{规划会日期-1}", desc: "规划会日期前 1 天" },
  { label: "{规划会日期所在星期}", desc: "规划会日期所在星期" },
  { label: "{禅道编号+1}", desc: "下一个禅道编号" },
];

/* ──────────────────── 组件 ──────────────────── */

export default function TemplatePanel() {
  /* ---------- Templates ---------- */
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  /* ---------- ChanZhou Config ---------- */
  const [chanzhouConfig, setChanzhouConfig] = useState<ChanZhouConfig | null>(
    null
  );
  const [configLoading, setConfigLoading] = useState(true);

  /* ---------- 编辑弹窗 ---------- */
  const [editModal, setEditModal] = useState<{
    template: MessageTemplate;
    draft: string;
    saving: boolean;
  } | null>(null);

  /* ---------- 配置编辑 ---------- */
  const [configDraft, setConfigDraft] = useState<{
    base_iteration: string;
    base_chanzhou_num: number;
    increment: number;
  } | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  /* ---------- Toast ---------- */
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  /* ==================== API 调用 ==================== */

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await apiGet<MessageTemplate[]>("/api/templates");
      setTemplates(data);
    } catch {
      showToast("error", "加载消息模板失败");
    } finally {
      setTemplatesLoading(false);
    }
  }, [showToast]);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await apiGet<ChanZhouConfig>("/api/chanzhou-config");
      setChanzhouConfig(data);
      setConfigDraft({
        base_iteration: data.base_iteration,
        base_chanzhou_num: data.base_chanzhou_num,
        increment: data.increment,
      });
    } catch {
      showToast("error", "加载禅道配置失败");
    } finally {
      setConfigLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTemplates();
    fetchConfig();
  }, [fetchTemplates, fetchConfig]);

  /* ==================== 模板编辑 ==================== */

  const openEditor = (tpl: MessageTemplate) => {
    setEditModal({ template: tpl, draft: tpl.template_content, saving: false });
  };

  const saveTemplate = async () => {
    if (!editModal) return;
    setEditModal({ ...editModal, saving: true });
    try {
      await apiPost(`/api/templates`, {
        message_type: editModal.template.message_type,
        template_content: editModal.draft,
      });
      setTemplates((prev) => {
        const idx = prev.findIndex((t) => t.id === editModal.template.id);
        const updated = { ...editModal.template, template_content: editModal.draft };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        // 新建模板：重新拉取以获取数据库分配的 id
        return [...prev, updated];
      });
      showToast("success", "模板已更新");
      setEditModal(null);
    } catch {
      showToast("error", "保存模板失败");
      setEditModal({ ...editModal, saving: false });
    }
  };

  /* ==================== 禅道配置 ==================== */

  const saveConfig = async () => {
    if (!configDraft) return;
    setConfigSaving(true);
    try {
      const updated = await apiPost<ChanZhouConfig>("/api/chanzhou-config", {
        base_iteration: configDraft.base_iteration,
        base_chanzhou_num: configDraft.base_chanzhou_num,
        increment: configDraft.increment,
      });
      setChanzhouConfig(updated);
      showToast("success", "禅道配置已更新");
    } catch {
      showToast("error", "保存配置失败");
    } finally {
      setConfigSaving(false);
    }
  };

  /* ==================== 渲染辅助 ==================== */

  const highlightPlaceholders = (text: string) => {
    const parts = text.split(
      /(\{[^}]+\})/g
    );
    return parts.map((part, i) =>
      /^\{[^}]+\}$/.test(part) ? (
        <span
          key={i}
          className="rounded bg-blue-100 px-1 font-mono text-xs text-blue-700"
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  /* ==================== 渲染 ==================== */

  return (
    <div className="space-y-6">
      {/* ────── Toast ────── */}
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {toast.message}
          <button className="ml-2" onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ────── 消息模板 ────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">消息模板</h2>
        </div>

        {templatesLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
            <Loader2 size={20} className="animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3, 4].map((type) => {
              const tpl = templates.find((t) => t.message_type === type);
              return (
                <div
                  key={type}
                  className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">
                      {MESSAGE_TYPE_LABELS[type]}
                    </span>
                    {tpl ? (
                      <button
                        onClick={() => openEditor(tpl)}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="编辑模板"
                      >
                        <Pencil size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => openEditor({ id: 0, message_type: type, template_content: "", is_active: true } as MessageTemplate)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        title="创建模板"
                      >
                        + 创建
                      </button>
                    )}
                  </div>
                  {tpl ? (
                    <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                      {highlightPlaceholders(tpl.template_content)}
                    </p>
                  ) : (
                    <p className="text-sm italic text-gray-400">暂无模板</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ────── 占位符帮助 ────── */}
      <section className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-blue-800">
          可用占位符
        </h3>
        <div className="grid gap-1 sm:grid-cols-3">
          {PLACEHOLDERS.map((ph) => (
            <div key={ph.label} className="flex items-baseline gap-2 text-xs">
              <code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-blue-700">
                {ph.label}
              </code>
              <span className="text-gray-500">{ph.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ────── 禅道编号配置 ────── */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">禅道编号配置</h2>

        {configLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
            <Loader2 size={20} className="animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : chanzhouConfig && configDraft ? (
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Base Iteration */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  基准迭代
                </label>
                <input
                  type="text"
                  value={configDraft.base_iteration}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      base_iteration: e.target.value,
                    })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="如 0526"
                />
              </div>

              {/* Base Number */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  基准禅道编号
                </label>
                <input
                  type="number"
                  value={configDraft.base_chanzhou_num}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      base_chanzhou_num: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>

              {/* Increment */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  每迭代增量
                </label>
                <input
                  type="number"
                  value={configDraft.increment}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      increment: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 flex items-center gap-2 rounded-md bg-gray-50 px-4 py-3">
              <span className="text-xs text-gray-500">当前迭代预览：</span>
              <span className="text-sm font-semibold text-gray-800">
                {chanzhouConfig.base_iteration}{" "}
                → #{chanzhouConfig.base_chanzhou_num}
              </span>
            </div>

            {/* Save */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={saveConfig}
                disabled={configSaving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {configSaving && <Loader2 size={14} className="animate-spin" />}
                保存配置
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无配置数据</p>
        )}
      </section>

      {/* ────── 编辑弹窗 ────── */}
      {editModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">
                编辑「
                {MESSAGE_TYPE_LABELS[editModal.template.message_type]}
                」模板
              </h3>
              <button
                onClick={() => setEditModal(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <textarea
              value={editModal.draft}
              onChange={(e) =>
                setEditModal({ ...editModal, draft: e.target.value })
              }
              rows={8}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />

            <div className="mt-3 text-xs text-gray-400">
              使用{" "}
              <code className="rounded bg-gray-100 px-1 font-mono">
                {"{占位符}"}
              </code>{" "}
              语法插入动态变量。下方「可用占位符」区域列出了全部支持项。
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditModal(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={saveTemplate}
                disabled={editModal.saving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {editModal.saving && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
