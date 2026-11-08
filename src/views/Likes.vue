<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api, photoUrl } from '../api.js';
import { session } from '../auth.js';
import Avatar from '../components/Avatar.vue';
const people=ref([]),count=ref(null),plus=ref(false),loading=ref(true),error=ref('');
const failed=ref(new Set());
const viewer=session.user?.id;
let disposed=false;
function photoFailed(id){failed.value=new Set([...failed.value,id]);}
async function load(){
 loading.value=true;error.value='';people.value=[];count.value=null;plus.value=false;
 try{
  const billing=await api('/api/billing/config',{expectedUserId:viewer});
  if(disposed)return;
  plus.value=billing.active===true;
  if(plus.value){
   const result=await api('/api/discover?likes=1',{expectedUserId:viewer});
   if(!disposed)people.value=result.people;
  }else{
   // Only this aggregate response is requested for non-Plus members.
   const badges=await api('/api/today/badges',{expectedUserId:viewer});
   if(!disposed&&Number.isSafeInteger(badges.likesYou)&&badges.likesYou>=0)count.value=badges.likesYou;
  }
 }catch(e){if(!disposed){people.value=[];error.value=e.message;}}
 finally{if(!disposed)loading.value=false;}
}
onMounted(load);
onBeforeUnmount(()=>{disposed=true;people.value=[];});
</script>
<template>
 <section class="likes-page" :aria-busy="loading">
  <h1>Likes <em>received.</em></h1>
  <p v-if="loading" role="status">Loading likes…</p>
  <div v-else-if="error" role="alert"><p class="err">{{ error }}</p><button class="btn ghost" @click="load">Try again</button></div>
  <template v-else-if="plus">
   <div v-if="people.length" class="likes-grid">
    <RouterLink v-for="person in people" :key="person.id" :to="`/app/profile/member/${encodeURIComponent(person.id)}`" class="like-card" :aria-label="`View ${person.name}'s profile`">
     <img v-if="person.photos?.[0]&&!failed.has(person.id)" :src="photoUrl(person.photos[0])" :alt="person.name+' profile photo'" loading="lazy" @error="photoFailed(person.id)">
     <Avatar v-else :person="{name:person.name}" :size="72"/>
     <span>{{ person.name }}</span>
    </RouterLink>
   </div>
   <h2 v-else class="empty">No likes yet.</h2>
  </template>
  <template v-else>
   <h2 class="likes-count">{{ count===null?'Received':count===1?'1 like':count+' likes' }}</h2>
   <div v-if="count!==0" class="likes-grid" aria-label="Private likes">
    <div v-for="n in Math.min(count??2,6)" :key="n" class="like-card placeholder" aria-hidden="true">
     <svg viewBox="0 0 120 160" fill="none"><circle cx="60" cy="57" r="20"/><path d="M20 137v-12a40 40 0 0 1 80 0v12"/></svg>
    </div>
   </div>
  </template>
 </section>
</template>
<style scoped>
h1{font:400 clamp(32px,6vw,46px)/1.1 var(--editorial);margin:14px 0 30px}em{color:var(--coral)}
.likes-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.like-card{position:relative;aspect-ratio:3/4;border-radius:var(--radius-photo);overflow:hidden;border:1px solid var(--line);background:var(--soft);display:grid;place-items:center;text-decoration:none;min-width:0}.like-card>img{width:100%;height:100%;object-fit:cover}.like-card>span:not(.av){position:absolute;bottom:0;left:0;right:0;padding:10px 12px;background:var(--bg);font-weight:700;overflow-wrap:anywhere}.placeholder svg{width:70%;stroke:var(--green);stroke-width:2;opacity:.35}.likes-count{font:400 24px var(--editorial);margin:0 0 20px}.empty{font:400 30px var(--editorial);text-align:center;padding:80px 0}
</style>
