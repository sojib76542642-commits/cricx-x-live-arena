export default function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
      {/* Icon: Glowing Play Button */}
      <div
        style={{
          width: "36px",
          height: "36px",
          background: "linear-gradient(135deg, #10b981, #059669)",
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 15px rgba(16, 185, 129, 0.4)",
          position: "relative",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M8 5v14l11-7z" />
        </svg>
        {/* Subtle border overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "10px",
            border: "1.5px solid rgba(255,255,255,0.3)",
          }}
        />
      </div>

      {/* Typography: CRICX */}
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 800,
          fontSize: "24px",
          letterSpacing: "1px",
          display: "flex",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        <span style={{ color: "#ffffff" }}>CRIC</span>
        <span
          style={{
            color: "#10b981",
            fontStyle: "italic",
            fontSize: "28px",
            marginLeft: "2px",
            marginTop: "-2px",
            textShadow: "0 0 12px rgba(16, 185, 129, 0.6)",
          }}
        >
          X
        </span>
      </div>
    </div>
  );
}
