"use client";

import { useState } from "react";
import { X, Loader2, Link2, ChevronRight } from "lucide-react";

interface Device {
  id: string;
  name: string;
  nodeIp: string | null;
  nodeHostname: string | null;
  nodeManufacturer: string | null;
  chassisId: string | null;
  mgmtAddress: string | null;
  isExternal: boolean;
}

interface ManualLinkCreatorProps {
  mapId: number;
  devices: Device[];
  onCreated: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export default function ManualLinkCreator({ mapId, devices, onCreated, onClose, t }: ManualLinkCreatorProps) {
  const [sourceDeviceId, setSourceDeviceId] = useState("");
  const [targetDeviceId, setTargetDeviceId] = useState("");
  const [sourcePort, setSourcePort] = useState("");
  const [targetPort, setTargetPort] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!sourceDeviceId || !targetDeviceId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${mapId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDeviceId: Number(sourceDeviceId),
          targetDeviceId: Number(targetDeviceId),
          sourcePort: sourcePort || null,
          targetPort: targetPort || null,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("topology.createManualLink")}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Source device */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t("topology.manualLinkSource")}
            </label>
            <select value={sourceDeviceId} onChange={(e) => { setSourceDeviceId(e.target.value); setSourcePort(""); }} className={inputCls}>
              <option value="">{t("topology.selectDevice")}</option>
              {devices.filter((d) => !d.isExternal).map((d) => (
                <option key={d.id} value={d.id}>{d.name} {d.nodeIp ? `(${d.nodeIp})` : ""}</option>
              ))}
              {devices.filter((d) => d.isExternal).length > 0 && (
                <optgroup label={t("topology.externalDevices")}>
                  {devices.filter((d) => d.isExternal).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Source port */}
          {sourceDeviceId && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("topology.manualLinkSourcePort")}
              </label>
              <input type="text" value={sourcePort} onChange={(e) => setSourcePort(e.target.value)} placeholder={t("topology.portPlaceholder")} className={inputCls} />
            </div>
          )}

          {/* Arrow */}
          {sourceDeviceId && <div className="flex justify-center"><ChevronRight className="h-5 w-5 text-slate-300 rotate-90" /></div>}

          {/* Target device */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t("topology.manualLinkTarget")}
            </label>
            <select value={targetDeviceId} onChange={(e) => { setTargetDeviceId(e.target.value); setTargetPort(""); }} className={inputCls}>
              <option value="">{t("topology.selectDevice")}</option>
              {devices.filter((d) => d.id !== sourceDeviceId && !d.isExternal).map((d) => (
                <option key={d.id} value={d.id}>{d.name} {d.nodeIp ? `(${d.nodeIp})` : ""}</option>
              ))}
              {devices.filter((d) => d.id !== sourceDeviceId && d.isExternal).length > 0 && (
                <optgroup label={t("topology.externalDevices")}>
                  {devices.filter((d) => d.id !== sourceDeviceId && d.isExternal).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Target port */}
          {targetDeviceId && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("topology.manualLinkTargetPort")}
              </label>
              <input type="text" value={targetPort} onChange={(e) => setTargetPort(e.target.value)} placeholder={t("topology.portPlaceholder")} className={inputCls} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !sourceDeviceId || !targetDeviceId}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {t("topology.createLink")}
          </button>
        </div>
      </div>
    </div>
  );
}
