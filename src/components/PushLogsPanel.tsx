"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

/* ──────────────────── 类型定义 ──────────────────── */

interface PushLog {
  id: number;
  message_type: number;
  iteration_number: string;
  content: string;
  status: string;
  retry_count: number;
  push_source: string;
  error_message: string | null;
  pushed_at: string;
  completed_at: string | null;
}

/* ──────────────────── 静态数据 ──────────────────── */

const MESSAGE_TYPE_LABELS: Record<number, string> = {
  1: "规划会提醒",
  2: "进度更新提醒",
  3: "发版后状态更新提醒",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  success: {
    label: "成功",
    className: "bg-green-100 text-green-700",
  },
  failed: {
    label: "失败",
    className: "bg-red-100 text-red-700",
  },
  preview: {
    label: "预览",
    className: "bg-blue-100 text-blue-700",
  },
  retrying: {
    label: "重试中",
    className: "bg-yellow-100 text-yellow-700",
  },
};

/* ──────────────────── 组件 ──────────────────── */

export default function PushLogsPanel() {
  /* 数据 */
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [loading, setLoading] = useState(true);

  /* 过滤 */
  const [filterMessageType, setFilterMessageType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  /* 详情模态框 */
  const [detailLog, setDetailLog] = useState<PushLog | null>(null);

  /* 重试状态 */
  const [retryingId, setRetryingId] = useState<number | null>(null);

  /* Toast */
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

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterMessageType) params.set("message_type", filterMessageType);
      if (filterStatus) params.set("status", filterStatus);
      if (filterDateFrom) params.set("from", filterDateFrom);
      if (filterDateTo) params.set("to", filterDateTo);

      const qs = params.toString();
      const url = `/api/push-logs${qs ? `?${qs}` : ""}`;
      const result = await apiGet<{ logs: PushLog[]; total: number }>(url);
      setLogs(result.logs);
    } catch {
      showToast("error", "加载推送日志失败");
    } finally {
      setLoading(false);
    }
  }, [filterMessageType, filterStatus, filterDateFrom, filterDateTo, showToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  /* ==================== 重试 ==================== */

  const handleRetry = async (log: PushLog) => {
    setRetryingId(log.id);
    try {
      await apiPost(`/api/push-logs/${log.id}/retry`);
      showToast("success", "已发起重试");
      fetchLogs();
    } catch {
      showToast("error", "重试失败");
    } finally {
      setRetryingId(null);
    }
  };

  /* ==================== 渲染辅助 ==================== */

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const badge = (status: string) => {
    const cfg = STATUS_CONFIG[status];
    if (!cfg) return <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{status}</span>;
    return (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  };

  /* ==================== 渲染 ==================== */

  return (
    <div className="space-y-4">
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

      {/* ────── 过滤栏 ────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {/* Message Type */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            消息类型
          </label>
          <select
            value={filterMessageType}
            onChange={(e) => setFilterMessageType(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">全部</option>
            {Object.entries(MESSAGE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            状态
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">全部</option>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>
                {cfg.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            开始日期
          </label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            结束日期
          </label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Clear Filters */}
        {(filterMessageType || filterStatus || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => {
              setFilterMessageType("");
              setFilterStatus("");
              setFilterDateFrom("");
              setFilterDateTo("");
            }}
            className="rounded-md px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* ────── 表格 ────── */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">加载中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">消息类型</th>
                  <th className="px-4 py-3">迭代</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="px-4 py-3">重试次数</th>
                  <th className="px-4 py-3">推送时间</th>
                  <th className="w-20 px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-16 text-center text-sm text-gray-400"
                    >
                      暂无推送日志
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="cursor-pointer border-b border-gray-50 text-sm transition-colors hover:bg-gray-50/50"
                      onClick={() => setDetailLog(log)}
                    >
                      <td className="px-4 py-3 text-gray-700">
                        {MESSAGE_TYPE_LABELS[log.message_type] || `类型${log.message_type}`}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {log.iteration_number}
                      </td>
                      <td className="px-4 py-3">{badge(log.status)}</td>
                      <td className="px-4 py-3">
                        {log.push_source === "manual" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            手动
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            自动
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.retry_count}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(log.pushed_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {log.status === "failed" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetry(log);
                              }}
                              disabled={retryingId === log.id}
                              className="rounded p-1.5 text-orange-500 transition-colors hover:bg-orange-50 disabled:opacity-50"
                              title="重试"
                            >
                              {retryingId === log.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                            </button>
                          )}
                          <ChevronRight size={14} className="text-gray-300" />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ────── 详情模态框 ────── */}
      {detailLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDetailLog(null)}
        >
          <div
            className="w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-800">
                推送详情
              </h3>
              <button
                onClick={() => setDetailLog(null)}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">消息类型：</span>
                  <span className="font-medium text-gray-800">
                    {MESSAGE_TYPE_LABELS[detailLog.message_type] || `类型${detailLog.message_type}`}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">迭代：</span>
                  <span className="font-mono font-medium text-gray-800">
                    {detailLog.iteration_number}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">状态：</span>
                  {badge(detailLog.status)}
                </div>
                <div>
                  <span className="text-gray-500">来源：</span>
                  <span className="font-medium text-gray-800">
                    {detailLog.push_source === "manual" ? "手动推送" : "自动推送"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">重试次数：</span>
                  <span className="font-medium text-gray-800">
                    {detailLog.retry_count}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">推送时间：</span>
                  <span className="text-gray-700">
                    {formatDate(detailLog.pushed_at)}
                  </span>
                </div>
                {detailLog.completed_at && (
                  <div>
                    <span className="text-gray-500">完成时间：</span>
                    <span className="text-gray-700">
                      {formatDate(detailLog.completed_at)}
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">
                  推送内容
                </h4>
                <pre className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                  {detailLog.content}
                </pre>
              </div>

              {/* Error */}
              {detailLog.error_message && (
                <div>
                  <h4 className="mb-1 text-xs font-medium text-red-500">
                    错误信息
                  </h4>
                  <pre className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-700">
                    {detailLog.error_message}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
              <div>
                {detailLog.status === "failed" && (
                  <button
                    onClick={() => handleRetry(detailLog)}
                    disabled={retryingId === detailLog.id}
                    className="flex items-center gap-1.5 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                  >
                    {retryingId === detailLog.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    重新推送
                  </button>
                )}
              </div>
              <button
                onClick={() => setDetailLog(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
