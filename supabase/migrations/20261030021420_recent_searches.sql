-- One bounded row per account; delete automatically when the account is deleted.
create table public.recent_searches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  queries text[] not null default '{}',
  constraint recent_searches_bounded check (
    cardinality(queries) <= 10 and coalesce(array_ndims(queries),1) = 1
    and octet_length(array_to_string(queries,'')) <= 4800
  )
);
alter table public.recent_searches enable row level security;
revoke all on public.recent_searches from anon, authenticated;
grant select, insert, update, delete on public.recent_searches to authenticated;
create policy recent_searches_owner on public.recent_searches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ON CONFLICT holds a row lock: simultaneous device searches cannot lose entries.
create function public.remember_search(p_query text) returns void
language plpgsql security invoker set search_path = '' as $$
declare cleaned text := btrim(p_query);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if cleaned is null or char_length(cleaned) not between 1 and 120 then
    raise exception 'Invalid search' using errcode='22023';
  end if;
  insert into public.recent_searches(user_id,queries)
    values(auth.uid(),array[cleaned])
  on conflict(user_id) do update set queries = array[cleaned] || array(
    select old.query from unnest(recent_searches.queries) with ordinality as old(query,position)
    where lower(btrim(old.query)) <> lower(cleaned)
    order by old.position limit 9
  );
end;
$$;
revoke all on function public.remember_search(text) from public, anon;
grant execute on function public.remember_search(text) to authenticated;
