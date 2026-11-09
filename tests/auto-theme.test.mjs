import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('public/auto-theme.js','utf8');
function clock(hour,minute){
 const time={hour,minute},events={},dataset={},style={},meta={},intervals=[];let writes=0;
 const document={documentElement:{dataset,style},visibilityState:'visible',querySelector:()=>({setAttribute:(key,value)=>{meta[key]=value;writes++;}}),addEventListener:(name,fn)=>events[name]=fn};
 const window={setInterval:(fn,delay)=>intervals.push({fn,delay}),addEventListener:(name,fn)=>events[name]=fn};
 class LocalDate{getHours(){return time.hour;}getMinutes(){return time.minute;}getUTCHours(){throw Error('UTC must not choose the theme');}}
 vm.runInNewContext(script,{document,window,Date:LocalDate});
 return {time,events,dataset,style,meta,intervals,document,writes:()=>writes};
}
test('initial local-time boundaries select exactly the requested day and night periods',()=>{
 for(const [h,m,theme] of [[0,0,'dark'],[5,59,'dark'],[6,0,'light'],[12,0,'light'],[18,29,'light'],[18,30,'dark'],[23,59,'dark']])assert.equal(clock(h,m).dataset.theme,theme,`${h}:${m}`);
});
test('one lightweight minute timer transitions across both boundaries while the app stays open',()=>{
 const c=clock(5,59);assert.equal(c.intervals.length,1);assert.equal(c.intervals[0].delay,60000);
 c.time.hour=6;c.time.minute=0;c.intervals[0].fn();assert.equal(c.dataset.theme,'light');assert.equal(c.style.colorScheme,'light');assert.equal(c.meta.content,'#F5F2EB');
 c.time.hour=18;c.time.minute=30;c.intervals[0].fn();assert.equal(c.dataset.theme,'dark');assert.equal(c.style.backgroundColor,'#0D1B15');assert.equal(c.meta.content,'#0D1B15');
});
test('resuming, focusing or restoring a page rechecks the local clock immediately',()=>{
 for(const event of ['visibilitychange','pageshow','focus']){const c=clock(12,0);c.time.hour=20;c.events[event]();assert.equal(c.dataset.theme,'dark');}
});
test('unchanged theme does not repeatedly mutate the document or consult OS preference or stored overrides',()=>{
 const c=clock(12,0),writes=c.writes();for(let i=0;i<10;i++)c.intervals[0].fn();assert.equal(c.writes(),writes);
 assert.ok(!script.includes('matchMedia'));assert.ok(!script.includes('localStorage'));
});
test('clock changes backwards or timezone adjustments are respected on the next check',()=>{
 const c=clock(22,0);c.time.hour=9;c.intervals[0].fn();assert.equal(c.dataset.theme,'light');c.time.hour=4;c.events.focus();assert.equal(c.dataset.theme,'dark');
});
test('theme is applied in the HTML head and the offline fallback uses the same script',()=>{
 const html=readFileSync('index.html','utf8');assert.ok(html.indexOf('src="/auto-theme.js"')<html.indexOf('</head>'));
 assert.ok(readFileSync('public/offline.html','utf8').includes('src="/auto-theme.js"'));
});
test('color token contracts preserve high-contrast primary actions and the dark Plus promotion',()=>{
 const css=readFileSync('src/styles.css','utf8');assert.match(css,/--bg:#F5F2EB/);assert.match(css,/--bg:#0D1B15/);assert.match(css,/--card:#14261E/);assert.match(css,/--line:rgba\(255,255,255,0.08\)/);
 assert.ok(!css.includes('prefers-color-scheme'));assert.ok(!readFileSync('src/views/Today.vue','utf8').includes('prefers-color-scheme'));
 const profile=readFileSync('src/views/Profile.vue','utf8');assert.match(profile,/\.plus-feature\{[^}]*background:var\(--premium-bg\);color:var\(--premium-ink\)/);
 assert.match(css,/--premium-bg:#0D1B15;--premium-ink:#FFFFFF/);
});
