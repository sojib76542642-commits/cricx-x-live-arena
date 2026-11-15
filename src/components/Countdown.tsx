import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { AWAITING_RESULT_AFTER_MS } from "@/lib/streams";

export default function Countdown({ start }: { start: string }) {
  // null until mounted so server and browser render the same first frame.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (now === null) {
    return (
      <span className="cx-countdown">
        <Clock3 size={11} />
      </span>
    );
  }
  const diff = new Date(start).getTime() - now;
  if (Number.isFinite(diff) && diff < -AWAITING_RESULT_AFTER_MS) {
    return <span className="cx-countdown">Awaiting result</span>;
  }
  if (!Number.isFinite(diff) || diff <= 0) {
    return <span className="cx-countdown">Starting soon</span>;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <span className="cx-countdown">
      <Clock3 size={11} />
      {d > 0 && `${d}d `}
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
