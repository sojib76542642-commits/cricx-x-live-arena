import { Link, useLocation } from "@tanstack/react-router";
import { Home, Tv, ShieldCheck, Send } from "lucide-react";
import type { ReactNode } from "react";
import Logo from "./Logo";

const TELEGRAM_URL = "https://t.me/cricxq";

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const isActive = (path: string) => (path === "/" ? pathname === "/" || pathname.startsWith("/watch") : pathname.startsWith(path));
  const sportsActive = isActive("/sports") || isActive("/channel");

  return (
    <div className="cx-shell">
      <aside className="cx-sidebar">
        <Link to="/" style={{ marginBottom: "32px", display: "block", paddingLeft: "8px" }} aria-label="Cricx X home">
          <Logo />
        </Link>

        <nav className="cx-side-nav">
          <Link to="/" className={isActive("/") ? "active" : ""}>
            <Home size={18} /> Live
          </Link>
          <Link to="/sports" className={sportsActive ? "active" : ""}>
            <Tv size={18} /> Sports
          </Link>
          <Link to="/backups" className={isActive("/backups") ? "active" : ""}>
            <ShieldCheck size={18} /> Backups
          </Link>
        </nav>

        <a
          className="cx-btn cx-btn-secondary"
          style={{ marginTop: "auto", borderColor: "rgba(255,255,255,0.1)", color: "var(--sidebar-text)", background: "transparent", fontSize: "13px" }}
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
        >
          <Send size={16} /> Join Telegram
        </a>
      </aside>

      <main className="cx-main">
        {children}
        <footer className="cx-attribution">
          Live cricket scores and fixtures:{" "}
          <a href="https://sportscore.com/" rel="dofollow" title="Sports data by SportScore">
            Powered by SportScore
          </a>
        </footer>
      </main>

      <nav className="cx-bottom-nav">
        <Link to="/" className={isActive("/") ? "active" : ""}>
          <Home size={20} />
          <span>Live</span>
        </Link>
        <Link to="/sports" className={sportsActive ? "active" : ""}>
          <Tv size={20} />
          <span>Sports</span>
        </Link>
        <Link to="/backups" className={isActive("/backups") ? "active" : ""}>
          <ShieldCheck size={20} />
          <span>Backups</span>
        </Link>
      </nav>
    </div>
  );
}
