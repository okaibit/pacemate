<script setup>
import { ref, computed } from "vue";
import { CITIES } from "../options.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Start typing your city" },
  maxlength: { type: Number, default: 60 },
});
const emit = defineEmits(["update:modelValue"]);

const input = ref(null);
const open = ref(false);

// A few matching cities, computed only from what the person has typed.
const matches = computed(() => {
  const q = props.modelValue.trim().toLowerCase();
  if (!q) return [];
  const starts = [], inside = [];
  for (const city of CITIES) {
    const lower = city.toLowerCase();
    if (lower === q) return [];
    if (lower.startsWith(q)) starts.push(city);
    else if (lower.includes(q)) inside.push(city);
  }
  return starts.concat(inside).slice(0, 6);
});

function onInput(event) {
  emit("update:modelValue", event.target.value);
  open.value = true;
}
function pick(city) {
  emit("update:modelValue", city);
  open.value = false;
  input.value?.blur();
}
</script>

<template>
  <div class="city-input">
    <input
      ref="input"
      type="text"
      :value="modelValue"
      :maxlength="maxlength"
      :placeholder="placeholder"
      autocomplete="off"
      autocapitalize="words"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="done"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open && matches.length > 0"
      @input="onInput"
      @focus="open = true"
      @blur="open = false"
    >
    <ul v-if="open && matches.length" class="city-list" role="listbox">
      <li v-for="city in matches" :key="city" role="option" @pointerdown.prevent="pick(city)">{{ city }}</li>
    </ul>
  </div>
</template>

<style scoped>
.city-input{position:relative;width:100%}
.city-input input{width:100%;min-width:0;min-height:54px;padding:14px;box-sizing:border-box;background:var(--bg);color:var(--ink);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:12px;font:400 16px var(--body)}
.city-input input:focus{outline:none;border-color:var(--green)}
.city-list{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 6px);margin:0;padding:6px;list-style:none;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.25);max-height:240px;overflow:auto}
.city-list li{padding:12px 14px;border-radius:10px;cursor:pointer}
.city-list li:hover,.city-list li:active{background:color-mix(in srgb,var(--ink) 10%,transparent)}
</style>
