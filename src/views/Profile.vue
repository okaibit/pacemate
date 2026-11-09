<script setup>
import {COUNTRIES} from "../money.js";
import { reactive, ref, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { api, photoUrl } from "../api.js";
import {disablePush} from '../composables/usePush.js';
import { session, logout } from "../auth.js";
import { GENDERS, GOALS, LEVELS, ROUTINES, WORK, SPORTS, CITIES, utcToday, tripMaxDate } from "../options.js";
import ProfileFoundationSummary from "../components/ProfileFoundationSummary.vue";
import Avatar from "../components/Avatar.vue";
import PhotoManager from "../components/PhotoManager.vue";
import Modal from "../components/Modal.vue";
import ProfileCard from "../components/ProfileCard.vue";
import InstallApp from "../components/InstallApp.vue";

const router = useRouter();
const photoSection=ref(null), editor=ref(null), editorOpen=ref(false), activeTab=ref('plus');
async function openEditor(photos=false){
  editorOpen.value=true;
  await nextTick();
  const target=photos?photoSection.value:editor.value;
  target?.scrollIntoView({block:'start',behavior:'instant'});
  target?.querySelector('button,input,textarea')?.focus({preventScroll:true});
}
const editingRoutine=ref(false);
const selectedRoutine=computed(()=>[...f.sports,f.level,f.routine,f.workStyle].filter(Boolean));
const failedPhotos=ref(new Set());
function openPhotos(){openEditor(true);}
function photoFailed(key){failedPhotos.value=new Set([...failedPhotos.value,key]);}
const p = session.profile;
const f = reactive({
  name: p.name, birthdate: p.birthdate, gender: p.gender, interestedIn: [...p.interestedIn], ageMin: p.ageMin, ageMax: p.ageMax,
  goal: p.goal, sports: [...p.sports], level: p.level, routine: p.routine, workStyle: p.workStyle,
  ...(p.countryCode?{countryCode:p.countryCode}:{}),homeCity: p.homeCity, currentCity: p.currentCity, nextCity: p.nextCity || "", nextArrival: p.nextArrival || "", bio: p.bio, photos: [...p.photos], paused: p.paused,
});
const photoBusy=ref(false),foundationRevision=ref(0);
const busy = ref(false), err = ref(""), saved = ref(false), preview = ref(false), del = ref(false), delText = ref("");
const toggle = (arr, v, max = 99) => { const i = arr.indexOf(v); i > -1 ? arr.splice(i, 1) : arr.length < max && arr.push(v); };
const asPublic = computed(() => ({ ...session.profile, ...f, age: session.profile.age, verified: session.profile.verified && JSON.stringify(f.photos)===JSON.stringify(session.profile.photos) }));

async function save() {
  if(photoBusy.value)return;
  busy.value = true; err.value = ""; saved.value = false;
  try {
    session.profile = (await api("/api/me", { method: "PUT", body: f })).profile;
    saved.value = true;foundationRevision.value++;
  } catch (e) { err.value = e.message; }
  finally { busy.value = false; }
}
async function clearTrip() {
  const before = { nextCity: f.nextCity, nextArrival: f.nextArrival };
  f.nextCity = ""; f.nextArrival = "";
  if (session.profile.nextCity) { await save(); if (err.value) Object.assign(f, before); }
}
async function signOut() { try { await logout(); router.replace("/"); } catch(e) { err.value=e.message; } }
async function deleteAccount() {
  busy.value = true;
  try { await disablePush(); await api("/api/me", { method: "DELETE" }); await logout(); router.replace("/"); }
  catch (e) { err.value = e.message; busy.value = false; }
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-heading">
      <h1>My profile<span>.</span></h1>
      <RouterLink class="settings-link" to="/app/settings" aria-label="Profile settings"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M4 17h16"/><path d="M8 4v6m8 4v6"/></svg><span>Settings</span></RouterLink>
    </header>
    <div class="profile-portrait">
      <button type="button" class="photo-deck" :class="{stacked:f.photos.length>1}" aria-label="Manage your photos" @click="openPhotos">
        <template v-if="f.photos.length">
          <span v-for="(key,i) in f.photos.slice(0,3)" :key="key" class="deck-card" :class="'deck-card-'+i">
            <img v-if="!failedPhotos.has(key)" :src="photoUrl(key)" :alt="i===0?'Your main profile photo':'Your profile photo '+(i+1)" @error="photoFailed(key)">
            <Avatar v-else :person="{name:f.name}" :size="72"/>
          </span>
        </template>
        <Avatar v-else :person="{name:f.name}" :size="96"/>
      </button>
      <div class="portrait-copy">
        <div class="portrait-heading"><h2>{{ f.name }}<span>, {{ session.profile.age }}</span></h2><button type="button" class="edit-link" @click="openEditor()" aria-label="Edit your profile"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8l-4-4L5 15Z"/></svg></button></div>
        <p class="profile-city">{{ f.currentCity || f.homeCity }}</p>
        <ProfileFoundationSummary :key="foundationRevision" />
      </div>
    </div>
    <div class="profile-shortcuts">
      <button type="button" @click="preview=true"><span>View my profile</span><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <RouterLink to="/app/likes"><span>My likes</span><span class="likes-heart" aria-hidden="true">❤️</span></RouterLink>
    </div>
    <div class="profile-tabs" role="tablist" aria-label="Profile resources">
      <button id="plus-tab" ref="plusTab" type="button" role="tab" :aria-selected="activeTab==='plus'" :tabindex="activeTab==='plus'?0:-1" aria-controls="plus-panel" @click="activeTab='plus'" @keydown.right.prevent="activeTab='tips';$refs.tipsTab.focus()" @keydown.left.prevent="activeTab='tips';$refs.tipsTab.focus()">Pacemate Plus</button>
      <button id="tips-tab" ref="tipsTab" type="button" role="tab" :aria-selected="activeTab==='tips'" :tabindex="activeTab==='tips'?0:-1" aria-controls="tips-panel" @click="activeTab='tips'" @keydown.left.prevent="activeTab='plus';$refs.plusTab.focus()" @keydown.right.prevent="activeTab='plus';$refs.plusTab.focus()">Profile tips</button>
    </div>
    <section v-if="activeTab==='plus'" id="plus-panel" role="tabpanel" aria-labelledby="plus-tab" tabindex="0" class="plus-panel">
      <div class="plus-feature"><p class="plus-brand"><img class="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true">Pacemate <span>PLUS</span></p><h2>More possibilities.</h2><RouterLink class="plus-action" to="/app/plus">Explore Plus <span aria-hidden="true">↗</span></RouterLink></div>
      <div class="benefit"><span class="benefit-number">01</span><div><h3>See who likes you</h3><p>A familiar spark. Make the next move.</p><RouterLink class="edit-link" to="/app/likes">View my likes</RouterLink></div></div>
      <div class="benefit"><span class="benefit-number">02</span><div><h3>Take your pace places</h3><p>Plan trips to up to five cities and meet people before you arrive.</p><RouterLink class="edit-link" to="/app/plus#travel-plans">Plan my trips</RouterLink></div></div>
      <p class="likes-note">Unlimited likes are included for everyone.</p>
    </section>
    <section v-else id="tips-panel" role="tabpanel" aria-labelledby="tips-tab" tabindex="0" class="tips-panel">
      <div class="benefit"><span class="benefit-number">01</span><div><h3>Start with a clear photo</h3><p>Let people put a face to your name.</p><button type="button" class="edit-link" @click="openPhotos">Manage photos</button></div></div>
      <div class="benefit"><span class="benefit-number">02</span><div><h3>Make it personal</h3><p>Your favourite route or next training goal is a good place to start.</p><button type="button" class="edit-link" @click="openEditor()">Edit my profile</button></div></div>
      <div class="benefit"><span class="benefit-number">03</span><div><h3>Find a shared rhythm</h3><p>Add your availability and the connections you are open to.</p><RouterLink class="edit-link" to="/app/profile/edit">Complete my profile</RouterLink></div></div>
    </section>
    <p v-if="err" class="err" role="alert">{{ err }}</p>
    <div v-if="editorOpen" ref="editor" class="profile-editor">
    <form @submit.prevent="save" class="stack">
      <section ref="photoSection" class="card photos-section"><h2>Photos</h2><PhotoManager v-model="f.photos" @busy="photoBusy=$event" /></section>

      <section class="card">
        <h2>About you</h2>
        <label class="field"><span>Name</span><input type="text" v-model="f.name" maxlength="30"></label>
        <label class="field"><span>Bio</span><textarea v-model="f.bio" maxlength="500"></textarea></label>
        <label class="field"><span>Gender</span><select v-model="f.gender"><option v-for="g in GENDERS" :key="g">{{ g }}</option></select></label>
        <label class="field"><span>Looking for</span><select v-model="f.goal"><option v-for="g in GOALS" :key="g">{{ g }}</option></select></label>
        <p class="mute small">Age {{ session.profile.age }}. To correct your date of birth, contact support.</p>
      </section>

      <section class="card">
        <div class="routine-heading">
          <h2>Sports and routine</h2>
          <button type="button" class="link" :aria-expanded="editingRoutine" aria-controls="routine-options" @click="editingRoutine=!editingRoutine">{{ editingRoutine ? 'Done' : 'Edit' }}</button>
        </div>
        <template v-if="!editingRoutine">
          <ul v-if="selectedRoutine.length" class="chips routine-selection" aria-label="Your sports and routine"><li v-for="value in selectedRoutine" :key="value" class="tag">{{ value }}</li></ul>
          <button v-else type="button" class="link" @click="editingRoutine=true">Add sports and routine</button>
        </template>
        <div v-else id="routine-options">
        <p class="lbl">Sports (up to 8)</p>
        <div class="chips"><button type="button" v-for="s in SPORTS" :key="s" class="chip" :aria-pressed="f.sports.includes(s)" @click="toggle(f.sports, s, 8)">{{ s }}</button></div>
        <p class="lbl">Level</p>
        <div class="chips"><button type="button" v-for="l in LEVELS" :key="l" class="chip" :aria-pressed="f.level === l" @click="f.level = f.level === l ? '' : l">{{ l }}</button></div>
        <p class="lbl">When you train</p>
        <div class="chips"><button type="button" v-for="r in ROUTINES" :key="r" class="chip" :aria-pressed="f.routine === r" @click="f.routine = f.routine === r ? '' : r">{{ r }}</button></div>
        <p class="lbl">How you work</p>
        <div class="chips"><button type="button" v-for="w in WORK" :key="w" class="chip" :aria-pressed="f.workStyle === w" @click="f.workStyle = f.workStyle === w ? '' : w">{{ w }}</button></div>
        </div>
      </section>

      <section class="card">
        <h2>Location</h2><label class="field"><span>Country or territory</span><select v-model="f.countryCode"><option disabled :value="undefined">Choose your country</option><option v-for="country in COUNTRIES" :key="country.code" :value="country.code">{{country.name}}</option></select></label>
        <datalist id="pcities"><option v-for="c in CITIES" :key="c" :value="c" /></datalist>
        <label class="field"><span>Home city</span><input type="text" v-model="f.homeCity" list="pcities" maxlength="60"></label>
        <label class="field"><span>Where you are now</span><input type="text" v-model="f.currentCity" list="pcities" maxlength="60"></label>
        <p class="lbl">Planning a trip?</p>
        <p class="mute small" style="margin:0 0 8px">People in that city can match with you before you arrive. Members see only the city and date.</p>
        <div class="row">
          <label class="field grow"><span>Heading to</span><input type="text" v-model="f.nextCity" list="pcities" maxlength="60" placeholder="e.g. Lisbon"></label>
          <label class="field grow"><span>Arriving on</span><input type="date" v-model="f.nextArrival" :min="utcToday()" :max="tripMaxDate()"></label>
        </div>
        <button v-if="f.nextCity || f.nextArrival" type="button" class="btn ghost sm" :disabled="busy||photoBusy" @click="clearTrip">Clear trip</button>
      </section>

      <section class="card">
        <h2>Discovery preferences</h2>
        <p class="lbl">Show me</p>
        <div class="chips"><button type="button" v-for="g in GENDERS" :key="g" class="chip" :aria-pressed="f.interestedIn.includes(g)" @click="toggle(f.interestedIn, g)">{{ g }}</button></div>
        <div class="row" style="margin-top:12px">
          <label class="field grow"><span>From age</span><input type="number" min="18" max="99" v-model.number="f.ageMin"></label>
          <label class="field grow"><span>To age</span><input type="number" min="18" max="99" v-model.number="f.ageMax"></label>
        </div>
        <label class="row"><input type="checkbox" v-model="f.paused" style="width:20px;height:20px"> Pause my profile (hide me from Discover, keep my matches)</label>
      </section>

      <p v-if="saved" class="ok" role="status">Saved.</p>
      <button class="btn block" :disabled="busy||photoBusy">{{ busy ? "Saving…" : photoBusy ? "Uploading…" : "Save changes" }}</button>
    </form>
    </div>

    <InstallApp/>
    <section class="card stack account-section" style="margin-top:24px">
      <h2>Account</h2>
      <p class="mute small" style="margin:0">Signed in as {{ session.user?.email }}</p>
      <div class="row">
        <button class="btn ghost" @click="signOut">Log out</button>
        <RouterLink class="btn ghost" to="/safety">Safety tips</RouterLink>
      </div>
      <button v-if="!del" class="link" style="color:var(--danger);text-align:left" @click="del = true">Delete my account</button>
      <div v-else class="stack">
        <p style="margin:0">This cancels any active subscription and permanently deletes your profile, photos, matches and messages. Type <b>DELETE</b> to confirm.</p>
        <input type="text" v-model="delText" aria-label="Type DELETE to confirm">
        <div class="row">
          <button class="btn ghost" @click="del = false; delText = ''">Cancel</button>
          <button class="btn danger" :disabled="delText !== 'DELETE' || busy" @click="deleteAccount">Delete forever</button>
        </div>
      </div>
    </section>

    <Modal v-if="preview" label="Profile preview" flush @close="preview=false">
        <ProfileCard :person="asPublic"><button class="btn block" style="margin-top:14px" @click="preview = false">Close preview</button></ProfileCard>
    </Modal>
  </div>
</template>

<style scoped>
.profile-page{min-width:0}.profile-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}.profile-heading h1{font:700 clamp(32px,5vw,46px)/1.05 var(--display);letter-spacing:-.045em}.profile-heading h1>span{color:var(--coral)}
.settings-link{display:flex;align-items:center;gap:8px;text-decoration:none;font-size:12px;min-height:44px}.settings-link svg{flex:none}.profile-portrait{display:flex;align-items:center;gap:32px;border:1px solid var(--line);padding:30px 28px;background:var(--bg);border-radius:26px}
.photo-deck{position:relative;display:grid;place-items:center;width:112px;height:148px;flex:none;border:0;padding:0;background:none;cursor:pointer;border-radius:18px}.deck-card{position:absolute;inset:0;border:2px solid var(--bg);overflow:hidden;background:var(--soft);display:grid;place-items:center;border-radius:18px}.deck-card img{width:100%;height:100%;object-fit:cover}.deck-card-0{z-index:3}.deck-card-1{z-index:2;transform:translateX(-8px) rotate(-6deg);filter:brightness(.88)}.deck-card-2{z-index:1;transform:translateX(8px) rotate(6deg);filter:brightness(.88)}.photo-deck :deep(.av){border-radius:18px}
.portrait-copy{flex:1;min-width:0}.portrait-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.portrait-heading h2{font:600 clamp(24px,4vw,32px)/1.15 var(--display);margin:0;overflow-wrap:anywhere}.portrait-heading h2>span{font-weight:400}.profile-city{color:var(--mute);font-size:13px;margin:8px 0 16px}
.edit-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;background:none;border:0;padding:0;color:var(--ink);cursor:pointer;font:500 12px var(--body);text-underline-offset:4px}.portrait-heading .edit-link{width:44px;flex:none}
.profile-shortcuts{display:flex;gap:0;margin:16px 0 30px;border:1px solid var(--line);border-radius:20px;overflow:hidden}.profile-shortcuts>a,.profile-shortcuts>button{flex:1;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;min-height:60px;background:none;color:var(--ink);border:0;text-decoration:none;font:500 13px var(--body);cursor:pointer}.likes-heart{font-size:22px;line-height:1;flex:none}.profile-shortcuts>a{border-left:1px solid var(--line)}
.profile-tabs{display:flex;border-bottom:1px solid var(--line);margin-bottom:22px}.profile-tabs button{flex:1;background:none;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;padding:16px 8px;font:600 14px var(--body);color:var(--mute);cursor:pointer;min-height:52px}.profile-tabs button[aria-selected=true]{border-bottom-color:var(--coral);color:var(--ink)}
.plus-feature{position:relative;padding:22px 24px;background:var(--premium-bg);color:var(--premium-ink);border-radius:26px}.plus-brand{display:flex;align-items:center;gap:10px;margin:0 0 12px;font:500 20px var(--editorial)}.plus-brand span{border-radius:6px;padding:3px 6px;border:1px solid currentColor;font:700 10px var(--body);letter-spacing:.12em;color:var(--premium-ink)}.plus-feature h2{font:400 clamp(26px,4vw,32px)/1.1 var(--editorial);letter-spacing:-.025em;margin:0 0 16px}.plus-feature>p:not(.plus-brand){font-size:13px;margin:0 0 26px;opacity:.8}.plus-action{display:inline-flex;align-items:center;gap:32px;padding:12px 18px;background:var(--cta);color:var(--on);text-decoration:none;font-size:13px;font-weight:700;min-height:46px;border-radius:999px}.plus-action span{font-size:20px;line-height:1;color:var(--on)}
.benefit{display:flex;align-items:flex-start;gap:20px;padding:24px 4px;border-bottom:1px solid var(--line)}.benefit-number{padding-top:3px;font:400 14px var(--editorial);color:var(--coral)}.benefit h3{font:600 17px var(--display);margin:0 0 6px}.benefit p{font-size:13px;line-height:1.6;color:var(--mute);margin:0;max-width:420px}.likes-note{font-size:12px;color:var(--mute);margin:16px 0 0}.tips-panel .edit-link{justify-content:flex-start;text-decoration:underline}
.profile-editor{margin-top:32px;scroll-margin-top:100px;border-top:1px solid var(--line)}.profile-editor>summary{display:flex;justify-content:space-between;align-items:center;list-style:none;padding:22px 0;font:600 18px var(--display);cursor:pointer}.profile-editor>summary::-webkit-details-marker{display:none}.profile-editor>summary span{font-size:23px;font-weight:400}.profile-editor[open]>summary span{transform:rotate(45deg)}.profile-editor form{padding-bottom:12px}.profile-page :deep(.card){border-radius:24px;box-shadow:none;background:var(--card)}.profile-page :deep(.btn),.profile-page :deep(.chip),.profile-page :deep(.tag){border-radius:999px;transition:none}.profile-page :deep(.btn:hover){transform:none;box-shadow:none;filter:none}.profile-page :deep(input),.profile-page :deep(select),.profile-page :deep(textarea){border-radius:12px!important;background:var(--field)!important}
.profile-editor h2,.account-section h2{font-size:20px;margin-bottom:12px}.lbl{font-weight:700;font-size:14px;margin:16px 0 8px}.photos-section{scroll-margin-top:100px}.routine-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:12px}.routine-heading h2{margin:0}.routine-selection{list-style:none;margin:0;padding:0}.account-section{margin-top:24px!important}.profile-page :deep(.photos li),.profile-page :deep(.photos .add label){border-radius:18px;overflow:hidden}
@media(max-width:480px){.profile-heading{margin-bottom:22px}.profile-portrait{padding:24px 18px;gap:22px}.photo-deck{width:86px;height:118px}.portrait-heading h2{font-size:23px}.portrait-heading{gap:2px}.portrait-heading .edit-link{width:30px}.profile-city{font-size:12px;margin:6px 0 12px}.settings-link{font-size:0;gap:0;width:44px;justify-content:center}.profile-shortcuts>a,.profile-shortcuts>button{padding:16px 14px;font-size:12px}.plus-feature{padding:20px 22px}.plus-brand{margin-bottom:12px}.benefit{gap:16px}}
@media(max-width:360px){.profile-portrait{gap:16px;padding:22px 14px}.photo-deck{width:70px;height:104px}.portrait-heading h2{font-size:20px}}
</style>

<style scoped>.plus-brand{font-family:var(--display);font-weight:800;letter-spacing:-.04em}</style>
