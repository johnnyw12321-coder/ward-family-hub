-- =============================================================================
-- Wishlist link previews filled by whoever views the list
--
-- Previews are fetched when someone opens a list, not only when the owner
-- saves, so items added before previews existed (or saved while a shop was
-- down) catch up. The viewer usually isn't the item's owner and can't edit it,
-- so a narrow function fills in only the preview fields: the link's title,
-- site and a picture copied from the link. It can never replace a photo
-- someone took, change the link, or touch an item the caller can't see.
-- =============================================================================

alter table public.wish_items add column link_checked_at timestamptz;

-- Items that were previewed when saved count as checked.
update public.wish_items set link_checked_at = updated_at where link_url is not null and link_title is not null;

create or replace function public.save_wish_link_preview(
  p_household_id uuid,
  p_item_id      uuid,
  p_link_url     text,
  p_title        text,
  p_site         text,
  p_image_path   text
)
returns text  -- the previous link picture, for the caller to tidy up
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.wish_items;
begin
  if p_household_id not in (select private.writer_household_ids()) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  select * into v_item from public.wish_items
   where id = p_item_id and household_id = p_household_id
   for update;
  -- A surprise is invisible to its recipient, so it doesn't exist for them here either.
  if not found or (v_item.is_surprise and v_item.owner_user_id = auth.uid()) then
    raise exception 'That idea no longer exists.' using errcode = 'P0002';
  end if;
  -- The link changed since the preview was fetched: the newer save wins.
  if v_item.link_url is distinct from p_link_url then
    return null;
  end if;
  if p_image_path is not null
     and p_image_path !~ ('^' || p_household_id::text || '/' || p_item_id::text || '/[0-9a-f-]{36}$') then
    raise exception 'Invalid picture.' using errcode = '22023';
  end if;

  update public.wish_items
     set link_title = left(nullif(trim(p_title), ''), 200),
         link_site = left(nullif(trim(p_site), ''), 120),
         link_checked_at = now(),
         image_path = case when v_item.image_source = 'photo' or p_image_path is null then image_path else p_image_path end,
         image_source = case when v_item.image_source = 'photo' or p_image_path is null then image_source else 'link' end
   where id = p_item_id;

  return case when p_image_path is not null and v_item.image_source = 'link' then v_item.image_path end;
end;
$$;
revoke all on function public.save_wish_link_preview(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.save_wish_link_preview(uuid, uuid, text, text, text, text) to authenticated;

-- Copying a link's picture into an item's folder needs only that you can see
-- the item (attaching it still goes through the function above). Removing
-- pictures stays limited to the people who can edit the item.
drop policy wishlist_bucket_insert on storage.objects;
create policy wishlist_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wishlist'
    and private.storage_path_part(objects.name, 1) in (select private.writer_household_ids())
    and exists (
      select 1 from public.wish_items i
      where i.id = private.storage_path_part(objects.name, 2)
        and i.household_id = private.storage_path_part(objects.name, 1)
    )
  );
