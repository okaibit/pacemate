// Build step: writes a real HTML file for each public page (privacy.html, terms.html, ...)
// so search engines and AI crawlers that don't run JavaScript can read the page text.
// Visitors with JavaScript see no difference: the app replaces this content when it loads.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createRouter, createMemoryHistory } from "vue-router";
import { SITE_URL, DESCRIPTIONS, structuredData } from "../src/seo.js";

const HELP_DESCRIPTION = "Answers to common questions about using Pacemate, from matching and messages to safety and your account.";

// Titles match the ones in src/router.js, so the page title never changes when the app loads.
const PAGES = [
  { path: "/privacy", file: "privacy.html", title: "Privacy policy", view: "/src/views/Legal.vue", props: { doc: "privacy" } },
  { path: "/terms", file: "terms.html", title: "Terms of service", view: "/src/views/Legal.vue", props: { doc: "terms" } },
  { path: "/safety", file: "safety.html", title: "Safety tips", view: "/src/views/Legal.vue", props: { doc: "safety" } },
  { path: "/help", file: "help.html", title: "Help", view: "/src/views/Help.vue", props: {}, faq: true },
];

const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function swap(html, re, replacement, label) {
  if (!re.test(html)) throw new Error(`prerender: could not find ${label} in dist/index.html`);
  return html.replace(re, () => replacement);
}

export default function prerenderPages() {
  let root = process.cwd();
  let outDir = path.resolve(root, "dist");
  return {
    name: "pacemate-prerender-pages",
    apply: "build",
    configResolved(config) { root = config.root; outDir = path.resolve(config.root, config.build.outDir); },
    async closeBundle() {
      const indexPath = path.join(outDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const template = fs.readFileSync(indexPath, "utf8");

      const server = await createServer({
        root, configFile: false, logLevel: "silent", appType: "custom",
        plugins: [vue()], server: { middlewareMode: true, watch: null, hmr: false },
        optimizeDeps: { noDiscovery: true },
      });
      try {
        for (const page of PAGES) {
          const mod = await server.ssrLoadModule(page.view);
          const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: "/:pathMatch(.*)*", component: { render: () => null } }],
          });
          await router.push(page.path);
          await router.isReady();
          const app = createSSRApp({ render: () => h(mod.default, page.props) });
          app.use(router);
          const body = await renderToString(app);

          const title = `${page.title} · Pacemate`;
          const description = DESCRIPTIONS[page.path] || HELP_DESCRIPTION;
          const url = `${SITE_URL}${page.path}`;
          const graph = structuredData();
          // FAQ markup only belongs on the page that actually shows the FAQ.
          if (!page.faq) graph["@graph"] = graph["@graph"].filter((n) => n["@type"] !== "FAQPage");
          const json = JSON.stringify(graph).replace(/</g, "\\u003c");

          let html = template;
          html = swap(html, /<title>[\s\S]*?<\/title>/, `<title>${attr(title)}</title>`, "<title>");
          html = swap(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(description)}">`, "meta description");
          html = swap(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`, "canonical");
          html = swap(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`, "og:url");
          html = swap(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${attr(title)}">`, "og:title");
          html = swap(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${attr(description)}">`, "og:description");
          html = swap(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${attr(title)}">`, "twitter:title");
          html = swap(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${attr(description)}">`, "twitter:description");
          html = swap(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${json}</script>`, "JSON-LD");
          html = swap(html, /<div id="app">[\s\S]*?<\/main><\/div>/, `<div id="app"><div class="prerender">${body}</div></div>`, "#app fallback");

          fs.writeFileSync(path.join(outDir, page.file), html);
          console.log(`prerendered ${page.path} -> ${page.file}`);
        }
      } finally {
        await server.close();
      }
    },
  };
}
