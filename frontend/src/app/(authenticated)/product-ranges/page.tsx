"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { Loader2, Plus, Pencil, Trash2, Search } from "lucide-react";

interface ProductRange {
  id: number;
  name: string;
  description: string | null;
  manufacturer: { id: number; name: string } | null;
  recommendedVersion: string | null;
  currentVersion: string | null;
  releaseDate: string | null;
  endOfSaleDate: string | null;
  endOfSupportDate: string | null;
  endOfLifeDate: string | null;
  pluginSource: string | null;
  createdAt: string;
}

interface Editor { id: number; name: string }

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

export default function ProductRangesPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const [ranges, setRanges] = useState<ProductRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [manufacturers, setManufacturers] = useState<Editor[]>([]);

  // Form
  const [editing, setEditing] = useState<ProductRange | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formManufacturerId, setFormManufacturerId] = useState("");
  const [formRecommendedVersion, setFormRecommendedVersion] = useState("");
  const [formCurrentVersion, setFormCurrentVersion] = useState("");
  const [formReleaseDate, setFormReleaseDate] = useState("");
  const [formEndOfSaleDate, setFormEndOfSaleDate] = useState("");
  const [formEndOfSupportDate, setFormEndOfSupportDate] = useState("");
  const [formEndOfLifeDate, setFormEndOfLifeDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/product-ranges?context=${current.id}`, { credentials: "include" });
    if (res.ok) setRanges(await res.json());
    setLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!current) return;
    (async () => {
      const res = await fetch(`/api/manufacturers?context=${current.id}`, { credentials: "include" });
      if (res.ok) setManufacturers(await res.json());
    })();
  }, [current]);

  const openCreate = () => {
    setEditing(null); setShowForm(true);
    setFormName(""); setFormDescription(""); setFormManufacturerId("");
    setFormRecommendedVersion(""); setFormCurrentVersion("");
    setFormReleaseDate(""); setFormEndOfSaleDate(""); setFormEndOfSupportDate(""); setFormEndOfLifeDate("");
  };

  const openEdit = (r: ProductRange) => {
    setEditing(r); setShowForm(true);
    setFormName(r.name); setFormDescription(r.description ?? "");
    setFormManufacturerId(String(r.manufacturer?.id ?? ""));
    setFormRecommendedVersion(r.recommendedVersion ?? ""); setFormCurrentVersion(r.currentVersion ?? "");
    setFormReleaseDate(r.releaseDate ? r.releaseDate.split("T")[0] : "");
    setFormEndOfSaleDate(r.endOfSaleDate ? r.endOfSaleDate.split("T")[0] : "");
    setFormEndOfSupportDate(r.endOfSupportDate ? r.endOfSupportDate.split("T")[0] : "");
    setFormEndOfLifeDate(r.endOfLifeDate ? r.endOfLifeDate.split("T")[0] : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = {
      name: formName, description: formDescription || null,
      manufacturerId: Number(formManufacturerId) || null,
      recommendedVersion: formRecommendedVersion || null, currentVersion: formCurrentVersion || null,
      releaseDate: formReleaseDate || null, endOfSaleDate: formEndOfSaleDate || null,
      endOfSupportDate: formEndOfSupportDate || null, endOfLifeDate: formEndOfLifeDate || null,
    };
    const url = editing ? `/api/product-ranges/${editing.id}` : `/api/product-ranges?context=${current?.id}`;
    await fetch(url, {
      method: editing ? "PUT" : "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false); setShowForm(false); load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/product-ranges/${id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  const filtered = ranges.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.manufacturer?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : "—";

  const dateStatusClass = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    if (d < now) return "text-red-600 dark:text-red-400";
    const months = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months < 6) return "text-orange-600 dark:text-orange-400";
    if (months < 12) return "text-yellow-600 dark:text-yellow-400";
    return "";
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("productRanges.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("productRanges.subtitle")}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900">
          <Plus className="h-4 w-4" /> {t("productRanges.newRange")}
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input type="text" placeholder={t("productRanges.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-9`} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">{search ? t("productRanges.noResult") : t("productRanges.noRanges")}</div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colName")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colManufacturer")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colRecommendedVersion")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colEndOfSale")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colEndOfSupport")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colEndOfLife")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-400">{t("productRanges.colSource")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.manufacturer?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{r.recommendedVersion ?? "—"}</td>
                  <td className={`px-4 py-3 ${dateStatusClass(r.endOfSaleDate)}`}>{formatDate(r.endOfSaleDate)}</td>
                  <td className={`px-4 py-3 ${dateStatusClass(r.endOfSupportDate)}`}>{formatDate(r.endOfSupportDate)}</td>
                  <td className={`px-4 py-3 ${dateStatusClass(r.endOfLifeDate)}`}>{formatDate(r.endOfLifeDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.pluginSource ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                      {r.pluginSource ?? t("productRanges.manual")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                      <button onClick={() => { if (confirm(t("productRanges.confirmDelete", { name: r.name }))) handleDelete(r.id); }}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editing ? t("productRanges.editRange") : t("productRanges.newRange")}
            </h2>
            <div>
              <label className={labelClass}>{t("productRanges.colName")}</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} required className={inputClass} placeholder={t("productRanges.namePlaceholder")} />
            </div>
            <div>
              <label className={labelClass}>{t("productRanges.colManufacturer")}</label>
              <select value={formManufacturerId} onChange={(e) => setFormManufacturerId(e.target.value)} required className={inputClass}>
                <option value="">—</option>
                {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t("productRanges.colRecommendedVersion")}</label>
                <input type="text" value={formRecommendedVersion} onChange={(e) => setFormRecommendedVersion(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("systemUpdates.currentVersion")}</label>
                <input type="text" value={formCurrentVersion} onChange={(e) => setFormCurrentVersion(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t("systemUpdates.releaseDate")}</label>
                <input type="date" value={formReleaseDate} onChange={(e) => setFormReleaseDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("productRanges.colEndOfSale")}</label>
                <input type="date" value={formEndOfSaleDate} onChange={(e) => setFormEndOfSaleDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("productRanges.colEndOfSupport")}</label>
                <input type="date" value={formEndOfSupportDate} onChange={(e) => setFormEndOfSupportDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t("productRanges.colEndOfLife")}</label>
                <input type="date" value={formEndOfLifeDate} onChange={(e) => setFormEndOfLifeDate(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">{t("common.cancel")}</button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
