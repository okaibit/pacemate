<script setup>
import {FAQ} from '../seo.js';
import SiteFooter from '../components/SiteFooter.vue';
</script>
<template><main class="wrap help"><RouterLink to="/" class="brand brand-lockup">← <img class="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true">Pacemate</RouterLink><h1>Questions, answered.</h1><details v-for="f in FAQ" :key="f.q"><summary>{{ f.q }}</summary><p>{{ f.a }}</p></details><a class="support" href="mailto:trypacemate@gmail.com">Get in touch </a></main><SiteFooter/></template>
<style scoped>.help{max-width:820px;padding-top:36px;padding-bottom:60px;min-height:75vh}.brand{font:700 20px var(--display);text-decoration:none}h1{font-size:clamp(34px,6vw,52px);margin:44px 0 32px}details{padding:22px 0;border-bottom:1px solid var(--line)}summary{font-weight:700;cursor:pointer}p{color:var(--mute);max-width:65ch;line-height:1.8}.support{display:inline-block;margin-top:32px;font-weight:700}</style>
