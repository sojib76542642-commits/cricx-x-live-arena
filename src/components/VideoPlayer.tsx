import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { isBlockedMixedContent, isHttpUrl, playbackModeFor } from "@/lib/streams";
import type { SourceKind } from "@/lib/types";

type Props = {
  src: string;
  kind?: SourceKind | null;
  drmLicenseUrl?: string | null;
};

type Status = "loading" | "ready" | "error";

/**
 * Plays HLS (hls.js / native Safari), DASH incl. Widevine/PlayReady DRM (Shaka Player,
 * using the license server configured by the provider), or a provider embed.
 * No proxying: streams load directly from the provider as authorized.
 */
export default function VideoPlayer({ src, kind, drmLicenseUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mode = playbackModeFor({ url: src, kind: kind ?? null, drm_license_url: drmLicenseUrl ?? null });

  useEffect(() => {
    setStatus("loading");
    setError("");

    const fail = (message: string) => {
      setError(message);
      setStatus("error");
    };

    if (!isHttpUrl(src)) return fail("This stream link is not a valid web address.");
    if (isBlockedMixedContent(src, window.location.protocol)) {
      return fail("This stream uses an insecure (http) link, which browsers block on secure sites. An https link is needed.");
    }
    if (mode === "embed") return; // iframe reports load itself

    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const onReady = () => {
      if (!disposed) setStatus("ready");
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
    const tryPlay = () => void video.play().catch(() => {});
    // Safety net: never leave viewers on an endless spinner.
    const timeout = window.setTimeout(() => {
      if (!disposed && video.readyState < 2) fail("The stream is taking too long to start. It may be offline — try another server.");
    }, 30_000);

    async function startHls() {
      const { default: Hls } = await import("hls.js");
      if (disposed || !video) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 30,
          manifestLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 5,
        });
        let networkRetries = 0;
        let mediaRecoveries = 0;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!disposed) tryPlay();
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (disposed || !data.fatal) return;
          // Manifest errors were already retried by hls.js (manifestLoadingMaxRetry); give up.
          const manifestFailed = /manifest/i.test(data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !manifestFailed && networkRetries < 3) {
            networkRetries++;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
            mediaRecoveries++;
            hls.recoverMediaError();
          } else {
            hls.destroy();
            fail(
              data.type === Hls.ErrorTypes.NETWORK_ERROR
                ? "The stream could not be reached. It may be offline or not allow playback on this site."
                : `Playback failed (${data.details}).`,
            );
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        cleanup = () => hls.destroy();
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        const onErr = () => !disposed && fail("The stream could not be played. It may be offline.");
        video.addEventListener("error", onErr, { once: true });
        video.src = src;
        tryPlay();
        cleanup = () => video.removeEventListener("error", onErr);
      } else {
        fail("Your browser does not support this type of stream.");
      }
    }

    async function startDash() {
      const { default: shaka } = await import("shaka-player");
      if (disposed || !video) return;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) return fail("Your browser does not support this type of stream.");
      const player = new shaka.Player();
      cleanup = () => void player.destroy();
      try {
        await player.attach(video);
        if (drmLicenseUrl) {
          const servers: Record<string, string> = /playready/i.test(drmLicenseUrl)
            ? { "com.microsoft.playready": drmLicenseUrl }
            : { "com.widevine.alpha": drmLicenseUrl };
          player.configure({ drm: { servers } });
        }
        player.addEventListener("error", (event) => {
          const detail = (event as unknown as { detail?: { code?: number } }).detail;
          if (!disposed) fail(`Playback failed${detail?.code ? ` (code ${detail.code})` : ""}.`);
        });
        await player.load(src);
        if (!disposed) tryPlay();
      } catch (e) {
        if (disposed) return;
        const code = (e as { code?: number }).code;
        // 6xxx = DRM errors in Shaka
        fail(
          code && code >= 6000 && code < 7000
            ? "This protected stream could not be unlocked. The provider's license may not permit playback here."
            : `The stream could not be loaded${code ? ` (code ${code})` : ""}.`,
        );
      }
    }

    (mode === "dash" ? startDash() : startHls()).catch((e) => {
      console.error("[cricx] player init failed", e);
      if (!disposed) fail("The video player could not start.");
    });

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      cleanup?.();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, mode, drmLicenseUrl, attempt]);

  return (
    <div className="cx-player">
      {status === "loading" && (
        <div className="cx-player-overlay">
          <Loader2 className="cx-spin" size={40} color="var(--primary)" />
          <b>Connecting to stream…</b>
          <small>Please wait</small>
        </div>
      )}
      {status === "error" && (
        <div className="cx-player-overlay is-error" role="alert">
          <AlertCircle size={40} color="var(--danger)" />
          <b>Stream Unavailable</b>
          <small>{error}</small>
          <button type="button" className="cx-btn cx-btn-primary" onClick={() => setAttempt((a) => a + 1)}>
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      )}
      {mode === "embed" ? (
        status !== "error" && (
          <iframe
            key={attempt}
            src={src}
            title="Live stream"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
            onLoad={() => setStatus("ready")}
          />
        )
      ) : (
        <video ref={videoRef} controls autoPlay muted playsInline />
      )}
    </div>
  );
}
