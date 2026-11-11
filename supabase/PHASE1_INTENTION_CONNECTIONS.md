# Phase 1 intention-aware connections

This local implementation depends on `migrations/20261111010000_intention_connections.sql`.
The migration has not been run. Do not deploy the changed backend or frontend against
a database that still has pair-only swipe and match uniqueness.

## Deployment gates

1. Reconcile the empty hosted migration ledger against the actual hosted catalog. Do not
   replay or mark the historical canonical migrations as applied.
2. Verify a downloadable backup and rehearse a restore before changing hosted schema.
3. Re-run the migration preflights against the approved test database. Confirm that there
   are no inbound foreign keys to `swipes`, that the pair indexes and constraints still
   have the expected definitions, and that the direct-chat insert trigger is unchanged.
4. Pause swipe writes while applying the migration. The existing application uses the
   old `(swiper_id, target_id)` conflict target, which cannot safely write after the
   intention-specific uniqueness cutover.
5. Apply the migration through the separately approved baseline process, then deploy the
   backend bundle generated from the matching source. Deploy the frontend after the
   backend is healthy.
6. Run authenticated smoke tests for discovery, reciprocal swipes, separate intentions,
   unmatch, archived chat, blocking, attachments, reactions, read receipts and push
   suppression before reopening tester traffic.

## Data and relationship compatibility

The migration adds a surrogate `swipes.id` identity. PostgreSQL assigns values to the
existing rows while the identity column is added; those records retain their pair and
their `intention` remains NULL. `acted_at` is populated from the existing `created_at`
timestamp, then future writes use the database clock. The sequence is owned by the
identity column. Verify its next value against the maximum ID during the staging smoke
check before enabling swipe traffic.

Existing match, conversation, message, attachment and reply IDs are not rewritten. The
conversation primary key remains the match ID, and the conversation-to-match foreign key
remains in place. The hosted message equality check (`messages.conversation_id =
messages.match_id`) remains valid because each new conversation is still created with
the corresponding match ID. Legacy matches and swipes retain NULL intention; no
historical intent is inferred.

New swipe uniqueness is directional pair plus intention, while legacy rows retain one
unknown-intention row per direction. Matches retain one legacy pair row and allow one
active row per canonical pair and intention. Closed intention-specific matches remain
in history and do not prevent a later rematch with a new match and conversation ID.
Conversations remain unique by their match-backed primary key; the old pair-only
conversation uniqueness is removed.

## Rollback limits

Before any intention-specific records are written, the application can be rolled back
only after restoring old pair uniqueness and the prior schema through a reviewed forward
migration or restore. After separate intentions exist, restoring pair-only uniqueness
would require deleting or merging valid connections and is not an acceptable rollback.
Use a forward fix or restore from the verified pre-migration backup instead. Do not
delete archived chats or reclassify NULL-intention history as part of recovery.

The existing Plus entitlement functions and subscription records are not changed by
this migration. Entitlement checks remain server-side.
