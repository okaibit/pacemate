import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse,compileScript} from '@vue/compiler-sfc';
import {rolldown} from 'rolldown';
import {createSSRApp,h} from 'vue';
import {renderToString} from '@vue/server-renderer';

test('signed-in app renders the routed page within navigation, not a standalone photo uploader',async()=>{
 const {descriptor}=parse(readFileSync('src/views/AppLayout.vue','utf8'));
 const script=compileScript(descriptor,{id:'layout-smoke',inlineTemplate:true}).content;
 const built=await rolldown({input:'app-layout-fixture',external:['vue'],plugins:[{name:'layout-fixtures',resolveId(id){
  if(id==='app-layout-fixture')return '\0layout';
  if(id==='vue-router')return '\0route';
  if(id.endsWith('.vue'))return '\0component:'+id;
  if(id==='../auth.js')return '\0auth';
  if(id==='../api.js')return '\0api';
  if(id==='../realtime.js')return '\0realtime';
  if(id==='../notification-poll.js')return fileURLToPath(new URL('../src/notification-poll.js',import.meta.url));
  if(id.endsWith('/server/validation.js'))return fileURLToPath(new URL('../supabase/functions/pacemate/server/validation.js',import.meta.url));
  if(id==='../composables/usePush.js')return '\0push';
 },load(id){
  if(id==='\0layout')return script;
  if(id==='\0route')return `export const useRoute=()=>({path:'/app/discover',meta:{}});`;
  if(id==='\0auth')return `export const session={profile:{name:'Alex',isAdmin:false,suspended:false}};`;
  if(id==='\0realtime')return 'export const subscribe=()=>()=>{};';
  if(id==='\0api')return `export const api=async()=>({unread:0});`;
  if(id==='\0push')return 'export const noteMessage=()=>{};';
  if(id.startsWith('\0component:'))return 'export default {render:()=>null};';
 }}]});
 const result=await built.generate({format:'esm'});await built.close();
 const source=result.output[0].code.replace(/from\s*["']vue["']/g,`from ${JSON.stringify(import.meta.resolve('vue'))}`);
 const {default:Layout}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const app=createSSRApp(Layout);
 app.component('RouterView',{render:()=>h('section',{'data-test':'routed-content'},'Discover profiles')});
 app.component('RouterLink',{props:['to'],setup:(props,{slots})=>()=>h('a',{href:props.to},slots.default?.())});
 const html=await renderToString(app);
 assert.match(html,/data-test="routed-content"/);assert.match(html,/aria-label="App"/);
 for(const label of ['Discover','Matches','Sessions','Today','Profile'])assert.ok(html.includes(label));
 assert.ok(!html.includes('Add photo'));
});
