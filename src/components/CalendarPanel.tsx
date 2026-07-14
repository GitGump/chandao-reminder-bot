"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Plus, Pencil, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";

interface CalendarEntry {
  id: number;
  year: number;
  month: number;
  iteration_number: string;
  planning_date: string;
  release_date: string;
}

type CalendarFormData = Omit<CalendarEntry, "id">;

const emptyForm: CalendarFormData = {
  year: new Date().getFullYear(),
  month: 1,
  iteration_number: "",
  planning_date: "",
  release_date: "",
};

const YEAR_RANGE = Array.from({ length: 6 }, (_, i) => 2025 + i);

export default function CalendarPanel() {
  const [data, setData] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<CalendarFormData>(emptyForm);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<CalendarFormData>(emptyForm);

  const [csvUploading, setCsvUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<CalendarEntry[]>("/api/calendar");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = data.filter((item) => item.year === yearFilter);

  // ─── Add ────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.iteration_number || !addForm.planning_date || !addForm.release_date) {
      setError("请填写完整的记录信息");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const record: CalendarFormData = {
        year: addForm.year,
        month: addForm.month,
        iteration_number: addForm.iteration_number,
        planning_date: addForm.planning_date,
        release_date: addForm.release_date,
      };
      await apiPost("/api/calendar", record);
      setAddForm({ ...emptyForm, year: yearFilter });
      setAdding(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelAdd = () => {
    setAdding(false);
    setAddForm({ ...emptyForm, year: yearFilter });
    setError(null);
  };

  // ─── Edit ───────────────────────────────────────────
  const startEdit = (item: CalendarEntry) => {
    setEditingId(item.id);
    setEditForm({
      year: item.year,
      month: item.month,
      iteration_number: item.iteration_number,
      planning_date: item.planning_date,
      release_date: item.release_date,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    if (!editForm.iteration_number || !editForm.planning_date || !editForm.release_date) {
      setError("请填写完整的记录信息");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/calendar/${editingId}`, {
        year: editForm.year,
        month: editForm.month,
        iteration_number: editForm.iteration_number,
        planning_date: editForm.planning_date,
        release_date: editForm.release_date,
      });
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await apiDelete(`/api/calendar/${id}`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  // ─── CSV Upload ─────────────────────────────────────
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/calendar/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "导入失败" }));
        throw new Error(err.error || `导入失败: ${res.status}`);
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV 导入失败");
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // ─── Render helpers ─────────────────────────────────
  const thClass = "px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-100";
  const tdClass = "px-3 py-2.5 text-sm text-gray-700";
  const inputClass =
    "w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";
  const selectClass =
    "rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">年份筛选：</label>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
            className={selectClass}
          >
            {YEAR_RANGE.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setAddForm({ ...emptyForm, year: yearFilter });
              setAdding(true);
              setEditingId(null);
              setError(null);
            }}
            disabled={adding}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={16} />
            添加记录
          </button>

          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded bg-green-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors ${
              csvUploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload size={16} />
            {csvUploading ? "导入中..." : "CSV 导入"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
              disabled={csvUploading}
            />
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-gray-500">加载中...</div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass}>年份</th>
                <th className={thClass}>月份</th>
                <th className={thClass}>迭代编号</th>
                <th className={thClass}>规划会日期</th>
                <th className={thClass}>发版日期</th>
                <th className={thClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {/* Add row */}
              {adding && (
                <tr className="bg-blue-50/50">
                  <td className={tdClass}>
                    <select
                      value={addForm.year}
                      onChange={(e) => setAddForm({ ...addForm, year: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {YEAR_RANGE.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={tdClass}>
                    <select
                      value={addForm.month}
                      onChange={(e) => setAddForm({ ...addForm, month: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m}月
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={tdClass}>
                    <input
                      type="text"
                      value={addForm.iteration_number}
                      onChange={(e) =>
                        setAddForm({ ...addForm, iteration_number: e.target.value })
                      }
                      className={inputClass}
                      placeholder="如: V1.0.0"
                    />
                  </td>
                  <td className={tdClass}>
                    <input
                      type="date"
                      value={addForm.planning_date}
                      onChange={(e) =>
                        setAddForm({ ...addForm, planning_date: e.target.value })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className={tdClass}>
                    <input
                      type="date"
                      value={addForm.release_date}
                      onChange={(e) =>
                        setAddForm({ ...addForm, release_date: e.target.value })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleAdd}
                        disabled={saving}
                        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                      <button
                        onClick={handleCancelAdd}
                        disabled={saving}
                        className="rounded bg-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-400 disabled:opacity-50"
                      >
                        取消
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {filteredData.length === 0 && !adding && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-400">
                    暂无数据
                  </td>
                </tr>
              )}

              {filteredData.map((item, idx) => {
                const isEditing = editingId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                  >
                    {isEditing ? (
                      <>
                        <td className={tdClass}>
                          <select
                            value={editForm.year}
                            onChange={(e) =>
                              setEditForm({ ...editForm, year: Number(e.target.value) })
                            }
                            className={selectClass}
                          >
                            {YEAR_RANGE.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={tdClass}>
                          <select
                            value={editForm.month}
                            onChange={(e) =>
                              setEditForm({ ...editForm, month: Number(e.target.value) })
                            }
                            className={selectClass}
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                              <option key={m} value={m}>
                                {m}月
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={tdClass}>
                          <input
                            type="text"
                            value={editForm.iteration_number}
                            onChange={(e) =>
                              setEditForm({ ...editForm, iteration_number: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className={tdClass}>
                          <input
                            type="date"
                            value={editForm.planning_date}
                            onChange={(e) =>
                              setEditForm({ ...editForm, planning_date: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className={tdClass}>
                          <input
                            type="date"
                            value={editForm.release_date}
                            onChange={(e) =>
                              setEditForm({ ...editForm, release_date: e.target.value })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? "保存中..." : "保存"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded bg-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-400 disabled:opacity-50"
                            >
                              取消
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={tdClass}>{item.year}</td>
                        <td className={tdClass}>{item.month}月</td>
                        <td className={tdClass}>{item.iteration_number}</td>
                        <td className={tdClass}>{item.planning_date}</td>
                        <td className={tdClass}>{item.release_date}</td>
                        <td className={tdClass}>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => startEdit(item)}
                              disabled={adding || editingId !== null || saving}
                              className="rounded p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-30 transition-colors"
                              title="编辑"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`确认删除迭代 ${item.iteration_number}？`)) {
                                  handleDelete(item.id);
                                }
                              }}
                              disabled={deletingId === item.id}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
                              title="删除"
                            >
                              {deletingId === item.id ? (
                                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
