import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Horarios · Hotel Casa 1800",
    short_name: "Horarios",
    description: "Planificación automática de turnos del Hotel Casa 1800",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f9fc",
    theme_color: "#0b4f8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
