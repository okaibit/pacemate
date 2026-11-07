import {rows,rateLimit} from "../server/feature-db.ts";
import { storePhoto, deletePhotos, readImage } from "../server/supabase.ts";
import { handle, json, requireUser, HttpError } from "../server/http.ts";

const TYPES: Record<string,string>={jpg:'image/jpeg',png:'image/png',webp:'image/webp'};

export default handle(async (req, ctx) => {

  if (req.method === "GET") {
    if (!ctx.params.user || !ctx.params.file) throw new HttpError(404, "Photo not found.");
    const key = `${ctx.params.user}/${ctx.params.file}`;
    return Response.redirect(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/photos/${key.split("/").map(encodeURIComponent).join("/")}`, 302);
  }

  if (req.method === "POST") {
    const user = await requireUser(req);
    await rateLimit(user.id,"profile-photo",30,86400);
    let image;try{image=await readImage(req);}catch(error){throw new HttpError(error.message==='IMAGE_TOO_LARGE'?413:415,'Upload a JPEG, PNG or WebP under 2 MB.');}
    const {data:buf,ext}=image;
    const key = `${user.id}/${crypto.randomUUID()}.${ext}`;
    await storePhoto(key, buf, TYPES[ext]);
    return json({ key }, 201);
  }

  if (req.method === "DELETE") {
    const user = await requireUser(req);
    if (ctx.params.user !== user.id) throw new HttpError(403, "You can only delete your own photos.");
    const key=`${ctx.params.user}/${ctx.params.file}`;
    if((await rows("SELECT 1 FROM public.profiles WHERE id=$1 AND $2=ANY(photos)",[user.id,key])).length)throw new HttpError(409,"Remove this photo from your profile and save first.");
    await deletePhotos([`${ctx.params.user}/${ctx.params.file}`]);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
});

