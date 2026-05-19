import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
// Side-effect import: registers the `beforeinstallprompt` listener
// before React mounts so we don't miss the event on first paint.
import "./notifications/installPrompt.ts";
import { App } from "./app/App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
