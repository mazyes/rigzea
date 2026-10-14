-- 19_listing_notify_cap.sql
-- "Link opened" Telegram alerts were limited per visitor and per workspace (20/hour), but the visitor
-- id comes from the browser, so rotating it let one person send up to 20 alerts an hour about a single
-- listing. This adds a cap of 3 alerts per listing per hour. Counting (link_events) is unchanged.
--
-- The live function is patched in place (its definition is read and one condition is added) so any
-- live-only differences from patch 14 are kept. It fails instead of silently doing nothing.
do $patch$
declare
  v_def text := pg_get_functiondef('public.track_link_event_notify(text,text,text,uuid)'::regprocedure);
  v_new text;
begin
  if position('per listing cap' in v_def) > 0 then return; end if;  -- already applied
  v_new := replace(v_def, '>= 20 then',
    '>= 20
     -- per listing cap: rotating the visitor id must not flood the chat
     or (select count(*) from public.link_events
         where apartment_id = v_apt.id and notified_at > now() - interval ''60 minutes'') >= 3 then');
  if v_new = v_def then raise exception 'track_link_event_notify: expected ">= 20 then" not found, patch not applied'; end if;
  execute v_new;
end
$patch$;
