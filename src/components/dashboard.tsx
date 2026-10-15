"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Database, Images, RefreshCw, ShieldCheck, Smartphone, TriangleAlert, Wifi } from "lucide-react";
import type { DashboardData } from "@/lib/types";
import { PageHeading, ActivityFeed, StatusBadge } from "./ui";
import { useToast } from "./toast-provider";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || "Dashboard belum dapat dimuat.");
      setData(payload as DashboardData);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Dashboard belum dapat dimuat.";
      setError(message);
      if (quiet) toast("error", "Pembaruan gagal", message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onActivity = () => void load(true);
    window.addEventListener("imh:activity", onActivity);
    return () => window.removeEventListener("imh:activity", onActivity);
  }, [load]);

  const db = data?.health.database;
  const storage = data?.health.storage;
  return <main className="page-content">
    <PageHeading eyebrow="Workspace / Overview" title="Selamat datang kembali" description="Ringkasan layanan dan media berdasarkan data yang benar-benar tersimpan di workspace ini." actions={<button className="button button-soft" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />Perbarui</button>} />
    {error && <div className="callout" style={{ marginBottom: 14 }}><TriangleAlert size={17} /><div><strong>Backend belum merespons</strong><p>{error}</p></div></div>}
    <section className="dashboard-hero">
      <div className="hero-copy">
        <div className="hero-topline"><ShieldCheck size={14} /> Workspace admin · akses privat</div>
        <h2>Media milikmu, tersusun rapi. Tanpa mengarang status.</h2>
        <p>Integrasi Baileys bersifat tidak resmi. Status Center hanya menampilkan event nyata yang diterima akun tertaut; feed masuk belum dijamin oleh upstream.</p>
        <div className="hero-actions"><Link className="button hero-button" href="/connect">Lihat integrasi <ArrowRight size={14} /></Link><Link className="button hero-link" href="/library">Buka Media Library <Images size={14} /></Link></div>
      </div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-dot dot-a" /><div className="orbit-dot dot-b" /><div className="orbit-core"><strong>IM</strong><Wifi size={21} /></div></div>
    </section>

    <section className="stats-grid" aria-label="Ringkasan statistik">
      <article className="card stat-card"><div className="stat-top"><span>Status yang dapat diakses</span><span className="stat-icon"><Smartphone size={16} /></span></div><div className="stat-value">{loading ? "—" : data?.stats.accessibleStatuses === null ? "—" : data?.stats.accessibleStatuses ?? "—"}</div><div className="stat-foot warning"><TriangleAlert size={11} /> Feed eksperimental; angka hanya dari event diterima <ArrowUpRight className="stat-tiny-arrow" size={13} /></div></article>
      <article className="card stat-card"><div className="stat-top"><span>Media di library</span><span className="stat-icon"><Images size={16} /></span></div><div className="stat-value">{loading ? "—" : data?.stats.libraryItems ?? 0}</div><div className="stat-foot">Unggahan yang kamu tambahkan sendiri <ArrowUpRight className="stat-tiny-arrow" size={13} /></div></article>
      <article className="card stat-card"><div className="stat-top"><span>Unduhan berhasil</span><span className="stat-icon"><Activity size={16} /></span></div><div className="stat-value">{loading ? "—" : data?.stats.successfulDownloads ?? 0}</div><div className="stat-foot">Tercatat setelah file tersedia <ArrowUpRight className="stat-tiny-arrow" size={13} /></div></article>
    </section>

    <section className="dashboard-lower">
      <article className="card card-pad">
        <div className="section-title-row"><div><h2 className="section-title">Aktivitas terbaru</h2><p className="section-subtitle">Log aktual workspace · tanpa OTP, pairing code, atau token.</p></div><Link className="button button-ghost button-sm" href="/history">Lihat riwayat <ArrowRight size={12} /></Link></div>
        {loading ? <div className="empty-state" style={{ minHeight: 170 }}><span className="spinner" /></div> : data?.activities.length ? <ActivityFeed items={data.activities} /> : <ActivityFeed items={[]} />}
      </article>
      <article className="card card-pad">
        <div className="section-title-row"><div><h2 className="section-title">Kondisi layanan</h2><p className="section-subtitle">Pemeriksaan backend dan penyimpanan terkini.</p></div><span className="stat-icon"><Activity size={16} /></span></div>
        <div className="service-list">
          <div className="service-row"><div className="service-left"><span className="service-icon"><Wifi size={15} /></span><div className="service-label"><strong>API dashboard</strong><span>Endpoint merespons</span></div></div><StatusBadge state={data?.health.api === "healthy" ? "good" : "warn"} label={data?.health.api === "healthy" ? "Online" : "Degraded"} /></div>
          <div className="service-row"><div className="service-left"><span className="service-icon"><Database size={15} /></span><div className="service-label"><strong>{db?.mode === "postgresql" ? "PostgreSQL" : "Database lokal"}</strong><span>{db?.detail ?? "Memeriksa…"}</span></div></div><StatusBadge state={db?.status === "healthy" ? "good" : "warn"} label={db?.status === "healthy" ? "Ready" : "Periksa"} /></div>
          <div className="service-row"><div className="service-left"><span className="service-icon"><Images size={15} /></span><div className="service-label"><strong>{storage?.driver === "s3" ? "Object storage" : storage?.driver === "local" ? "Local disk" : "Media storage"}</strong><span>{storage?.persistent ? "Persisten" : "Tidak persisten di Railway"}</span></div></div><StatusBadge state={storage?.status === "healthy" && storage?.persistent ? "good" : storage?.status === "healthy" ? "warn" : "off"} label={storage?.persistent ? "Ready" : storage?.driver === "local" ? "Preview" : "Config"} /></div>
          <div className="service-row"><div className="service-left"><span className="service-icon"><Smartphone size={15} /></span><div className="service-label"><strong>Baileys linked-device</strong><span>{data?.session.state === "connected" ? "Socket tertaut aktif · feed Status eksperimental" : "Belum terhubung · pairing code tidak cukup untuk menandai connected"}</span></div></div><StatusBadge state={data?.session.state === "connected" ? "warn" : data?.session.state === "connecting" ? "warn" : "off"} label={data?.session.state === "connected" ? "Experimental" : data?.session.state === "connecting" ? "Connecting" : "Disconnected"} /></div>
        </div>
      </article>
    </section>
  </main>;
}
