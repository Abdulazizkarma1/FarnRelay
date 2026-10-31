-- Server-controlled quotas supplement Supabase Auth's own provider rate limits.
create function app_private.auth_limit(p_key text,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_key !~ '^[0-9a-f]{64}$' or p_action not in ('signup','login','resend','recover') then raise exception 'Invalid auth limiter request.';end if;
 perform app_private.rate_limit('auth-minute-'||p_action,p_key,case when p_action='login' then 12 else 5 end,60);
 perform app_private.rate_limit('auth-hour',p_key,120,3600);
end $$;
create function public.farmrelay_auth_limit(p_key text,p_action text) returns void language sql security invoker set search_path='' as $$select app_private.auth_limit(p_key,p_action);$$;
revoke all on function app_private.auth_limit(text,text),public.farmrelay_auth_limit(text,text) from public,anon,authenticated,service_role;
grant execute on function app_private.auth_limit(text,text),public.farmrelay_auth_limit(text,text) to service_role;
-- A request is descriptive, never an authoritative role. Public signup still creates farmers.
create or replace function app_private.user_json(p public.profiles) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'community',p.community,'role',p.role,'active',p.active,
 'requestedRole',coalesce((select case when raw_user_meta_data->>'requested_role'='officer' then 'officer' else 'farmer' end from auth.users where id=p.id),'farmer'),
 'createdAt',p.created_at,'verified',exists(select 1 from auth.users where id=p.id and email_confirmed_at is not null),
 'mfaEnabled',exists(select 1 from auth.mfa_factors where user_id=p.id and status='verified'));
$$;
