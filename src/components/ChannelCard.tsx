import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import type { Channel } from "@/lib/types";

export default function ChannelCard({ channel }: { channel: Pick<Channel, "id" | "name" | "category" | "logo_url" | "sources"> }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const count = channel.sources.length;
  return (
    <Link to="/channel/$id" params={{ id: channel.id }} className="cx-channel">
      <div className="cx-channel-art">
        <span className="cx-channel-badge">{channel.category || "Sports"}</span>
        {channel.logo_url && !logoFailed ? (
          <img
            src={channel.logo_url}
            alt={channel.name}
            loading="lazy"
            onError={() => setLogoFailed(true)}
            // A server-rendered image can fail before React attaches onError; catch that on mount.
            ref={(el) => {
              if (el?.complete && el.naturalWidth === 0) setLogoFailed(true);
            }}
          />
        ) : (
          <Tv size={32} />
        )}
      </div>
      <div className="cx-channel-info">
        <b>{channel.name}</b>
        <small>{count > 0 ? `${count} source${count === 1 ? "" : "s"} available` : "No sources"}</small>
      </div>
    </Link>
  );
}
