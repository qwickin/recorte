import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { EMBED } from "./lib/env";
import "./styles.css";

if (EMBED) document.documentElement.classList.add("embed");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
