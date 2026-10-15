"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  CircleHelp,
  Clock3,
  Home,
  Images,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Settings2,
  X,
} from "lucide-react";

const primaryNavigation = [
  { href: "/dashboard", label: "Ikhtisar", icon: Home },
  { href: "/connect", label: "WhatsApp", icon: Link2 },
  { href: "/statuses", label: "Status Center", icon: CircleHelp },
  { href: "/library", label: "Media Library", icon: Images },
  { href: "/history", label: "Riwayat unduhan", icon: ArrowDownToLine },
];
const secondaryNavigation = [{ href: "/settings", label: "Pengaturan", icon: Settings2 }];
const routeTitles: Record<string, string> = {
  "/dashboard": "Ikhtisar",
  "/connect": "Koneksi WhatsApp",
  "/statuses": "Status Center",
  "/library": "Media Library",
  "/history": "Riwayat unduhan",
  "/settings": "Pengaturan",
};

export function AppShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [today, setToday] = useState("");
  const initials = username.slice(0, 2).toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short" }).format(new Date()));
  }, []);

  useEffect(() => {
    const stream = new EventSource("/api/events");
    const onActivity = () => window.dispatchEvent(new Event("imh:activity"));
    stream.addEventListener("activity", onActivity);
    return () => {
      stream.removeEventListener("activity", onActivity);
      stream.close();
    };
  }, []);

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function navItems(items: typeof primaryNavigation) {
    return items.map((item) => {
      const Icon = item.icon;
      const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
      return (
        <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
          <Icon size={17} strokeWidth={1.8} />
          <span>{item.label}</span>
        </Link>
      );
    });
  }

  const pathTitle = routeTitles[pathname] || "Workspace";
  return (
    <div className="app-frame">
      <div className={`mobile-overlay ${mobileOpen ? "visible" : ""}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Link href="/dashboard" className="brand-lockup" aria-label="IM Status Hub home">
          <div className="brand-mark"><strong>IM</strong></div>
          <div className="brand-word"><div className="brand-name">IM STATUS</div><div className="brand-sub">HUB · ADMIN</div></div>
        </Link>
        <div className="sidebar-caption">Workspace</div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">{navItems(primaryNavigation)}</nav>
        <div className="nav-divider" />
        <div className="sidebar-caption">Preferensi</div>
        <nav className="sidebar-nav" aria-label="Preferensi">{navItems(secondaryNavigation)}</nav>
        <div className="sidebar-bottom">
          <div className="integration-mini">
            <div className="integration-mini-top"><span className="signal-dot" /> Baileys · eksperimental</div>
            <p>Status sesi di dashboard</p>
            <small>Feed Status tidak resmi dan tidak dijamin upstream.</small>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-copy"><strong>{username}</strong><span>Admin workspace</span></div>
            <button className="profile-logout" onClick={signOut} aria-label="Keluar" title="Keluar" disabled={loggingOut}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" aria-label={mobileOpen ? "Tutup menu" : "Buka menu"} onClick={() => setMobileOpen((value) => !value)}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div><div className="page-eyebrow">IM STATUS HUB / PRIVATE</div><div className="topbar-title">{pathTitle}</div></div>
          </div>
          <div className="topbar-right">
            <div className="live-chip" title="Data layar disegarkan dari backend ketika ada aktivitas baru"><span className="live-point" /><span className="desktop-live-label">Backend sync</span><span className="mobile-live-label">Sync</span></div>
            <div className="topbar-date">{today}</div>
          </div>
        </header>
        {children}
        <div className="mobile-bottom-nav" aria-label="Navigasi cepat">
          {[
            { href: "/dashboard", label: "Home", icon: Home },
            { href: "/statuses", label: "Status", icon: MessageCircle },
            { href: "/library", label: "Library", icon: Images },
            { href: "/history", label: "Riwayat", icon: Clock3 },
          ].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return <Link key={item.href} href={item.href} className={active ? "mobile-nav-item active" : "mobile-nav-item"}><Icon size={17} /><span>{item.label}</span></Link>;
          })}
        </div>
      </div>
    </div>
  );
}
