"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Check,
} from "lucide-react";

/* ──────────────────── 类型定义 ──────────────────── */

interface Member {
  id: number;
  message_type: number;
  member_name: string;
}

/* ──────────────────── 静态数据 ──────────────────── */

const MESSAGE_TYPE_LABELS: Record<number, string> = {
  1: "规划会提醒",
  2: "全员进度更新",
  3: "发版后状态更新",
  4: "部门进度更新",
};

const MESSAGE_TYPES = [1, 2, 3, 4];

/* ──────────────────── 组件 ──────────────────── */

export default function MembersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  /* 编辑状态 */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  /* 添加状态 */
  const [adding, setAdding] = useState<Record<number, { name: string; adding: boolean }>>(
    {}
  );

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

  /* 删除确认弹窗 */
  const [deleteConfirm, setDeleteConfirm] = useState<Member | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeletePending(true);
    try {
      await apiDelete(`/api/members?id=${deleteConfirm.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== deleteConfirm.id));
      showToast("success", "成员已删除");
    } catch {
      showToast("error", "删除成员失败");
    } finally {
      setDeletePending(false);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, showToast]);

  /* ==================== API 调用 ==================== */

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<Member[]>("/api/members");
      setMembers(data);
    } catch {
      showToast("error", "加载成员列表失败");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  /* ==================== 增删改 ==================== */

  const startAdd = (messageType: number) => {
    setAdding((prev) => ({
      ...prev,
      [messageType]: { name: "", adding: false },
    }));
  };

  const cancelAdd = (messageType: number) => {
    setAdding((prev) => {
      const next = { ...prev };
      delete next[messageType];
      return next;
    });
  };

  const handleAdd = async (messageType: number) => {
    const draft = adding[messageType];
    if (!draft || !draft.name.trim()) return;
    setAdding((prev) => ({
      ...prev,
      [messageType]: { ...prev[messageType], adding: true },
    }));
    try {
      const created = await apiPost<Member>("/api/members", {
        message_type: messageType,
        member_name: draft.name.trim(),
      });
      setMembers((prev) => [...prev, created]);
      showToast("success", "成员已添加");
      cancelAdd(messageType);
    } catch {
      showToast("error", "添加成员失败");
      setAdding((prev) => ({
        ...prev,
        [messageType]: { ...prev[messageType], adding: false },
      }));
    }
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditName(member.member_name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (member: Member) => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      await apiPut(`/api/members`, {
        id: member.id,
        member_name: editName.trim(),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id
            ? { ...m, member_name: editName.trim() }
            : m
        )
      );
      showToast("success", "成员已更新");
      cancelEdit();
    } catch {
      showToast("error", "更新成员失败");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = (member: Member) => {
    setDeleteConfirm(member);
  };

  /* ==================== 渲染辅助 ==================== */

  const getMembersByType = (type: number) =>
    members.filter((m) => m.message_type === type);

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

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-16">
          <Loader2 size={20} className="animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">加载中...</span>
        </div>
      ) : (
        MESSAGE_TYPES.map((type) => {
          const typeMembers = getMembersByType(type);
          const isAdding = !!adding[type];
          const addState = adding[type];

          return (
            <section
              key={type}
              className="rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              {/* Section Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800">
                    {MESSAGE_TYPE_LABELS[type]}
                  </h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {typeMembers.length}
                  </span>
                </div>
                {!isAdding && (
                  <button
                    onClick={() => startAdd(type)}
                    className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
                  >
                    <Plus size={14} />
                    添加成员
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500">
                      <th className="px-5 py-2">成员姓名</th>
                      <th className="w-24 px-5 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeMembers.length === 0 && !isAdding ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-5 py-8 text-center text-sm text-gray-400"
                        >
                          暂无成员，点击「添加成员」添加
                        </td>
                      </tr>
                    ) : (
                      <>
                        {typeMembers.map((member) => (
                          <tr
                            key={member.id}
                            className="border-b border-gray-50 text-sm transition-colors hover:bg-gray-50/50"
                          >
                            {editingId === member.id ? (
                              <>
                                <td className="px-5 py-2.5">
                                  <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) =>
                                      setEditName(e.target.value)
                                    }
                                    className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    autoFocus
                                  />
                                </td>
                                <td className="px-5 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => saveEdit(member)}
                                      disabled={editSaving}
                                      className="rounded p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
                                      title="保存"
                                    >
                                      {editSaving ? (
                                        <Loader2
                                          size={14}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Check size={14} />
                                      )}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      disabled={editSaving}
                                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                      title="取消"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-5 py-2.5 font-medium text-gray-800">
                                  {member.member_name}
                                </td>
                                <td className="px-5 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => startEdit(member)}
                                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                      title="编辑"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(member)}
                                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                      title="删除"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}

                        {/* Add Row */}
                        {isAdding && (
                          <tr className="border-b border-blue-50 bg-blue-50/30">
                            <td className="px-5 py-2.5">
                              <input
                                type="text"
                                value={addState.name}
                                onChange={(e) =>
                                  setAdding((prev) => ({
                                    ...prev,
                                    [type]: { ...prev[type], name: e.target.value },
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAdd(type);
                                }}
                                placeholder="成员姓名"
                                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                autoFocus
                              />
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleAdd(type)}
                                  disabled={
                                    addState.adding ||
                                    !addState.name.trim()
                                  }
                                  className="rounded p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
                                  title="确认添加"
                                >
                                  {addState.adding ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                </button>
                                <button
                                  onClick={() => cancelAdd(type)}
                                  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                  title="取消"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      {/* ────── 删除确认弹窗 ────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-3">
              <h4 className="font-semibold text-gray-800">确认删除</h4>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              确定删除成员「<span className="font-medium text-gray-800">{deleteConfirm.member_name}</span>」？
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deletePending}
                className="rounded-md px-4 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletePending}
                className="rounded-md bg-red-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {deletePending ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
