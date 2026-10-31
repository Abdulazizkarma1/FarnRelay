-- Run once in the Supabase SQL editor after the intended admin signs up and
-- verifies their email. Replace the placeholder. Never expose this as an RPC.
do $$
declare admin_email text := 'REPLACE_WITH_VERIFIED_ADMIN_EMAIL'; admin_id uuid;
begin
 if exists(select 1 from public.profiles where role='admin') then
  raise exception 'An administrator already exists. Use an audited operator procedure for additional administrators.';
 end if;
 select id into admin_id from auth.users where lower(email)=lower(admin_email) and email_confirmed_at is not null;
 if admin_id is null then raise exception 'Verified account not found.';end if;
 update public.profiles set role='admin',revoked_before=clock_timestamp(),access_version=access_version+1 where id=admin_id;
 if not found then raise exception 'Profile missing. Apply the migration before registering.';end if;
 insert into public.audit_log(actor,actor_name,action,target) values(admin_id,'Project operator','account.admin_bootstrapped',admin_id::text);
end $$;
