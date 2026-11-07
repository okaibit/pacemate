import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import { initAuth } from "./auth.js";
import "./styles.css";
import { registerWorker } from "./pwa.js";
registerWorker().catch(() => {});

initAuth().finally(() => createApp(App).use(router).mount("#app"));
