<script setup>
import { ref } from "vue";
import { session } from "../auth.js";
import { photoUrl, uploadPhoto } from "../api.js";

const emit=defineEmits(["busy"]);
const photos = defineModel({ type: Array, default: () => [] });
const busy = ref(false), err = ref("");
const MAX = 6;

async function onFile(e) {
  const files = [...(e.target.files || [])].slice(0, MAX - photos.value.length);
  e.target.value = "";
  if (!files.length) return;
  const userId=session.user?.id;
  busy.value = true; emit("busy",true); err.value = "";
  try { for (const f of files) photos.value = [...photos.value, await uploadPhoto(f,userId)]; }
  catch (x) { err.value = x.message; }
  finally { busy.value = false; emit("busy",false); }
}
function remove(key) {
  photos.value = photos.value.filter((k) => k !== key);
}
function makeMain(key) { photos.value = [key, ...photos.value.filter((k) => k !== key)]; }
</script>

<template>
  <div>
    <ul class="grid">
      <li v-for="(k, i) in photos" :key="k">
        <img :src="photoUrl(k)" :alt="i === 0 ? 'Main photo' : 'Photo ' + (i + 1)">
        <span v-if="i === 0" class="main">Main</span>
        <div class="acts">
          <button v-if="i > 0" type="button" @click="makeMain(k)">Make main</button>
          <button type="button" @click="remove(k)" :aria-label="'Remove photo ' + (i + 1)">Remove</button>
        </div>
      </li>
      <li v-if="photos.length < MAX" class="add">
        <label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple class="sr-only" @change="onFile" :disabled="busy">
          <span>{{ busy ? "Uploading…" : "+ Add photo" }}</span>
        </label>
      </li>
    </ul>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <p class="mute small">Up to {{ MAX }} photos. Clear photos of your face, ideally doing your sport, get the most likes.</p>
  </div>
</template>

<style scoped>
.grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
li{position:relative;aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:var(--soft)}
img{width:100%;height:100%;object-fit:cover;display:block}
.main{position:absolute;top:6px;left:6px;background:var(--coral);color:#0F2A22;font-size:12px;font-weight:700;border-radius:12px;padding:2px 8px}
.acts{position:absolute;inset:auto 0 0;display:flex;gap:4px;padding:6px;background:rgba(16,44,35,.48)}
.acts button{flex:1;font-size:12px;border:0;border-radius:12px;padding:5px;background:var(--card);color:#0F2A22;cursor:pointer}
.add label{display:grid;place-items:center;height:100%;border:2px dashed var(--line);border-radius:12px;cursor:pointer;font-weight:700;color:var(--mute)}
.add label:focus-within{outline:3px solid var(--coral)}
</style>
