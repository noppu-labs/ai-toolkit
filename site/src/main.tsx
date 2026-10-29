import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeSync } from "./components/ThemeSync.tsx";
import catalog from "./generated/catalog.json";
import { catalogSkills } from "./lib/catalog.ts";
import { pageAt } from "./lib/pages.ts";
import { Page } from "./Page.tsx";
import "./css/app.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}
// createRoot replaces the prerendered markup rather than hydrating it: the URL, the
// viewport and the stored preferences can all differ from the build's defaults.
createRoot(root).render(
  <StrictMode>
    <ThemeSync />
    <Page
      page={pageAt(window.location.pathname, catalogSkills(catalog.plugins))}
    />
  </StrictMode>,
);
