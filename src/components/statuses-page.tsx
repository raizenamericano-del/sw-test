"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Download, Eye, FileText, Image, Link2, RefreshCw, Search, ShieldCheck, Smartphone, Video, X } from "lucide-react";
import Link from "next/link";
import { PageHeading, EmptyState } from "./ui";
import { useToast } from "./toast-provider";
import { formatDate } from "@/lib/format";
import { saveDownloadResponse } from "@/lib/client-download";

interface StatusItem {
  id: string;
  contact: string;
  mediaType: "image" | "video" | "text";
  available: boolean;
  createdAt: string;
  text: string | null;
}
interface StatusPayload {
  supported: boolean;
  provider: string;
  connected: boolean;
  connectionState?: string;
  capabilities: { statusFeedExperimental: boolean; official: boolean };
  items: StatusItem[];
  message: string;
  refreshedAt: string;
}
const filters = ["Semua", "Foto", "Video", "Teks"] as const;

export function StatusesPage() {
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("Semua");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<StatusItem | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch("/api/statuses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "Status belum dapat dimuat.");
      setPayload(data as StatusPayload);
    } catch (error) {
      toast("error", "Status belum dapat dimuat", error instanceof Error ? error.message : "Coba lagi.");
    } finally { setLoading(false); setRefreshing(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (payload?.items ?? []).filter((item) => {
      if (filter === "Foto" && item.mediaType !== "image") return false;
      if (filter === "Video" && item.mediaType !== "video") return false;
      if (filter === "Teks" && item.mediaType !== "text") return false;
      if (needle && !`${item.contact} ${item.text ?? ""}`.toLocaleLowerCase().includes(needle)) return false;
      return true;
    });
  }, [payload, filter, search]);

  async function download(item: StatusItem) {
    if (downloadingId) return;
    setDownloadingId(item.id);
    try {
      const response = await fetch(`/api/statuses/${item.id}/download`, { method: "POST" });
      await saveDownloadResponse(response, `status-${item.id.slice(0, 8)}`);
      toast("success", "Status diunduh", "Media disimpan ke Media Library dan riwayat unduhan.");
      await load(true);
    } catch (error) {
      toast("error", "Download gagal", error instanceof Error ? error.message : "Status mungkin sudah kedaluwarsa.");
    } finally { setDownloadingId(null); }
  }

  function openPreview(item: StatusItem) {
    setPreviewFailed(false);
    setPreview(item);
  }

  const icon = (type: StatusItem["mediaType"]) => type === "video" ? <Video size={19} /> : type === "image" ? <Image size={19} /> : <FileText size={19} />;

  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Status" title="Status Center" description="Menampilkan hanya event Status aktual yang diterima akun WhatsApp tertaut. Feed Baileys tidak resmi dan eksperimental; aplikasi tidak mengakses konten tersembunyi." actions={<button className="button button-soft" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />Refresh provider</button>} />
    <div className="callout" style={{ marginBottom: 14 }}><AlertTriangle size={17} /><div><strong>Feed masuk belum dijamin stabil oleh upstream Baileys</strong><p>{payload?.message || "Status Center hanya membaca pesan status@broadcast yang benar-benar diterima akun pemilik. Tidak ada permintaan untuk melewati pengaturan privasi atau mengambil Status yang tidak dikirim ke akun ini."}</p></div></div>
    <div className="filters-row">
      <div className="filter-tabs" role="tablist" aria-label="Filter status">{filters.map((item) => <button key={item} className={`filter-tab ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>{item}</button>)}</div>
      <label className="search-box"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kontak atau teks…" aria-label="Cari status" /></label>
    </div>
    <section className="card card-pad">
      {!payload && loading ? <div className="empty-state"><span className="spinner" /></div> : !payload?.connected ? <EmptyState icon={<Smartphone size={25} strokeWidth={1.6} />} title="Hubungkan WhatsApp milik Anda" description="Status tidak bisa diambil sebelum akun tertaut benar-benar Connected. Pairing code saja belum menandakan koneksi berhasil." action={<Link className="button button-soft button-sm" href="/connect"><Link2 size={13} />Buka koneksi</Link>} /> : filteredItems.length ? <>
        <div className="status-summary"><span><ShieldCheck size={14} />{filteredItems.length} event yang diterima</span><span><Clock3 size={13} />Cache memori proses · maksimal 24 jam</span></div>
        <div className="status-grid">{filteredItems.map((item) => <article className="status-item-card" key={item.id}>
          <div className={`status-item-art ${item.mediaType === "text" ? "status-item-art-text" : ""}`}>{icon(item.mediaType)}<span>{item.mediaType === "image" ? "FOTO" : item.mediaType === "video" ? "VIDEO" : "TEKS"}</span>{item.mediaType === "text" && <p>{item.text}</p>}</div>
          <div className="status-item-body"><div className="status-item-contact" title={item.contact}>{item.contact}</div><div className="status-item-meta"><Clock3 size={11} />{formatDate(item.createdAt)}</div>{item.text && item.mediaType !== "text" && <p className="status-item-caption">{item.text}</p>}<div className="status-item-actions">{item.available && <button className="button button-soft button-sm" onClick={() => openPreview(item)}><Eye size={12} />Preview</button>}{item.available && <button className="button button-dark button-sm" onClick={() => void download(item)} disabled={downloadingId === item.id}><Download size={12} />{downloadingId === item.id ? "Menyiapkan…" : "Unduh"}</button>}</div></div>
        </article>)}</div>
      </> : <EmptyState icon={<Image size={25} strokeWidth={1.6} />} title={search ? "Tidak ada item yang cocok" : "Belum ada Status yang diterima"} description={search ? "Ubah pencarian atau filter." : "Koneksi terbuka, tetapi belum ada event Status yang diterima proses ini. Refresh hanya membaca event yang tersedia; daftar mungkin kosong karena keterbatasan eksperimental Baileys."} />}
      {!!payload?.items.length && <div style={{ borderTop: "1px solid #eff2ee", paddingTop: 13, marginTop: 16, color: "#9aa39b", fontSize: 9 }}>Status hanya tersimpan sementara di memori proses, tidak dipulihkan setelah restart, dan otomatis dihapus setelah 24 jam. Mengunduh media akan menyalin file ke Media Library sesuai pengaturan retensi.</div>}
    </section>
    {preview && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={`Preview Status dari ${preview.contact}`}><div className="modal-header"><div><h3 style={{ marginBottom: 3 }}>{preview.contact}</h3><span style={{ color: "#97a198", fontSize: 9 }}>{formatDate(preview.createdAt)}</span></div><button className="icon-button" onClick={() => setPreview(null)} aria-label="Tutup preview"><X size={15} /></button></div><div className="modal-media">{previewFailed ? <EmptyState icon={<AlertTriangle size={22} />} title="Preview tidak tersedia" description="Media sudah kedaluwarsa atau tidak lagi dapat diambil dari sesi WhatsApp aktif." /> : preview.mediaType === "video" ? <video src={`/api/statuses/${preview.id}/content`} controls playsInline preload="metadata" onError={() => setPreviewFailed(true)} /> : <img src={`/api/statuses/${preview.id}/content`} alt={`Status dari ${preview.contact}`} onError={() => setPreviewFailed(true)} />}</div><div className="modal-footer"><span>Konten yang diterima akun tertaut · tanpa bypass privasi</span><button className="button button-dark button-sm" onClick={() => void download(preview)} disabled={downloadingId === preview.id}><Download size={13} />{downloadingId === preview.id ? "Menyiapkan…" : "Unduh & simpan"}</button></div></section></div>}
  </main>;
}
