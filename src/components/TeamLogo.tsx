import { initials } from "@/lib/format";

export default function TeamLogo({
  name,
  logo,
  size = 44,
}: {
  name: string;
  logo?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: size * 0.28 };
  if (logo) {
    return (
      <img
        className="cx-team-logo"
        src={logo}
        alt={name}
        style={style}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <span className="cx-team-fallback" style={style}>
      {initials(name)}
    </span>
  );
}