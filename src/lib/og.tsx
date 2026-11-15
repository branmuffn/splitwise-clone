// Link-preview cards (Open Graph images) for shared links (Brian, 2026-11-15). Drawn with next/og (built into Next.js).
// Brand green #1cc29f, matching the app header. Emoji are dropped from the card (the image renderer has no emoji font).
export const OG_SIZE = { width: 1200, height: 630 };

export const plain = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

export function Card({ kicker, title, lines }: { kicker: string; title: string; lines: string[] }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1cc29f", padding: "64px 72px", color: "#ffffff", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: "#ffffff", color: "#0f9f82", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 700 }}>S</div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>Splitwise<span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 10 }}>clone</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 34, opacity: 0.9 }}>{kicker}</div>
        <div style={{ display: "flex", fontSize: title.length > 26 ? 66 : 84, fontWeight: 700, lineHeight: 1.05, marginTop: 8 }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.16)", borderRadius: 20, padding: "22px 28px" }}>
        {lines.map((l) => <div key={l} style={{ display: "flex", fontSize: 32 }}>{l}</div>)}
      </div>
    </div>
  );
}
