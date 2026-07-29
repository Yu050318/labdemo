create function private.validate_preferences_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.timezone
  ) then
    raise exception using
      errcode = '23514',
      message = 'user_preferences.timezone must be a valid IANA timezone.';
  end if;

  return new;
end;
$$;

create trigger user_preferences_validate_timezone
before insert or update of timezone on public.user_preferences
for each row execute function private.validate_preferences_timezone();

revoke all on function private.validate_preferences_timezone()
from public, anon, authenticated;
