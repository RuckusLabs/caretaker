-- Optional: emails you immediately when a caretaker submits notes at
-- sign-out, instead of waiting for the weekly summary.
--
-- This is NOT part of schema.sql on purpose: it embeds your real Resend
-- API key directly in this SQL, and schema.sql is committed to this
-- public repo. Fill in the two placeholders below, then run this file
-- directly in the Supabase SQL editor — don't commit the filled-in
-- version anywhere.
--
-- How it works: a trigger on checkins fires after every update. It only
-- actually sends an email when notes just went from empty to non-empty
-- on a completed (signed-out) shift, so it fires exactly once per shift
-- that has notes, and never for the checklist-only updates that happen
-- throughout a shift. It calls Resend directly from Postgres using the
-- pg_net extension (the same mechanism Supabase's own Database Webhooks
-- use), so no separate server or Edge Function is needed.

create extension if not exists pg_net;

create or replace function notify_shift_notes()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  escaped_name text;
  escaped_notes text;
begin
  if new.notes is null or btrim(new.notes) = '' then
    return new;
  end if;
  if new.signed_out_at is null then
    return new;
  end if;
  if old.notes is not distinct from new.notes then
    return new;
  end if;

  escaped_name := replace(replace(replace(new.name, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  escaped_notes := replace(replace(replace(new.notes, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_RESEND_API_KEY',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Caretaker App <onboarding@resend.dev>',
      'to', jsonb_build_array('YOUR_RECIPIENT_EMAIL'),
      'subject', '🌿 Shift note from ' || new.name,
      'html',
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#17301f;">' ||
        '<h2 style="color:#1f7a41;margin:0 0 12px;">Shift note from ' || escaped_name || '</h2>' ||
        '<p><strong>Shift:</strong> ' || initcap(new.shift) || '</p>' ||
        '<p><strong>Signed in:</strong> ' || to_char(new.signed_in_at, 'Mon DD, YYYY HH12:MI AM') || '</p>' ||
        '<p><strong>Signed out:</strong> ' || to_char(new.signed_out_at, 'Mon DD, YYYY HH12:MI AM') || '</p>' ||
        '<p><strong>Bowel movement:</strong> ' || (case when new.bowel_movement then 'Yes' else 'No' end) || '</p>' ||
        '<p><strong>Ate:</strong> ' || coalesce(initcap(new.ate), 'Not specified') || '</p>' ||
        '<p><strong>Notes:</strong></p>' ||
        '<blockquote style="margin:0;padding:12px 16px;background:#e5f5ea;border-radius:8px;">' || escaped_notes || '</blockquote>' ||
        '</div>'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_shift_notes on checkins;
create trigger trg_notify_shift_notes
after update on checkins
for each row
execute function notify_shift_notes();
