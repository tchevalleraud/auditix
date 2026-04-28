"use client";

import { useState, useEffect, useRef } from "react";
import { useI18n, locales, type Locale } from "@/components/I18nProvider";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { useAppContext } from "@/components/ContextProvider";
import flagComponents from "@/components/Flags";
import {
  CircleUser,
  Loader2,
  Check,
  AlertCircle,
  KeyRound,
  Camera,
  Trash2,
  Globe,
  Monitor,
  Sun,
  Moon,
  SunMoon,
  ShieldCheck,
  Copy,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface ProfileData {
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  avatar: string | null;
  locale: string | null;
  theme: string | null;
  totpEnabled?: boolean;
}

interface TotpSetupData {
  secret: string;
  otpauthUri: string;
}

export default function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { reloadUser } = useAppContext();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TOTP
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TotpSetupData | null>(null);
  const [totpEnableCode, setTotpEnableCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [totpDisableOpen, setTotpDisableOpen] = useState(false);
  const [totpBackupCopied, setTotpBackupCopied] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileData | null) => {
        if (data) {
          setProfile(data);
          setFirstName(data.firstName ?? "");
          setLastName(data.lastName ?? "");
          setTotpEnabled(Boolean(data.totpEnabled));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTotpStart = async () => {
    setTotpBusy(true);
    setTotpError("");
    setTotpBackupCodes(null);
    setTotpEnableCode("");
    try {
      const res = await fetch("/api/totp/setup", { method: "POST" });
      if (res.ok) {
        const data: TotpSetupData = await res.json();
        setTotpSetup(data);
      } else {
        setTotpError(t("profile.totpSetupError"));
      }
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpCancelSetup = () => {
    setTotpSetup(null);
    setTotpEnableCode("");
    setTotpError("");
  };

  const handleTotpConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    setTotpError("");
    try {
      const res = await fetch("/api/totp/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpEnableCode.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setTotpBackupCodes(data.backupCodes ?? []);
        setTotpEnabled(true);
        setTotpSetup(null);
        setTotpEnableCode("");
      } else {
        setTotpError(t("profile.totpInvalidCode"));
      }
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    setTotpError("");
    try {
      const res = await fetch("/api/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: totpDisablePassword,
          code: totpDisableCode.trim(),
        }),
      });
      if (res.ok) {
        setTotpEnabled(false);
        setTotpDisableOpen(false);
        setTotpDisableCode("");
        setTotpDisablePassword("");
        setTotpBackupCodes(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setTotpError(
          data?.error === "Invalid password"
            ? t("profile.currentPasswordIncorrect")
            : t("profile.totpInvalidCode"),
        );
      }
    } finally {
      setTotpBusy(false);
    }
  };

  const copyBackupCodes = () => {
    if (!totpBackupCodes) return;
    const text = totpBackupCodes.join("\n");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setTotpBackupCopied(true);
        setTimeout(() => setTotpBackupCopied(false), 2000);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setTotpBackupCopied(true);
      setTimeout(() => setTotpBackupCopied(false), 2000);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        await reloadUser();
      }
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        await reloadUser();
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(false);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName || null, lastName: lastName || null }),
      });

      if (res.ok) {
        const data: ProfileData = await res.json();
        setProfile(data);
        setProfileSuccess(true);
        await reloadUser();
        setTimeout(() => setProfileSuccess(false), 3000);
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError(t("profile.passwordMismatch"));
      return;
    }

    setPasswordSaving(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordSuccess(true);
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await res.json();
        setPasswordError(data.error === "Current password is incorrect" ? t("profile.currentPasswordIncorrect") : data.error);
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("profile.subtitle")}
        </p>
      </div>

      {/* Profile info */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="relative group">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <CircleUser className="h-16 w-16 text-slate-400 dark:text-slate-500" />
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              {avatarUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full p-1.5 text-white hover:bg-white/20 transition-colors"
                    title={t("profile.changeAvatar")}
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  {profile?.avatar && (
                    <button
                      onClick={handleAvatarDelete}
                      className="rounded-full p-1.5 text-white hover:bg-white/20 transition-colors"
                      title={t("profile.deleteAvatar")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{profile?.username}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {profile?.roles.includes("ROLE_ADMIN") ? t("profile.roleAdmin") : t("profile.roleUser")}
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.firstName")}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("profile.firstNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.lastName")}
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("profile.lastNamePlaceholder")}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("common.save")}
            </button>
            {profileSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {t("profile.saved")}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Preferences */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <Globe className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("profile.preferences")}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Language */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.language")}
            </label>
            <div className="flex flex-wrap gap-2">
              {locales.map((l) => {
                const Flag = flagComponents[l.code];
                const isSelected = locale === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={async () => {
                      setLocale(l.code);
                      await fetch("/api/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ locale: l.code }),
                      });
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors border ${
                      isSelected
                        ? "border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Flag size={18} />
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.theme")}
            </label>
            <div className="flex gap-2">
              {([
                { value: "auto" as ThemeMode, icon: SunMoon, labelKey: "profile.themeAuto" },
                { value: "light" as ThemeMode, icon: Sun, labelKey: "profile.themeLight" },
                { value: "dark" as ThemeMode, icon: Moon, labelKey: "profile.themeDark" },
              ]).map(({ value, icon: Icon, labelKey }) => {
                const isSelected = theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={async () => {
                      setTheme(value);
                      await fetch("/api/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ theme: value }),
                      });
                    }}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors border ${
                      isSelected
                        ? "border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Password change */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <KeyRound className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("profile.changePassword")}
          </h2>
        </div>

        <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
          {passwordError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {passwordError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("profile.currentPassword")}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              placeholder={t("profile.currentPasswordPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.newPassword")}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("profile.newPasswordPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("profile.confirmPassword")}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("profile.confirmPasswordPlaceholder")}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("profile.updatePassword")}
            </button>
            {passwordSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {t("profile.passwordUpdated")}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Two-factor authentication */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <ShieldCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("profile.totpTitle")}
          </h2>
          {totpEnabled && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              {t("profile.totpEnabledBadge")}
            </span>
          )}
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("profile.totpDescription")}
          </p>

          {totpError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {totpError}
            </div>
          )}

          {/* Backup codes display (after enable) */}
          {totpBackupCodes && totpBackupCodes.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t("profile.totpBackupCodesTitle")}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-1">
                  {t("profile.totpBackupCodesHelp")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {totpBackupCodes.map((c) => (
                  <code
                    key={c}
                    className="rounded bg-white dark:bg-slate-900 px-2 py-1 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <button
                type="button"
                onClick={copyBackupCodes}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
              >
                {totpBackupCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {totpBackupCopied ? t("common.save") : t("profile.totpCopyCodes")}
              </button>
            </div>
          )}

          {!totpEnabled && !totpSetup && (
            <button
              type="button"
              onClick={handleTotpStart}
              disabled={totpBusy}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {totpBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("profile.totpEnable")}
            </button>
          )}

          {!totpEnabled && totpSetup && (
            <form onSubmit={handleTotpConfirm} className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                <div className="rounded-md bg-white p-3">
                  <QRCodeSVG value={totpSetup.otpauthUri} size={180} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t("profile.totpScanQr")}</p>
                <code className="text-xs font-mono text-slate-700 dark:text-slate-300 break-all select-all">
                  {totpSetup.secret}
                </code>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("profile.totpEnterCode")}
                </label>
                <input
                  type="text"
                  value={totpEnableCode}
                  onChange={(e) => setTotpEnableCode(e.target.value)}
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors tracking-widest font-mono"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={totpBusy || !totpEnableCode.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  {totpBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("profile.totpConfirm")}
                </button>
                <button
                  type="button"
                  onClick={handleTotpCancelSetup}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          {totpEnabled && !totpDisableOpen && (
            <button
              type="button"
              onClick={() => {
                setTotpDisableOpen(true);
                setTotpError("");
              }}
              className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {t("profile.totpDisable")}
            </button>
          )}

          {totpEnabled && totpDisableOpen && (
            <form onSubmit={handleTotpDisable} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("profile.currentPassword")}
                </label>
                <input
                  type="password"
                  value={totpDisablePassword}
                  onChange={(e) => setTotpDisablePassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("profile.totpEnterCode")}
                </label>
                <input
                  type="text"
                  value={totpDisableCode}
                  onChange={(e) => setTotpDisableCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors tracking-widest font-mono"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={totpBusy || !totpDisablePassword || !totpDisableCode.trim()}
                  className="flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                >
                  {totpBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("profile.totpDisable")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTotpDisableOpen(false);
                    setTotpDisableCode("");
                    setTotpDisablePassword("");
                    setTotpError("");
                  }}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
