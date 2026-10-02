import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Waypoint Group Operations",
        short_name: "Waypoint",
        description: "Connected retail distribution operations",
        theme_color: "#0a1b23",
        background_color: "#f3f6f7",
        display: "standalone",
        icons: [
          {
            src: "/waypoint.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // Cache only application assets. Authenticated API data belongs in explicit Dexie stores.
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallbackDenylist: [/^\/api/, /^\/actuator/],
      },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:8081" } },
});
