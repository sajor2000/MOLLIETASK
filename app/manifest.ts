import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dental Task OS",
    short_name: "TaskOS",
    description: "Task management for your practice, personal life, and family",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e0f",
    theme_color: "#0c0e0f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
