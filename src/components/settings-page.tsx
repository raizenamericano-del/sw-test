"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, HardDrive, LockKeyhole, RefreshCw, Save, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeading, StatusBadge } from "./ui";
import { useToast } from "./toast-provider";
import { formatDate } from "@/lib/format";

interface Preferences { retentionDays: number; autoCleanup: boolean; libraryView: "grid" | "list"; updatedAt: string }
interface HealthResponse { status: string; database: { mode: string; status: string; detail: string }; storage: { driver: string; persistent: boolean; status: string; detail: string } }

export function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResponse, healthResponse] = await Promise.all([fetch("/api/settings", { cache: "no-store" }), fetch("/api/health", { cache: "no-store" })]);
      const settingsData = await settingsResponse.json();
      const healthData = await healthResponse.json();
      if (!settingsResponse.ok) throw new Error(settingsData?.error?.message || "Pengaturan belum dapat dimuat.");
      setPreferences(settingsData.preferences as Preferences);
      setHealth(healthData as HealthResponse);
      setDirty(false);
    } catch (cause) { toast("error", "Gagal memuat pengaturan", cause instanceof Error ? cause.message : "Coba lagi."); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
    setDirty(true);
  }

  async function save() {
    if (!preferences) return;
    setSaving(true);
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retentionDays: preferences.retentionDays, autoCleanup: preferences.autoCleanup, libraryView: preferences.libraryView }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Pengaturan belum dapat disimpan.");
      setPreferences(payload.preferences);
      setDirty(false);
      toast("success", "Pengaturan disimpan", "Preferensi dan jadwal retensi diperbarui.");
    } catch (cause) { toast("error", "Gagal menyimpan", cause instanceof Error ? cause.message : "Coba lagi."); }
    finally { setSaving(false); }
  }

  async function cleanup() {
    setCleaning(true);
    try {
      const response = await fetch("/api/settings/cleanup", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Pembersihan gagal.");
      toast("success", "Retensi dijalankan", payload.skipped ? "Pembersihan otomatis sedang nonaktif." : `${payload.deleted} file kedaluwarsa dibersihkan.`);
      window.dispatchEvent(new Event("imh:activity"));
    } catch (cause) { toast("error", "Pembersihan gagal", cause instanceof Error ? cause.message : "Coba lagi."); }
    finally { setCleaning(false); }
  }

  const storageLabel = health?.storage.driver === "s3" ? "S3-compatible object storage" : health?.storage.driver === "local" ? "Local development storage" : "Not configured";
  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Preferences" title="Pengaturan" description="Preferensi retensi media dan status konfigurasi. Kredensial admin hanya dibaca dari environment server; tidak disimpan di database." actions={<><button className="button button-soft" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Refresh</button><button className="button button-primary" onClick={() => void save()} disabled={!dirty || saving || loading}><Save size={14} />{saving ? "Menyimpan…" : "Simpan"}</button></>} />
    <div className="settings-grid">
      <section className="card settings-section">
        <div className="section-title-row"><div><h2 className="section-title">Media & retensi</h2><p className="section-subtitle">File dapat dibersihkan otomatis sesuai usia yang dipilih.</p></div><Settings2 size={18} color="#6d8171" /></div>
        {loading || !preferences ? <div className="empty-state" style={{ minHeight: 160 }}><span className="spinner" /></div> : <>
          <div className="settings-row"><div className="settings-copy"><strong>Hapus media setelah</strong><span>Retensi dihitung dari waktu file disimpan. Riwayat unduhan tetap ada sebagai metadata.</span></div><select className="settings-select" value={preferences.retentionDays} onChange={(event) => update("retentionDays", Number(event.target.value))} aria-label="Masa retensi"><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option><option value={180}>180 hari</option><option value={365}>1 tahun</option></select></div>
          <div className="settings-row"><div className="settings-copy"><strong>Pembersihan otomatis</strong><span>Jalankan saat dashboard dibuka dan melalui cron harian di production.</span></div><button className={`toggle ${preferences.autoCleanup ? "on" : ""}`} role="switch" aria-checked={preferences.autoCleanup} aria-label="Pembersihan otomatis" onClick={() => update("autoCleanup", !preferences.autoCleanup)} /></div>
          <div className="settings-row"><div className="settings-copy"><strong>Tampilan Media Library</strong><span>Pilihan tampilan default di perangkat admin.</span></div><select className="settings-select" value={preferences.libraryView} onChange={(event) => update("libraryView", event.target.value as "grid" | "list")} aria-label="Tampilan default"><option value="grid">Grid</option><option value="list">List</option></select></div>
          <div className="settings-row"><div className="settings-copy"><strong>Bersihkan sekarang</strong><span>Hapus file melewati masa retensi sesuai preferensi saat ini.</span></div><button className="button button-soft button-sm" onClick={() => void cleanup()} disabled={cleaning}><Trash2 size={13} />{cleaning ? "Membersihkan…" : "Jalankan"}</button></div>
          {dirty && <div className="callout info" style={{ marginTop: 12 }}><Save size={15} /><div><strong>Perubahan belum disimpan</strong><p>Klik Simpan untuk menerapkan preferensi baru.</p></div></div>}
        </>}
      </section>

      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <section className="card settings-section">
          <div className="section-title-row"><div><h2 className="section-title">Penyimpanan</h2><p className="section-subtitle">Kondisi konfigurasi backend saat ini.</p></div><HardDrive size={18} color="#6d8171" /></div>
          <div className="service-list">
            <div className="service-row"><div className="service-left"><HardDrive size={14} color="#849187" /><div className="service-label"><strong>{storageLabel}</strong><span>{health?.storage.detail || "Memeriksa storage…"}</span></div></div><StatusBadge state={health?.storage.status === "healthy" && health.storage.persistent ? "good" : health?.storage.status === "healthy" ? "warn" : "off"} label={health?.storage.persistent ? "Persisten" : "Preview"} /></div>
            <div className="service-row"><div className="service-left"><Settings2 size={14} color="#849187" /><div className="service-label"><strong>{health?.database.mode === "postgresql" ? "PostgreSQL" : "Local JSON"}</strong><span>{health?.database.detail || "Memeriksa database…"}</span></div></div><StatusBadge state={health?.database.status === "healthy" ? "good" : "warn"} label={health?.database.status === "healthy" ? "Ready" : "Periksa"} /></div>
          </div>
          {!health?.storage.persistent && <div className="callout" style={{ marginTop: 12 }}><AlertTriangle size={15} /><div><strong>Belum cocok untuk produksi</strong><p>Untuk Railway, set S3_BUCKET, S3_REGION, dan kredensial bucket. Local disk pada preview bukan storage persisten.</p></div></div>}
        </section>
        <section className="card settings-section">
          <div className="section-title-row"><div><h2 className="section-title">Keamanan admin</h2><p className="section-subtitle">Akun tunggal, sesi cookie terproteksi.</p></div><ShieldCheck size={18} color="#6d8171" /></div>
          <div className="service-list">
            <div className="service-row"><div className="service-left"><LockKeyhole size={14} color="#849187" /><div className="service-label"><strong>Login admin</strong><span>ADMIN_USERNAME / ADMIN_PASSWORD dari environment.</span></div></div><StatusBadge state="good" label="Enabled" /></div>
            <div className="service-row"><div className="service-left"><ShieldCheck size={14} color="#849187" /><div className="service-label"><strong>Cookie sesi</strong><span>HttpOnly, SameSite Strict, 12 jam.</span></div></div><StatusBadge state="good" label="Protected" /></div>
          </div>
          <div style={{ marginTop: 13, color: "#9aa39b", fontSize: 9 }}>Terakhir disimpan: {preferences?.updatedAt ? formatDate(preferences.updatedAt) : "—"}</div>
        </section>
      </div>
    </div>
  </main>;
}
