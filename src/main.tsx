import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
// Side-effect import: registers the `beforeinstallprompt` listener
// before React mounts so we don't miss the event on first paint.
import "./notifications/installPrompt.ts";
import { AdminApp } from "./admin/AdminApp.tsx";
import { App } from "./app/App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// Single-page-app fallback in wrangler routes every path to index.html,
// so we pick the screen here. /admin* is gated by Cloudflare Access at
// the edge — by the time this code runs the user has already
// authenticated.
const isAdminRoute = window.location.pathname.startsWith("/admin");

createRoot(root).render(
  <StrictMode>{isAdminRoute ? <AdminApp /> : <App />}</StrictMode>,
);
