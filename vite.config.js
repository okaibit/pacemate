import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { FAQ, DEFAULT_DESCRIPTION, structuredData } from "./src/seo.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Adds JSON-LD and a plain-HTML summary inside #app. Vue replaces the summary
// on load; crawlers and AI bots that don't run JavaScript still read it.
function seo() {
  return {
    name: "pacemate-seo",
    transformIndexHtml(html) {
      const json = JSON.stringify(structuredData()).replace(/</g, "\\u003c");
      const faq = FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
      const fallback = `<main class="prerender"><h1>Pacemate: find someone who shares your pace</h1><p>${esc(DEFAULT_DESCRIPTION)}</p>` +
        `<p><a href="/signup">Join free</a> · <a href="/login">Log in</a> · <a href="/safety">Safety</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>` +
        `<h2>Frequently asked questions</h2>${faq}</main>`;
      return html
        .replace("</head>", `<script type="application/ld+json">${json}</script>\n</head>`)
        .replace('<div id="app"></div>', `<div id="app">${fallback}</div>`);
    },
  };
}

export default defineConfig({ plugins: [vue(), seo()] });
