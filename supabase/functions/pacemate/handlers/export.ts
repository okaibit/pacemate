import {handle,json,requireUser,HttpError} from '../server/http.ts';
import {rows,rateLimit} from '../server/feature-db.ts';
import {signedPhoto} from '../server/supabase.ts';

// Table names and ownership columns are server-owned, never interpolated from
// arbitrary input. Each response is bounded; the browser assembles the download.
const sections={
  profile:['profiles','id','id'],checkins:['checkins','user_id','day'],workouts:['workouts','user_id','id'],
  dailyAnswers:['daily_answers','user_id','day'],challenges:['challenge_members','user_id','month,challenge_id'],
  notificationSettings:['notification_settings','user_id','user_id'],notifications:['notifications','user_id','id'],
  pushSubscriptions:['push_subscriptions','user_id','id'],travelPlans:['travel_plans','user_id','id'],billingCustomer:['billing_customers','user_id','user_id'],subscription:['subscriptions','user_id','user_id'],
  swipes:['swipes','swiper_id','target_id'],messages:['messages','sender_id','id'],sessionMessages:['event_messages','sender_id','id'],
  hostedSessions:['events','host_id','id'],rsvps:['rsvps','user_id','event_id'],blocks:['blocks','blocker_id','blocked_id'],reports:['reports','reporter_id','id'],
  verification:['verification_requests','user_id','created_at'],attachments:['chat_attachments','user_id','id'],
};
export default handle(async(req)=>{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed');
  const user=await requireUser(req),params=new URL(req.url).searchParams,section=params.get('section');
  if(!section){await rateLimit(user.id,'export',3,3600);return json({account:{id:user.id,email:user.email,createdAt:user.created_at},sections:[...Object.keys(sections),'matches']});}
  const offset=Math.max(0,Number(params.get('offset'))||0);
  if(!Number.isSafeInteger(offset)||offset>10000000)throw new HttpError(422,'Invalid export position.');
  let records;
  if(section==='matches')records=await rows('SELECT * FROM public.matches WHERE user_a=$1 OR user_b=$1 ORDER BY id LIMIT 101 OFFSET $2',[user.id,offset]);
  else{
    const config=Object.hasOwn(sections,section)?sections[section]:null;if(!config)throw new HttpError(422,'Unknown export section.');
    const [table,owner,order]=config;
    const privateFields={verification:'id,status,note,created_at,reviewed_at',reports:'id,reported_id,reason,details,status,resolution,created_at,reviewed_at',pushSubscriptions:'id,endpoint,created_at',notificationSettings:'email_matches,email_messages,email_sessions,email_streaks,push_enabled,timezone,reminder_hour'};
    const fields=privateFields[section]||'*';
    records=await rows(`SELECT ${fields} FROM public.${table} WHERE ${owner}=$1 ORDER BY ${order} LIMIT 101 OFFSET $2`,[user.id,offset]);
  }
  const hasMore=records.length>100;records.splice(100);
  if(section==='attachments'){
    for(let start=0;start<records.length;start+=5)await Promise.all(records.slice(start,start+5).map(async record=>{record.downloadUrl=await signedPhoto('chat',record.object_key,3600);}));
  }
  if(section==='profile')for(const profile of records)profile.photoDownloads=(profile.photos||[]).map(key=>`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/photos/${key.split('/').map(encodeURIComponent).join('/')}`);
  return json({section,records,hasMore,nextOffset:offset+records.length});
});
