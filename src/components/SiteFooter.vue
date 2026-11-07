<template>
  <footer class="wrap foot">
    <span><b>Pacemate</b> · Find someone who shares your pace.</span>
    <nav aria-label="Legal">
      <RouterLink to="/safety">Safety</RouterLink>
      <RouterLink to="/privacy">Privacy</RouterLink>
      <RouterLink to="/terms">Terms</RouterLink>
    </nav>
  </footer>
</template>
<style scoped>
.foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:24px;padding-bottom:40px;color:var(--mute);font-size:14px;border-top:1px solid var(--line);margin-top:40px}
nav{display:flex;gap:16px}
</style>
