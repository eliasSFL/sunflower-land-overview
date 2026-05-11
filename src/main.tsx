import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { App } from "./app/App.tsx";
import { registerServiceWorker } from "./sw-register.ts";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
