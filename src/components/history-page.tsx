"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, CheckCircle2, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import type { DownloadRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { saveDownloadResponse } from "@/lib/client-download";
import { PageHeading, EmptyState } from "./ui";
import { useToast } from "./toast-provider";

interface HistoryResponse { items: DownloadRecord[]; total: number }

export function HistoryPage() {
  const [items, setItems] = useState<DownloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { toast } = useToast();
  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Riwayat belum dapat dimuat.");
      setItems((payload as HistoryResponse).items);
    } catch (cause) {
      toast("error", "Riwayat belum dapat dimuat", cause instanceof Error ? cause.message : "Coba lagi.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onActivity = () => void load(true);
    window.addEventListener("imh:activity", onActivity);
    return () => window.removeEventListener("imh:activity", onActivity);
  }, [load]);

  async function retry(item: DownloadRecord) {
    if (!item.mediaId) return toast("error", "Media tidak tersedia", "Item ini sudah dihapus dari Media Library.");
    setRetryingId(item.id);
    try {
      const response = await fetch(`/api/media/${item.mediaId}/download`, { method: "POST" });
      await saveDownloadResponse(response, item.fileName);
      toast("success", "Unduhan selesai", `${item.fileName} sudah diterima browser.`);
      await load(true);
    } catch (cause) { toast("error", "Unduhan gagal", cause instanceof Error ? cause.message : "Coba lagi sebentar."); }
    finally { setRetryingId(null); }
  }

  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const statusLabel: Record<DownloadRecord["status"], string> = { waiting: "Waiting", processing: "Processing", completed: "Selesai", failed: "Gagal" };

  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Activity" title="Riwayat unduhan" description="Riwayat unduhan Media Library serta media Status yang benar-benar diterima sesi Baileys. Feed Status tetap eksperimental dan dapat kosong." actions={<button className="button button-soft" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={14} />Refresh</button>} />
    <section className="stats-grid" style={{ marginTop: 0, marginBottom: 15 }}>
      <article className="card stat-card"><div className="stat-top"><span>Total tercatat</span><span className="stat-icon"><ArrowDownToLine size={15} /></span></div><div className="stat-value">{loading ? "—" : items.length}</div><div className="stat-foot">Paling baru hingga 200 item</div></article>
      <article className="card stat-card"><div className="stat-top"><span>Berhasil</span><span className="stat-icon"><CheckCircle2 size={15} /></span></div><div className="stat-value">{loading ? "—" : completed}</div><div className="stat-foot">File berhasil dibaca dari storage</div></article>
      <article className="card stat-card"><div className="stat-top"><span>Gagal</span><span className="stat-icon"><TriangleAlert size={15} /></span></div><div className="stat-value">{loading ? "—" : failed}</div><div className="stat-foot">Bisa diulang jika file masih tersimpan</div></article>
    </section>
    <section className="card card-pad">
      <div className="section-title-row"><div><h2 className="section-title">Aktivitas file</h2><p className="section-subtitle">Status proses berubah hanya setelah backend berhasil membaca file.</p></div><Clock3 size={17} color="#819084" /></div>
      {loading ? <div className="empty-state"><span className="spinner" /></div> : !items.length ? <EmptyState icon={<ArrowDownToLine size={25} />} title="Belum ada unduhan" description="Unduhan dari Media Library akan dicatat di sini dengan status aktual waiting, processing, completed, atau failed." /> : <div className="history-list">{items.map((item) => <article className="history-item" key={item.id}><div className="history-file-icon"><ArrowDownToLine size={16} /></div><div className="history-copy"><strong title={item.fileName}>{item.fileName}</strong><span>{formatDate(item.startedAt)}{item.finishedAt ? ` · selesai ${formatDate(item.finishedAt)}` : " · masih berjalan"}</span></div><div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}><span className={`history-status ${item.status}`}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />{statusLabel[item.status]}</span>{item.status === "failed" && item.mediaId && <button className="button button-soft button-sm" onClick={() => void retry(item)} disabled={retryingId === item.id}>{retryingId === item.id ? "Mengulang…" : "Coba ulang"}</button>}</div></article>)}</div>}
    </section>
  </main>;
}
