import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ward Family Hub",
    short_name: "Ward Hub",
    description: "Private household management for the Ward family.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9f7f3",
    theme_color: "#3f6b52",
    categories: ["finance", "productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android) for these.
    shortcuts: [
      { name: "How much do we need until…?", short_name: "Need until", url: "/?until=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add expense", short_name: "Expense", url: "/?add=expense", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add income", short_name: "Income", url: "/?add=income", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Transactions", url: "/finances/transactions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Bills", url: "/finances/bills", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
