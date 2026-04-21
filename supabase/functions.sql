-- RPC: safely increment points on a profile
create or replace function public.increment_points(user_id uuid, amount integer)
returns void language plpgsql security definer as $$
begin
  update public.profiles set points = points + amount where id = user_id;
end;
$$;
