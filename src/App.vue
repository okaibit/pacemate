<script setup>
import { watch } from "vue";
import { router } from "./router.js";
import { session } from "./auth.js";
watch(() => session.user, user => {
  if (!user && router.currentRoute.value.meta.auth) router.replace("/login");
});
</script>
<template>
  <RouterView v-if="session.ready && (!router.currentRoute.value.meta.auth || session.user)" />
</template>
