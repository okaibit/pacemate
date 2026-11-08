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
const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');
mark.setAttribute('viewBox','0 0 32 36');mark.setAttribute('aria-hidden','true');mark.classList.add('boot-mark');
const leaf=document.createElementNS('http://www.w3.org/2000/svg','path');
leaf.setAttribute('d','M6 31C-4 19 3 2 18 2c17 0 17 22 4 29-6 4-11 4-16 0Z');leaf.setAttribute('fill','currentColor');mark.append(leaf);
const message=document.createElement('span');message.textContent='Getting you on track…';
const track=document.createElement('div');track.className='boot-track';track.setAttribute('aria-hidden','true');
boot.append(mark,brand,message,track);document.body.append(boot);
initAuth().finally(() => {createApp(App).use(router).mount("#app");boot.remove();});
