<script setup>
import {COUNTRIES,CURRENCIES} from '../money.js';
const props=defineProps({modelValue:Object,disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
function update(key,value){emit('update:modelValue',{...props.modelValue,[key]:value||null});}
</script>
<template><div class="money-preferences"><label class="field"><span>Your country or territory</span><select :value="modelValue.countryCode" :disabled="disabled" @change="update('countryCode',$event.target.value)"><option v-for="country in COUNTRIES" :key="country.code" :value="country.code">{{country.name}}</option></select></label><label class="field"><span>Display currency</span><select :value="modelValue.displayCurrency" :disabled="disabled" @change="update('displayCurrency',$event.target.value)"><option v-for="currency in CURRENCIES" :key="currency.code" :value="currency.code">{{currency.code}} · {{currency.symbol}}</option></select></label><p>Display preferences do not change your subscription’s billing currency. Prices and past payments retain their original currency.</p></div></template>
<style scoped>.money-preferences p{font-size:12px;line-height:1.6;color:var(--mute)}select{max-width:100%}</style>
