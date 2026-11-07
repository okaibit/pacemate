<script setup>
import { ref, watch, nextTick } from "vue";
import Modal from "./Modal.vue";
import { api } from "../api.js";
import { REPORT_REASONS } from "../options.js";
const props = defineProps({ person: Object });
const emit = defineEmits(["close", "done"]);
const reportForm=ref(null);
const mode = ref("menu"), reason = ref(""), details = ref(""), err = ref(""), busy = ref(false);
watch(mode,async()=>{await nextTick();reportForm.value?.querySelector("select")?.focus();});
async function send(kind) {
  if (kind === "report" && !reason.value) { err.value = "Choose a reason."; return; }
  busy.value = true; err.value = "";
  try {
    await api(`/api/${kind}`, { method: "POST", body: { userId: props.person.id, reason: reason.value, details: details.value } });
    emit("done", kind);
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <Modal :label="'Safety options for ' + person.name" @close="emit('close')">
      <template v-if="mode === 'menu'">
        <h2 style="font-size:24px">{{ person.name }}</h2>
        <p class="mute">Blocking hides you from each other and ends any match. They are not told.</p>
        <div class="stack">
          <button class="btn ghost block" :disabled="busy" @click="send('block')">Block {{ person.name }}</button>
          <button class="btn danger block" @click="mode = 'report'">Report {{ person.name }}</button>
          <button class="btn ghost block" @click="emit('close')">Cancel</button>
        </div>
      </template>
      <form v-else ref="reportForm" @submit.prevent="send('report')">
        <h2 style="font-size:24px;margin-bottom:12px">Report {{ person.name }}</h2>
        <label class="field"><span>Reason</span>
          <select v-model="reason"><option value="" disabled>Choose a reason</option><option v-for="r in REPORT_REASONS" :key="r">{{ r }}</option></select>
        </label>
        <label class="field"><span>Anything else we should know? (optional)</span><textarea v-model="details" maxlength="1000"></textarea></label>
        <p class="mute small">Reporting also blocks this member. If you are in danger, contact local emergency services.</p>
        <div class="row"><button type="button" class="btn ghost grow" @click="mode = 'menu'">Back</button><button class="btn danger grow" :disabled="busy">Send report</button></div>
      </form>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
  </Modal>
</template>
