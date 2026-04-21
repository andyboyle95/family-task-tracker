-- RPC function to safely increment points
create or replace function public.increment_points(user_id uuid, amount integer)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set points = points + amount
  where id = user_id;
end;
$$;

-- Generate a random 6-char uppercase invite code
create or replace function public.generate_invite_code()
returns text language plpgsql as $$
declare
  code text;
  exists boolean;
begin
  loop
    code := upper(substring(md5(random()::text) from 1 for 6));
    select count(*) > 0 into exists from public.families where invite_code = code;
    exit when not exists;
  end loop;
  return code;
end;
$$;
