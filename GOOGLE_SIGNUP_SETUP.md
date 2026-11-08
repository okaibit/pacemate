# Google signup setup

Google signup and login share the existing Supabase OAuth flow. The frontend reads Auth settings and shows a compact email/Google chooser on `/signup` and `/login`. **Continue with Google** is enabled only when `external.google` is enabled. New members must complete adult-only onboarding before entering the app. Existing members load their profile after authentication.

This document does not confirm that the hosted provider is enabled. No hosted settings were inspected or changed during this work.

## Provider configuration

In the intended Supabase project, open Authentication's provider settings and enable Google using a Google OAuth client ID and client secret. Configure a Web application OAuth client in Google Cloud and use the callback URL supplied by Supabase as its authorized redirect URI.

For the existing project currently configured in this workspace, that callback is:

```text
https://hgnxappuulufvdymodad.supabase.co/auth/v1/callback
```

For a separate test project, copy that test project's callback instead. Configure the Google consent screen and, if its audience is restricted to test users, include the accounts used to test signup. Keep the Google client secret in Supabase provider settings, never in `VITE_*` variables or source control.

In Supabase Auth URL Configuration, allow the frontend return URLs:

```text
http://localhost:5173/
http://127.0.0.1:5173/
```

Add the actual deployed frontend return URL when testing a hosted frontend, and set the appropriate Site URL. The provider callback and frontend return URL are different: Google returns to Supabase; Supabase returns to Pacemate.

No additional frontend dependency or Google client secret is required. The existing ignored `.env.local` needs the intended project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite after changing them.

## Manual verification after separately authorized setup

1. Open `/signup`. Confirm **Continue with Google** is enabled. If loading settings fails, the page now provides Retry rather than silently hiding the failure.
2. Confirm the adult acknowledgement, then choose Google. Email/password fields are unnecessary for this path.
3. Authenticate with a disposable Google account. Confirm the browser returns to the intended frontend origin, the session is verified through Supabase Auth and a new member is sent to onboarding.
4. Confirm an under-18 birthday is rejected by the profile handler. Google authentication alone does not grant access to profile-required app routes.
5. Complete onboarding and confirm the profile saves. Sign out and use Google on `/login`; the existing profile should load.
6. Cancel Google consent and confirm no authenticated app access is granted. Do not record callback tokens or secrets in test reports.

## Location status

Onboarding's city step and Discover's filters offer **Use my location**. Only that explicit action calls browser geolocation and may trigger a permission prompt. Permission is controlled by the browser and user; the app cannot grant it automatically. HTTPS or localhost is required. Permission denial, unsupported browsers and lookup failures all retain manual city entry.

The one-time coordinates are rounded to two decimal places and sent with the member's bearer token to `POST /api/location`. The Edge handler looks for a known city centre within 100 km using the existing `city_coordinates` table. It returns a suggested city only, performs no external geocoding call, and does not persist coordinates. The member can correct the city before saving or searching. In Discover, a suggestion fills only the search field and does not update the profile or run a search automatically. A suggestion does not change an existing home city; it fills the current city instead. Discovery distances remain city-centre based.

This requires the updated Edge Function to be deployed in a later authorized step. Until then, use manual entry if the endpoint is unavailable. No migration is added. Google signup itself neither requests nor grants GPS permission. Permission on localhost does not imply permission on another origin.

Relevant source: `src/views/Auth.vue`, `src/auth-client.js`, `src/auth.js`, `src/views/Onboarding.vue`, `supabase/functions/pacemate/handlers/me.ts`, and `supabase/functions/pacemate/handlers/discover.ts`.
