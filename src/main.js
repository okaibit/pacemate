import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";
import { initAuth } from "./auth.js";
import "./styles.css";
import { registerWorker } from "./pwa.js";
registerWorker().catch(() => {});

const boot=document.createElement('div');
boot.className='app-boot';boot.setAttribute('role','status');
const brand=document.createElement('strong');brand.textContent='Pacemate';
const message=document.createElement('span');message.textContent='Opening your account…';
boot.append(brand,message);document.body.append(boot);
initAuth().finally(() => {createApp(App).use(router).mount("#app");boot.remove();});
