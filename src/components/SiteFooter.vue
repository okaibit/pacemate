<template>
  <footer class="foot">
    <div class="wrap foot-inner">
      <div class="brand-block">
        <RouterLink class="brand" to="/" aria-label="Pacemate home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>Pacemate</span>
        </RouterLink>
        <p>Find someone who shares your pace.</p>
      </div>
      <nav aria-label="Help and legal">
        <RouterLink to="/help">Support</RouterLink>
        <RouterLink to="/safety">Safety</RouterLink>
        <RouterLink to="/privacy">Privacy</RouterLink>
        <RouterLink to="/terms">Terms</RouterLink>
      </nav>
      <small>© {{ new Date().getFullYear() }} Pacemate</small>
    </div>
  </footer>
</template>
<style scoped>
.foot{border-top:1px solid var(--line);margin-top:40px;background:var(--soft);color:var(--mute)}
.foot-inner{display:grid;grid-template-columns:1fr auto;gap:28px;padding-top:34px;padding-bottom:38px}
.brand-block{grid-column:1/-1}
.brand{display:inline-flex;align-items:center;gap:11px;color:var(--green);font:700 32px/1 var(--display);letter-spacing:-1.2px;text-decoration:none}
.brand-mark{height:26px;width:26px;flex:none;background:linear-gradient(135deg,#e4eccb 55%,#e3815e 55%);border-radius:50% 50% 50% 7px;transform:rotate(-20deg)}
.brand-block p{font-size:13px;margin:12px 0 0}
nav{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center}
nav a{color:var(--mute);font-size:12px;text-underline-offset:4px}
small{justify-self:end;align-self:center;font-size:11px}
@media(max-width:520px){.foot-inner{grid-template-columns:1fr;gap:24px;padding-top:28px;padding-bottom:30px}.brand{font-size:29px}nav{gap:12px 20px}small{justify-self:start}}
</style>
