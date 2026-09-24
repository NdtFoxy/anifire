import type { Metadata } from "next";

export const metadata: Metadata = { title: "Нет соединения — Anifire" };

/** Served by the service worker when a navigation fails for lack of network. */
export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
        background: "#0A0707",
        color: "#f2f2f5",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- must render from the SW cache with no optimizer */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 16 }} />
        <h1 style={{ fontSize: 24, margin: "20px 0 8px" }}>Нет соединения</h1>
        <p style={{ margin: 0, lineHeight: 1.5, color: "rgba(255,255,255,0.65)" }}>
          Проверьте интернет и попробуйте снова. Когда связь вернётся, страница откроется как обычно.
        </p>
        <a
          href="/stream"
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "12px 22px",
            borderRadius: 10,
            background: "#e11d2e",
            color: "#fff",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Повторить
        </a>
      </div>
    </main>
  );
}
