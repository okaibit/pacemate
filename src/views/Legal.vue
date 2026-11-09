<script setup>
import SiteFooter from "../components/SiteFooter.vue";
defineProps({ doc: String });
const CONTACT = "trypacemate@gmail.com";
const UPDATED = "7 November 2026";
</script>

<template>
  <div class="wrap"><nav class="top"><RouterLink to="/" class="logo brand-lockup"><img class="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true">Pacemate</RouterLink></nav></div>
  <main class="narrow legal">
    <template v-if="doc === 'privacy'">
      <h1>Privacy policy</h1>
      <p class="mute">Last updated {{ UPDATED }}</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your email address and a securely hashed password, or your sign-in provider ID.</li>
        <li><b>Profile:</b> name, date of birth, gender, who you want to meet, sports, level, training routine, work style, cities, an optional upcoming trip (city and arrival date only), bio and photos.</li>
        <li><b>Activity:</b> likes and passes, matches, messages, event RSVPs, events you host, and blocks and reports.</li>
        <li><b>Community:</b> session conversations, optional verification selfies, notification preferences and push subscriptions. If you subscribe, we retain payment-provider customer and subscription references; card details are handled by Stripe.</li>
        <li><b>Wellbeing:</b> daily check-ins (areas of life, mood, sleep hours, private notes), workouts you log, answers to the question of the day, and challenges you join.</li>
      </ul>
      <h2>How we use it</h2>
      <p>We use your data to run Pacemate: to show your profile to members who fit your preferences, create matches, deliver messages, list events, and keep the community safe. We do not sell your data or use it for third-party advertising.</p>
      <h2>Who can see what</h2>
      <p>Other members see your public profile: name, age (never your date of birth), gender, sports, level, routine, work style, cities, bio and photos. You can also share a future city and arrival date; other members can see it, and you can remove it at any time. Match conversations and shared chat photos are available to the matched members. Read receipts show when messages have been acknowledged. Private photos use expiring links, but recipients may save copies. Members can see who is going to an event. Your check-ins, mood, sleep and notes are private to you. Your matches can see workouts you log and send kudos. Your recent answer to the question of the day shows on your profile. If you join a challenge, your name, first photo and progress appear on its leaderboard.</p>
      <h2>Verification and moderation</h2>
      <p>Authorised moderators review reports, manage account restrictions, remove profile photos, and compare verification selfies with submitted profile photos. Verification is a manual photo comparison, not a legal identity or background check. Selfies are private, deleted after review or withdrawal, and abandoned requests expire after 30 days.</p>
      <h2>Notifications and service providers</h2>
      <p>Email and browser push notifications are optional. When configured and enabled, email delivery uses Resend and browser push uses your browser’s push service. You can change preferences in Settings or unsubscribe from email. Optional subscriptions use Stripe. Distance search compares city centres; a configured geocoding provider may receive city names, never GPS coordinates or a home address.</p>
      <h2>Sensitive information</h2>
      <p>Information about who you want to meet can reveal your sexual orientation. We only use it to match you and never share it outside the app.</p>
      <h2>Where it is stored</h2>
      <p>Data is stored with Supabase and its infrastructure partners. Data may be processed outside your country, with appropriate safeguards.</p>
      <h2>Your rights</h2>
      <p>You can view and edit your profile, pause it, download your account data from Settings, and delete your account from the profile screen. Account deletion cancels a recorded subscription before removing the account. Deleting your account permanently removes your profile, photos, likes, matches and messages. We may keep reports about your account where needed for safety or legal reasons. If you are in the EU or UK, you also have the right to access, correct, port and object to processing of your data. Contact us at <a :href="'mailto:'+CONTACT">{{ CONTACT }}</a>.</p>
      <h2>Cookies</h2>
      <p>We use essential browser storage to keep you signed in. We do not use advertising or tracking cookies.</p>
      <h2>Age</h2>
      <p>Pacemate is for adults 18 and over. We delete accounts we find belong to minors.</p>
    </template>

    <template v-else-if="doc === 'terms'">
      <h1>Terms of service</h1>
      <p class="mute">Last updated {{ UPDATED }}</p>
      <h2>Who can join</h2>
      <p>You must be at least 18 and legally able to agree to these terms. One account per person.</p>
      <h2>Your profile</h2>
      <p>Be yourself. Use your own photos and accurate details. You keep ownership of what you post, and you give Pacemate permission to display it to other members in order to run the service.</p>
      <h2>Community rules</h2>
      <ul>
        <li>Be respectful. No harassment, hate, threats or unwanted sexual content.</li>
        <li>No nudity in photos, and no impersonation.</li>
        <li>No spam, scams, selling, or asking for money.</li>
        <li>Events must be real, legal, and in places that are safe to meet.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules.</p>
      <h2>Events and meeting in person</h2>
      <p>Events are organised by members or by Pacemate. Sport carries risk: take part within your ability and at your own risk. Pacemate does not run background checks on members. Read our <RouterLink to="/safety">safety tips</RouterLink>.</p>
      <h2>Ending your account</h2>
      <p>You can delete your account at any time from your profile.</p>
      <h2>Liability</h2>
      <p>Pacemate is provided as is. To the extent allowed by law, we are not liable for the conduct of members on or off the app.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: <a :href="'mailto:'+CONTACT">{{ CONTACT }}</a>.</p>
    </template>

    <template v-else>
      <h1>Safety tips</h1>
      <p class="mute">Meet in public, stay within your limits, and trust your instincts.</p>
      <h2>Before you meet</h2>
      <ul>
        <li>Chat in the app first. Do not share your home address, bank details or ID.</li>
        <li>Never send money, however good the story sounds. Report anyone who asks.</li>
        <li>Video call first if you want to be sure someone is who they say they are.</li>
      </ul>
      <h2>Your first session</h2>
      <ul>
        <li>Meet somewhere public and busy, like a community event, a park run or a busy gym or wall.</li>
        <li>Tell a friend where you are going and when you expect to be back.</li>
        <li>Get yourself there and home. Pick a route and distance you are comfortable with.</li>
        <li>Train within your ability, and bring water and your phone.</li>
      </ul>
      <h2>If something feels wrong</h2>
      <p>Leave. Then use <b>Block or report</b> on their profile or in your chat. Blocking hides you from each other immediately. If you are in danger, contact local emergency services.</p>
    </template>
  </main>
  <SiteFooter />
</template>

<style scoped>
.top{padding:18px 0}.logo{font:800 22px var(--display);text-decoration:none}
.legal{padding-top:20px}
h1{font-size:38px;margin-bottom:6px}
h2{font-size:21px;margin:26px 0 8px}
li{margin:6px 0}
</style>
