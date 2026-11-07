<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { updateUser } from "../supabase.js";
import { session } from "../auth.js";

const router = useRouter();
const password = ref(""), err = ref(""), busy = ref(false);
async function save() {
  if (password.value.length < 8) { err.value = "Use at least 8 characters."; return; }
  busy.value = true; err.value = "";
  try {
    await updateUser({ password: password.value });
    session.callback = null;
    window.sessionStorage.removeItem("pacemate-recovery");
    router.replace(session.profile ? "/app/today" : "/onboarding");
  } catch (e) { err.value = e.message || "Could not update your password."; }
  finally { busy.value = false; }
}
</script>
<template>
  <main class="narrow" style="padding-top:60px">
    <form class="card" @submit.prevent="save">
      <h1 style="font-size:28px;margin-bottom:16px">Choose a new password</h1>
      <label class="field"><span>New password</span><input v-model="password" type="password" autocomplete="new-password"></label>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
      <button class="btn block" :disabled="busy">Save password</button>
    </form>
  </main>
</template>
