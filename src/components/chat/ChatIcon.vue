<script setup>
defineProps({name:String});
const paths={back:'m15 18-6-6 6-6',video:'M15 8l6-3v14l-6-3M3 6h12v12H3z',phone:'M6 3l4 4-3 3c2 4 3 5 7 7l3-3 4 4c-1 6-9 3-14-2S-1 4 6 3z',plus:'M12 5v14M5 12h14',camera:'M3 7h4l2-3h6l2 3h4v14H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',send:'m4 4 17 8-17 8 3-8-3-8zM7 12h14',sticker:'M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h.01M15 8h.01M8 12q4 4 8 0',forward:'m13 5 7 6-7 6v-4c-6 0-8 2-10 6 0-8 4-10 10-10z',link:'m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',more:'M12 5h.01M12 12h.01M12 19h.01'};
</script>
<template><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]||paths.more"/></svg></template>
