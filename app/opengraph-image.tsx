import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/site";

export const alt = "LedgerAI — your AI-native personal finance copilot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b1220 0%, #101a34 60%, #0b1220 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 32, fontWeight: 600 }}>LedgerAI</div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
          Your money,
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            backgroundImage: "linear-gradient(90deg, #3b82f6, #7c3aed)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          finally understood.
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 24, color: "#94a3b8", maxWidth: 820 }}>
          {SITE_DESCRIPTION.split(" — ")[0]}
        </div>
      </div>
    ),
    { ...size },
  );
}
