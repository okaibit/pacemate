# Quoted message replies

Apply `review/20261109010000_message_replies.sql` to the test project in Supabase SQL Editor. It adds a nullable message reference and an index; existing messages, access grants and RLS policies remain unchanged. This file is not automatically applied.

Deploy the `pacemate` function and publish the frontend. Reopen the conversation after applying the SQL. Before the column exists, the API reports replies unavailable and the client leaves ordinary messaging usable.

Swipe a saved message to the right to reply. The composer shows the selected author and text/photo preview. Cancel removes the selection without deleting the draft. Sending stores the original message ID; the API checks that it exists in the same active conversation. Quoted text is fetched from the original by the server, never trusted from the sender. Quotes are limited to 240 characters and remain available when the original is outside the loaded message page. Deleting an original sets its reference to null.

Test on two accounts: reply to an incoming and an outgoing message, a photo, and a message in older history. Reopen the chat on both accounts to check persistence. Vertical scrolling and short/cancelled drags should not select a reply. Free and Plus use the same functionality.
