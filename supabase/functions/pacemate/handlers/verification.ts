import {handle,json,requireProfile,HttpError} from '../server/http.ts';
import {rows,rateLimit,arrayParam,transaction} from '../server/feature-db.ts';
import {readImage,uploadPrivate,deletePrivate} from '../server/supabase.ts';

export default handle(async(req)=>{
  const {user,profile}=await requireProfile(req);
  if(req.method==='GET'){
    const [request]=await rows('SELECT id,status,note,created_at,reviewed_at FROM public.verification_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[user.id]);
    return json({verified:!!profile.verified,request:request||null});
  }
  if(req.method==='POST'){
    if(profile.verified)throw new HttpError(409,'Your profile is already verified.');
    if(!profile.photos.length)throw new HttpError(422,'Add a profile photo first.');
    await rateLimit(user.id,'verification',3,86400);
    if((await rows(`SELECT 1 FROM public.verification_requests WHERE user_id=$1 AND status='pending'`,[user.id])).length)throw new HttpError(409,'Your request is awaiting review.');
    let image;
    try{image=await readImage(req);}catch{throw new HttpError(422,'Choose a JPEG, PNG or WebP under 2 MB.');}
    const key=`${user.id}/${crypto.randomUUID()}.${image.ext}`;
    await uploadPrivate('verification',key,image.data,image.type);
    try{
      const [request]=await rows(`INSERT INTO public.verification_requests(user_id,selfie_key,profile_photos) VALUES($1,$2,$3::text[]) RETURNING id,status`,[user.id,key,arrayParam(profile.photos)]);
      return json({request},201);
    }catch(error){await deletePrivate('verification',[key]);throw error;}
  }
  if(req.method==='DELETE'){
    const result=await transaction(async tx=>{
      await tx.unsafe('SELECT id FROM public.profiles WHERE id=$1 FOR UPDATE',[user.id]);
      await tx.unsafe('UPDATE public.profiles SET verified=false WHERE id=$1',[user.id]);
      return tx.unsafe(`UPDATE public.verification_requests SET status='withdrawn',reviewed_at=now() WHERE user_id=$1 AND status IN('pending','approved') RETURNING selfie_key,id`,[user.id]);
    });
    await deletePrivate('verification',result.map(r=>r.selfie_key).filter(Boolean));
    await rows(`UPDATE public.verification_requests SET selfie_key=NULL WHERE user_id=$1 AND status='withdrawn'`,[user.id]);
    return json({ok:true});
  }
  throw new HttpError(405,'Method not allowed');
});
