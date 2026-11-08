# Layout changes

Files changed:

- `src/styles.css`: shared editorial font, photo radius, pill radius, and shadow tokens using existing palette tokens.
- `src/views/AppLayout.vue`: mobile floating navigation, safe-area spacing, filled active tab, subtle blur and shadow. Mobile tabs are Today, Discover, Matches, Events, Profile. Desktop order, labels, and styling remain intact.
- `src/router.js`: added only `/app/likes`.
- `src/views/Likes.vue`: two-column received likes, generic private cards, aggregate count, loading, error/retry, empty and failed-image states.
- `src/views/Matches.vue`: original inline SVG of three pinned, tilted sports portraits, one heading and one Discover button when empty. Existing populated conversations remain intact.
- `src/views/Profile.vue`: personal photo deck and Likes link. The deck uses up to three photos from the existing editable profile data, with Avatar fallback. Activating it scrolls to and focuses the existing inline PhotoManager; no duplicate uploader or profile fetch. There was no single header avatar in this checkout, so the deck was added above the existing profile summary.
- `tests/likes-layout.test.mjs`: executes the view setup with mocked APIs to verify privacy boundaries, revoked entitlement, empty data, aggregate validation and errors.
- `DESIGN_NOTES.md`: decisions and verification.

## API audit and limits

Read `discover.ts`, `swipes.ts`, `today.ts`, `billing.ts`, `feature-db.ts` and the backend route table without editing them.

- `/api/billing/config` exposes `active`, derived from `plusMember`. That helper accepts active/trialing subscriptions with a future period end.
- `/api/discover?likes=1` checks `plusMember` before querying or returning profiles. This view requests it only after an affirmative entitlement response. The server remains the authority, including when entitlement expires between requests. Errors clear profiles and expose retry.
- Non-Plus members request only billing configuration and `/api/today/badges`. The latter already returns the safe numeric `likesYou` aggregate, with no liker IDs, names or photos. Placeholders contain only an original generic SVG silhouette. Up to six placeholder cards illustrate the aggregate, with the actual aggregate shown as text. No CSS blur or hidden personal data.
- The aggregate and discovery queries have different eligibility filters. Discovery also excludes already-swiped members and returns at most 30 profiles. The Plus grid represents that existing eligible subset, with no invented pagination or total.
- `swipes.ts` supports POST only. No Sent listing endpoint exists, so the Received/Sent toggle is omitted as requested. Proposal: add an authenticated, paginated Sent endpoint returning only the viewer's still-eligible liked targets, enforcing blocks, pauses and current visibility rules. Backend implementation is outside this change.
- No Boost, Super Likes, paywall, new imagery, backend changes, SQL, deployments or hosted-service verification.

## Design and accessibility

Existing forest, mint, off-white and coral tokens are reused. Georgia provides the existing editorial serif treatment with coral italic highlights. The user's explicit rounded cards, pill, soft shadows and nav blur override AGENTS.md's general restrictions only for these requested patterns. No explanatory paragraphs or secondary labels were added to these layouts.

All new controls have text or accessible names, inherit visible focus outlines, and use no animation. Failed photo loads fall back to Avatar. Profile decks show one card for one photo and Avatar for none; only the member's own profile uses the deck.

## Verification

- `npm test`: 140 passed, 0 failed after fixing a window access during server rendering caught by the first run.
- `npm run build`: passed in `/tmp/pacemate-layout-build.w28t4m`, using a copy of the working tree and the installed dependencies. This runs the unchanged complete build command while confining its backend bundle writes to the temporary copy. No checkout file under `supabase/` was changed by this task. Build emitted a non-fatal bundler timing diagnostic.
- `git diff --check`: passed.
- Reviewed sizing at 375px and 430px by CSS calculation: the nav has 12px side insets, five flexible tabs and short labels; likes uses two `minmax(0,1fr)` columns with a 16px gap; the profile deck reserves 112px plus 30px for its gap. Page bottom padding reserves 116px plus the safe-area inset for the floating bar.
- No browser automation or browser session is available here. Actual visual rendering at both widths, safe-area behavior on a device, image failures, keyboard interaction, and authenticated end-to-end states remain unverified in a browser. API checks used local mocks only.
- Pre-existing working-tree edits, including Discover and backend changes, were left untouched and excluded from this commit.
