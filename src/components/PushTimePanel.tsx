"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Clock, Bot, Check, X, RefreshCw, Loader2, Bell, Eye } from "lucide-react";

type PushTimeConfig = {
  id: number;
  message_type: number;
  robot_id: number;
  hour: number;
  minute: number;
  is_active: boolean;
};

type Robot = {
  id: number;
  name: string;
  webhook_url: string;
};

type NextPushTime = {
  message_type: number;
  next_time: string;
  iteration: string;
};

type PreviewConfig = {
  enabled: boolean;
  preview_lead_minutes: number;
};

const MESSAGE_TYPE_LABELS: Record<number, string> = {
  1: "规划会提醒",
  2: "进度更新提醒",
  3: "发版后状态更新提醒",
};

const MESSAGE_TYPE_ICONS: Record<number, typeof Clock> = {
  1: Clock,
  2: Clock,
  3: Bell,
};

export default function PushTimePanel() {
  const [configs, setConfigs] = useState<PushTimeConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { robot_id: number; hour: number; minute: number; is_active: boolean }>>({});
  const [nextPushTimes, setNextPushTimes] = useState<NextPushTime[]>([]);
  const [previewConfig, setPreviewConfig] = useState<PreviewConfig>({ enabled: false, preview_lead_minutes: 60 });
  const [previewDraft, setPreviewDraft] = useState<{ enabled: boolean; preview_lead_minutes: number }>({ enabled: false, preview_lead_minutes: 60 });
  const [robots, setRobots] = useState<Robot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [pushing, setPushing] = useState<Record<number, boolean>>({});
  const [pushResult, setPushResult] = useState<Record<number, { success: boolean; content: string } | null>>({});
  const [previewing, setPreviewing] = useState<Record<number, boolean>>({});
  const [previewData, setPreviewData] = useState<Record<number, { content: string; iteration: string; chanzhou_num: number } | null>>({});
  const [savingPreview, setSavingPreview] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [configsData, nextTimesData, previewData, robotsData] = await Promise.all([
        apiGet<PushTimeConfig[]>("/api/push-time"),
        apiGet<NextPushTime[]>("/api/next-push-times"),
        apiGet<PreviewConfig>("/api/preview-config"),
        apiGet<Robot[]>("/api/robot"),
      ]);
      setConfigs(configsData);
      // Initialize drafts from configs
      const initDrafts: Record<number, { robot_id: number; hour: number; minute: number; is_active: boolean }> = {};
      for (const c of configsData) {
        initDrafts[c.message_type] = {
          robot_id: c.robot_id,
          hour: c.hour,
          minute: c.minute,
          is_active: c.is_active,
        };
      }
      setDrafts(initDrafts);
      setNextPushTimes(nextTimesData);
      setPreviewConfig(previewData);
      setPreviewDraft({ enabled: previewData.enabled, preview_lead_minutes: previewData.preview_lead_minutes });
      setRobots(robotsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const getConfigByType = (messageType: number) => configs.find((c) => c.message_type === messageType);

  const getNextPushTime = (messageType: number) =>
    nextPushTimes.find((n) => n.message_type === messageType);

  const handleDraftChange = (
    messageType: number,
    field: "robot_id" | "hour" | "minute" | "is_active",
    value: number | boolean
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [messageType]: { ...prev[messageType], [field]: value },
    }));
  };

  const handleSave = async (messageType: number) => {
    const draft = drafts[messageType];
    if (!draft) return;

    const config = getConfigByType(messageType);
    if (!config) return;

    setSaving((prev) => ({ ...prev, [messageType]: true }));
    try {
      await saveDraftToApi(messageType, config.id, draft);
      setRefreshMsg(`✅ ${MESSAGE_TYPE_LABELS[messageType]} 已保存`);
      setTimeout(() => setRefreshMsg(""), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving((prev) => ({ ...prev, [messageType]: false }));
    }
  };

  // Shared helper: save draft to API and update local configs
  const saveDraftToApi = async (
    messageType: number,
    configId: number,
    draft: { robot_id: number; hour: number; minute: number; is_active: boolean }
  ) => {
    await apiPost("/api/push-time", {
      id: configId,
      message_type: messageType,
      robot_id: Number(draft.robot_id),
      hour: Number(draft.hour),
      minute: Number(draft.minute),
      is_active: draft.is_active,
    });
    setConfigs((prev) =>
      prev.map((c) =>
        c.message_type === messageType
          ? { ...c, robot_id: Number(draft.robot_id), hour: Number(draft.hour), minute: Number(draft.minute), is_active: draft.is_active }
          : c
      )
    );
  };

  const handleManualPush = async (messageType: number) => {
    const config = getConfigByType(messageType);
    if (!config) return;

    const draft = drafts[messageType];
    if (!draft) return;

    setPushing((prev) => ({ ...prev, [messageType]: true }));
    setPushResult((prev) => ({ ...prev, [messageType]: null }));
    try {
      // 先保存当前草稿，确保推送使用最新选择的机器人
      await saveDraftToApi(messageType, config.id, draft);
      const result = await apiPost("/api/push-now", { message_type: messageType });
      setPushResult((prev) => ({ ...prev, [messageType]: { success: true, content: JSON.stringify(result) } }));
      setRefreshMsg(`✅ 手动推送 ${MESSAGE_TYPE_LABELS[messageType]} 成功`);
    } catch (e: unknown) {
      setPushResult((prev) => ({ ...prev, [messageType]: { success: false, content: e instanceof Error ? e.message : "推送失败" } }));
    } finally {
      setPushing((prev) => ({ ...prev, [messageType]: false }));
      setTimeout(() => setRefreshMsg(""), 2000);
    }
  };

  const handlePreview = async (messageType: number) => {
    setPreviewing((prev) => ({ ...prev, [messageType]: true }));
    setPreviewData((prev) => ({ ...prev, [messageType]: null }));
    try {
      const result = await apiPost<{ content: string; iteration: string; chanzhou_num: number }>(
        "/api/trigger/manual",
        { message_type: messageType }
      );
      setPreviewData((prev) => ({ ...prev, [messageType]: result }));
    } catch (e: unknown) {
      setPreviewData((prev) => ({
        ...prev,
        [messageType]: { content: `预览失败: ${e instanceof Error ? e.message : "未知错误"}`, iteration: "", chanzhou_num: 0 },
      }));
    } finally {
      setPreviewing((prev) => ({ ...prev, [messageType]: false }));
    }
  };

  const handlePreviewSave = async () => {
    setSavingPreview(true);
    try {
      await apiPost("/api/preview-config", {
        enabled: previewDraft.enabled,
        preview_lead_minutes: Number(previewDraft.preview_lead_minutes),
      });
      setPreviewConfig({
        enabled: previewDraft.enabled,
        preview_lead_minutes: Number(previewDraft.preview_lead_minutes),
      });
      setRefreshMsg("✅ 预览配置已保存");
      setTimeout(() => setRefreshMsg(""), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存预览配置失败");
    } finally {
      setSavingPreview(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchAll}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          <RefreshCw size={16} />
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh message */}
      {refreshMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {refreshMsg}
        </div>
      )}

      {/* Three message type cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {[1, 2, 3].map((messageType) => {
          const config = getConfigByType(messageType);
          const draft = drafts[messageType];
          const nextPush = getNextPushTime(messageType);
          const isSaving = saving[messageType] || false;
          const IconComp = MESSAGE_TYPE_ICONS[messageType];

          if (!config || !draft) return null;

          return (
            <div
              key={messageType}
              className="rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Card Header */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    messageType === 1 && "bg-blue-100 text-blue-600",
                    messageType === 2 && "bg-amber-100 text-amber-600",
                    messageType === 3 && "bg-purple-100 text-purple-600"
                  )}
                >
                  <IconComp size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {MESSAGE_TYPE_LABELS[messageType]}
                  </h3>
                  <p className="text-xs text-gray-500">消息类型 {messageType}</p>
                </div>
                {/* Active badge */}
                <div className="ml-auto">
                  {draft.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <Check size={12} />
                      启用
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                      <X size={12} />
                      停用
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="space-y-4 px-5 py-4">
                {/* Robot selector */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Bot size={14} />
                    推送机器人
                  </label>
                  <select
                    value={draft.robot_id}
                    onChange={(e) =>
                      handleDraftChange(messageType, "robot_id", Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={0} disabled>
                      请选择机器人
                    </option>
                    {robots.map((robot) => (
                      <option key={robot.id} value={robot.id}>
                        {robot.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time input */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Clock size={14} />
                    推送时间
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={draft.hour}
                      onChange={(e) =>
                        handleDraftChange(messageType, "hour", Number(e.target.value))
                      }
                      className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="时"
                    />
                    <span className="text-lg font-medium text-gray-400">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={draft.minute}
                      onChange={(e) =>
                        handleDraftChange(messageType, "minute", Number(e.target.value))
                      }
                      className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="分"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">启用推送</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.is_active}
                    onClick={() =>
                      handleDraftChange(messageType, "is_active", !draft.is_active)
                    }
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                      draft.is_active ? "bg-blue-600" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        draft.is_active ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Next push time */}
                <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                  <p className="text-xs text-gray-500">下次推送时间</p>
                  {nextPush ? (
                    <p className="mt-0.5 text-sm font-medium text-gray-900">
                      {nextPush.next_time}
                      {nextPush.iteration && (
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          （{nextPush.iteration}）
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-gray-400">暂无推送计划</p>
                  )}
                </div>

                {/* Save + Manual push buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(messageType)}
                    disabled={isSaving}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
                      isSaving
                        ? "cursor-not-allowed bg-blue-400"
                        : "bg-blue-600 hover:bg-blue-700"
                    )}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        保存配置
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleManualPush(messageType)}
                    disabled={pushing[messageType]}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
                      pushing[messageType]
                        ? "cursor-not-allowed bg-emerald-400"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    title="立即推送消息到群"
                  >
                    {pushing[messageType] ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        推送中...
                      </>
                    ) : (
                      <>
                        <Bell size={16} />
                        手动推送
                      </>
                    )}
                  </button>
                </div>

                {/* Message Preview */}
                <div className="border-t border-gray-100 pt-3">
                  <button
                    onClick={() => handlePreview(messageType)}
                    disabled={previewing[messageType]}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      previewing[messageType]
                        ? "cursor-not-allowed bg-gray-100 text-gray-400"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    )}
                    title="预览此消息类型将推送的内容"
                  >
                    {previewing[messageType] ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        预览中...
                      </>
                    ) : (
                      <>
                        <Eye size={14} />
                        消息预览
                      </>
                    )}
                  </button>
                  {previewData[messageType] && (
                    <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      {previewData[messageType]!.iteration && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-blue-700">目标迭代:</span>
                          <span className="rounded bg-blue-200 px-1.5 py-0.5 font-mono text-blue-800">
                            {previewData[messageType]!.iteration}
                          </span>
                          <span className="text-blue-500">
                            (禅道编号: {previewData[messageType]!.chanzhou_num})
                          </span>
                        </div>
                      )}
                      <div className="rounded bg-white p-2 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap break-all">
                        {previewData[messageType]!.content}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview config section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
            <Bell size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">预演模式配置</h3>
            <p className="text-xs text-gray-500">提前预览推送消息内容</p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">启用预演模式</p>
              <p className="text-xs text-gray-500">开启后将在推送时间前提早发送预演消息</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={previewDraft.enabled}
              onClick={() =>
                setPreviewDraft((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                previewDraft.enabled ? "bg-teal-600" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  previewDraft.enabled ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Lead minutes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              提前分钟数
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1440}
                value={previewDraft.preview_lead_minutes}
                onChange={(e) =>
                  setPreviewDraft((prev) => ({
                    ...prev,
                    preview_lead_minutes: Number(e.target.value),
                  }))
                }
                disabled={!previewDraft.enabled}
                className={cn(
                  "w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500",
                  !previewDraft.enabled && "cursor-not-allowed bg-gray-100 text-gray-400"
                )}
              />
              <span className="text-sm text-gray-500">分钟</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              在正式推送时间前 {previewDraft.preview_lead_minutes} 分钟发送预演消息
            </p>
          </div>

          {/* Save button */}
          <button
            onClick={handlePreviewSave}
            disabled={savingPreview}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
              savingPreview
                ? "cursor-not-allowed bg-teal-400"
                : "bg-teal-600 hover:bg-teal-700"
            )}
          >
            {savingPreview ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Check size={16} />
                保存预演配置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
