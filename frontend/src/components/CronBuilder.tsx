"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, ChevronDown } from "lucide-react";

interface CronBuilderProps {
  value: string;
  onChange: (value: string) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

type CronMode = "preset" | "custom";

interface PresetOption {
  label: string;
  cron: string;
  key: string;
}

const PRESETS: PresetOption[] = [
  { key: "everyHour", label: "", cron: "0 * * * *" },
  { key: "everyDay2am", label: "", cron: "0 2 * * *" },
  { key: "everyDay6am", label: "", cron: "0 6 * * *" },
  { key: "everyDay12pm", label: "", cron: "0 12 * * *" },
  { key: "everyDay8pm", label: "", cron: "0 20 * * *" },
  { key: "everyMonday2am", label: "", cron: "0 2 * * 1" },
  { key: "everyFriday6pm", label: "", cron: "0 18 * * 5" },
  { key: "every1stOfMonth", label: "", cron: "0 2 1 * *" },
  { key: "every15min", label: "", cron: "*/15 * * * *" },
  { key: "every30min", label: "", cron: "*/30 * * * *" },
  { key: "every6hours", label: "", cron: "0 */6 * * *" },
  { key: "every12hours", label: "", cron: "0 */12 * * *" },
  { key: "weekdays9am", label: "", cron: "0 9 * * 1-5" },
];

const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = [
  { value: 1, key: "jan" },
  { value: 2, key: "feb" },
  { value: 3, key: "mar" },
  { value: 4, key: "apr" },
  { value: 5, key: "may" },
  { value: 6, key: "jun" },
  { value: 7, key: "jul" },
  { value: 8, key: "aug" },
  { value: 9, key: "sep" },
  { value: 10, key: "oct" },
  { value: 11, key: "nov" },
  { value: 12, key: "dec" },
];
const DAYS_OF_WEEK = [
  { value: 0, key: "sun" },
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
];

function describeCron(cron: string, t: (k: string, p?: Record<string, string>) => string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [min, hour, dom, mon, dow] = parts;

  // Check presets first
  for (const preset of PRESETS) {
    if (preset.cron === cron) return t(`cron.${preset.key}`);
  }

  // Simple patterns
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return t("cron.everyMinute");
  }

  const pieces: string[] = [];

  // Minute
  if (min.startsWith("*/")) {
    pieces.push(t("cron.everyNMin", { n: min.slice(2) }));
  } else if (min !== "*" && min !== "0") {
    pieces.push(t("cron.atMinute", { min }));
  }

  // Hour
  if (hour.startsWith("*/")) {
    pieces.push(t("cron.everyNHours", { n: hour.slice(2) }));
  } else if (hour !== "*") {
    const h = hour.padStart(2, "0");
    const m = (min === "*" ? "00" : min).padStart(2, "0");
    pieces.push(t("cron.atTime", { time: `${h}:${m}` }));
  }

  // Day of month
  if (dom !== "*") {
    pieces.push(t("cron.onDay", { day: dom }));
  }

  // Month
  if (mon !== "*") {
    pieces.push(t("cron.inMonth", { month: mon }));
  }

  // Day of week
  if (dow !== "*") {
    const dayNames: Record<string, string> = {
      "0": t("cron.sun"), "1": t("cron.mon"), "2": t("cron.tue"),
      "3": t("cron.wed"), "4": t("cron.thu"), "5": t("cron.fri"), "6": t("cron.sat"),
      "7": t("cron.sun"),
    };
    if (dow.includes("-")) {
      const [from, to] = dow.split("-");
      pieces.push(`${dayNames[from] || from} - ${dayNames[to] || to}`);
    } else if (dow.includes(",")) {
      const days = dow.split(",").map((d) => dayNames[d] || d).join(", ");
      pieces.push(days);
    } else {
      pieces.push(dayNames[dow] || dow);
    }
  }

  return pieces.join(", ") || cron;
}

export default function CronBuilder({ value, onChange, t }: CronBuilderProps) {
  const [mode, setMode] = useState<CronMode>("preset");
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Custom builder state
  const [minute, setMinute] = useState("0");
  const [minuteMode, setMinuteMode] = useState<"specific" | "every" | "interval">("specific");
  const [minuteInterval, setMinuteInterval] = useState("15");
  const [hour, setHour] = useState("2");
  const [hourMode, setHourMode] = useState<"specific" | "every" | "interval">("specific");
  const [hourInterval, setHourInterval] = useState("6");
  const [dom, setDom] = useState("*");
  const [mon, setMon] = useState("*");
  const [dow, setDow] = useState("*");

  // Parse existing value into custom builder state
  useEffect(() => {
    if (!value) return;
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 5) return;

    const [minPart, hourPart, domPart, monPart, dowPart] = parts;

    if (minPart === "*") {
      setMinuteMode("every");
      setMinute("0");
    } else if (minPart.startsWith("*/")) {
      setMinuteMode("interval");
      setMinuteInterval(minPart.slice(2));
    } else {
      setMinuteMode("specific");
      setMinute(minPart);
    }

    if (hourPart === "*") {
      setHourMode("every");
      setHour("0");
    } else if (hourPart.startsWith("*/")) {
      setHourMode("interval");
      setHourInterval(hourPart.slice(2));
    } else {
      setHourMode("specific");
      setHour(hourPart);
    }

    setDom(domPart);
    setMon(monPart);
    setDow(dowPart);

    // If it matches a preset, stay in preset mode
    const isPreset = PRESETS.some((p) => p.cron === value.trim());
    if (!isPreset && value.trim() !== "") {
      setMode("custom");
    }
  }, []); // Only on mount

  // Build cron from custom state
  const buildCron = useCallback((): string => {
    const m = minuteMode === "every" ? "*" : minuteMode === "interval" ? `*/${minuteInterval}` : minute;
    const h = hourMode === "every" ? "*" : hourMode === "interval" ? `*/${hourInterval}` : hour;
    return `${m} ${h} ${dom} ${mon} ${dow}`;
  }, [minute, minuteMode, minuteInterval, hour, hourMode, hourInterval, dom, mon, dow]);

  const applyCustom = useCallback(() => {
    onChange(buildCron());
  }, [buildCron, onChange]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const smallBtnClass = "px-2 py-1 text-xs rounded-md transition-colors";

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {/* Display current value + toggle */}
      <div
        className="flex items-center gap-2 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 transition-colors hover:border-slate-300 dark:hover:border-slate-600"
        onClick={() => setExpanded(!expanded)}
      >
        <Clock className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          {value ? (
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-slate-900 dark:text-slate-100">{value}</code>
              <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{describeCron(value, t)}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400 dark:text-slate-500">{t("cron.selectSchedule")}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded builder */}
      {expanded && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
          {/* Mode tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode("preset")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                mode === "preset"
                  ? "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t("cron.presets")}
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                mode === "custom"
                  ? "bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t("cron.custom")}
            </button>
          </div>

          {mode === "preset" ? (
            <div className="p-3 grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    onChange(preset.cron);
                    setExpanded(false);
                  }}
                  className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    value === preset.cron
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="font-medium">{t(`cron.${preset.key}`)}</div>
                  <div className={`text-xs font-mono mt-0.5 ${value === preset.cron ? "text-white/70 dark:text-slate-900/70" : "text-slate-400 dark:text-slate-500"}`}>
                    {preset.cron}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Minute */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("cron.minute")}</label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setMinuteMode("specific"); applyCustom(); }} className={`${smallBtnClass} ${minuteMode === "specific" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.specific")}</button>
                  <button type="button" onClick={() => { setMinuteMode("every"); applyCustom(); }} className={`${smallBtnClass} ${minuteMode === "every" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.every")}</button>
                  <button type="button" onClick={() => { setMinuteMode("interval"); applyCustom(); }} className={`${smallBtnClass} ${minuteMode === "interval" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.interval")}</button>
                </div>
                {minuteMode === "specific" && (
                  <select value={minute} onChange={(e) => { setMinute(e.target.value); }} className={selectClass}>
                    {MINUTES.map((m) => (<option key={m} value={m}>{String(m).padStart(2, "0")}</option>))}
                  </select>
                )}
                {minuteMode === "interval" && (
                  <select value={minuteInterval} onChange={(e) => { setMinuteInterval(e.target.value); }} className={selectClass}>
                    {[1, 2, 5, 10, 15, 20, 30].map((v) => (<option key={v} value={v}>{t("cron.everyNMin", { n: String(v) })}</option>))}
                  </select>
                )}
              </div>

              {/* Hour */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("cron.hour")}</label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setHourMode("specific"); }} className={`${smallBtnClass} ${hourMode === "specific" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.specific")}</button>
                  <button type="button" onClick={() => { setHourMode("every"); }} className={`${smallBtnClass} ${hourMode === "every" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.every")}</button>
                  <button type="button" onClick={() => { setHourMode("interval"); }} className={`${smallBtnClass} ${hourMode === "interval" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>{t("cron.interval")}</button>
                </div>
                {hourMode === "specific" && (
                  <select value={hour} onChange={(e) => { setHour(e.target.value); }} className={selectClass}>
                    {HOURS.map((h) => (<option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>))}
                  </select>
                )}
                {hourMode === "interval" && (
                  <select value={hourInterval} onChange={(e) => { setHourInterval(e.target.value); }} className={selectClass}>
                    {[1, 2, 3, 4, 6, 8, 12].map((v) => (<option key={v} value={v}>{t("cron.everyNHours", { n: String(v) })}</option>))}
                  </select>
                )}
              </div>

              {/* Day of month */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("cron.dayOfMonth")}</label>
                <select value={dom} onChange={(e) => { setDom(e.target.value); }} className={selectClass}>
                  <option value="*">{t("cron.everyDay")}</option>
                  {DAYS_OF_MONTH.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>

              {/* Month */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("cron.month")}</label>
                <select value={mon} onChange={(e) => { setMon(e.target.value); }} className={selectClass}>
                  <option value="*">{t("cron.everyMonth")}</option>
                  {MONTHS.map((m) => (<option key={m.value} value={m.value}>{t(`cron.${m.key}`)}</option>))}
                </select>
              </div>

              {/* Day of week */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t("cron.dayOfWeek")}</label>
                <select value={dow} onChange={(e) => { setDow(e.target.value); }} className={selectClass}>
                  <option value="*">{t("cron.everyDayOfWeek")}</option>
                  {DAYS_OF_WEEK.map((d) => (<option key={d.value} value={d.value}>{t(`cron.${d.key}`)}</option>))}
                  <option value="1-5">{t("cron.weekdays")}</option>
                  <option value="0,6">{t("cron.weekends")}</option>
                </select>
              </div>

              {/* Apply button */}
              <button
                type="button"
                onClick={() => { onChange(buildCron()); setExpanded(false); }}
                className="w-full rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
              >
                {t("cron.apply")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
