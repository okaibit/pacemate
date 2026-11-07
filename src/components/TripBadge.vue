<script setup>
import { computed } from "vue";
import { session } from "../auth.js";
import { activeTrip, sameCity, tripDate } from "../options.js";
// Shows "Arriving in Lisbon on 12 Nov". When the trip is to the viewer's current city it uses the accent colour.
const props = defineProps({ person: { type: Object, required: true }, small: Boolean });
const trip = computed(() => activeTrip(props.person));
const toMe = computed(() => !!trip.value && props.person.id !== session.profile?.id
  && (props.person.arrivingToMe ?? sameCity(trip.value.city, session.profile?.currentCity)));
</script>
<template>
  <span v-if="trip" class="trip" :class="{ me: toMe, small }">
    <span aria-hidden="true">✈</span>
    {{ toMe ? "Arriving in your city" : `Arriving in ${trip.city}` }} on {{ tripDate(trip.date) }}
  </span>
</template>
<style scoped>
.trip{display:inline-flex;align-items:center;gap:6px;background:var(--soft);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:14px;font-weight:700}
.trip.me{background:var(--coral);border-color:var(--coral);color:#0F2A22}
.trip.small{font-size:12px;padding:2px 9px}
</style>
