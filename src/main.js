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
const mark=document.createElement('img');mark.src='/logo-mark.svg';mark.alt='';mark.setAttribute('aria-hidden','true');mark.className='boot-mark';
const message=document.createElement('span');message.textContent='Getting you on track…';
const track=document.createElement('div');track.className='boot-track';track.setAttribute('aria-hidden','true');
boot.append(mark,brand,message,track);document.body.append(boot);
initAuth().finally(() => {createApp(App).use(router).mount("#app");boot.remove();});
