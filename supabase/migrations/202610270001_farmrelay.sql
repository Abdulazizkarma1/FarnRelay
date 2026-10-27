-- FarmRelay: authoritative roles, transactional workflows and private storage.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(name) between 2 and 100),
 email text not null,
 community text not null default '' check(length(community)<=100),
 role text not null default 'farmer' check(role in ('farmer','officer','admin')),
 active boolean not null default true,
 access_version integer not null default 0,
 revoked_before timestamptz,
 created_at timestamptz not null default now()
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), owner uuid not null references public.profiles(id),
 assigned_to uuid references public.profiles(id), client_id uuid not null,
 crop text not null check(crop in ('Maize','Cassava','Tomato','Cashew','Rice','Other')),
 community text not null check(length(community) between 2 and 100),
 symptom text not null check(length(symptom) between 1 and 100), onset date not null,
 description text not null default '' check(length(description)<=2000),
 affected text not null default '' check(length(affected)<=100),
 audio_language text check(audio_language in ('English','Twi','Dagbani','Hausa','Other')),
 photo jsonb, audio jsonb, ai jsonb not null default '{}'::jsonb,
 status text not null default 'Needs review' check(status in ('Needs review','In review','Follow-up needed','Closed')),
 priority text not null default 'normal' check(priority in ('normal','high')),
 version integer not null default 0, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(owner,client_id)
);
create index reports_owner_date on public.reports(owner,created_at desc);
create index reports_assigned_date on public.reports(assigned_to,created_at desc);
create table public.messages (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
 author uuid not null references public.profiles(id), author_name text not null, role text not null,
 text text not null check(length(text) between 1 and 2000), client_id uuid not null,
 created_at timestamptz not null default now(), unique(report_id,client_id)
);
create index messages_report_date on public.messages(report_id,created_at desc);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 report_id uuid references public.reports(id) on delete cascade, text text not null,
 read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_date on public.notifications(user_id,created_at desc);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), actor uuid references public.profiles(id),
 actor_name text, action text not null, target text, details jsonb default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table app_private.rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);
alter table app_private.rate_limits enable row level security;
create index rate_limits_expiry on app_private.rate_limits(expires_at);
create index reports_photo_path on public.reports((photo->>'path')) where photo is not null;
create index reports_audio_path on public.reports((audio->>'path')) where audio is not null;
create index messages_author on public.messages(author);
create index notifications_report on public.notifications(report_id);
create index audit_actor on public.audit_log(actor);
create index audit_date on public.audit_log(created_at desc);

create function app_private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,email,community)
 values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),100),''),'Farmer'),new.email,
 left(coalesce(new.raw_user_meta_data->>'community',''),100));
 return new;
end $$;
create trigger farmrelay_new_user after insert on auth.users for each row execute function app_private.new_user();

-- Check the authoritative session row as well as JWT identity. A refreshed token
-- from a revoked session cannot regain access by changing client metadata.
create function app_private.session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.sessions s on s.user_id=p.id
 where p.id=auth.uid() and p.active and s.id::text=auth.jwt()->>'session_id'
 and (p.revoked_before is null or s.created_at>p.revoked_before));
$$;
create function app_private.data_access() returns boolean language sql stable security definer set search_path='' as $$
 select app_private.session_valid() and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and ((p.role<>'admin' and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified'))
 or auth.jwt()->>'aal'='aal2'));
$$;
create function app_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select app_private.data_access() and exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function app_private.can_read_report(report_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.data_access() and exists(select 1 from public.reports r join public.profiles p on p.id=auth.uid()
 where r.id=report_id and (p.role='admin' or (p.role='farmer' and r.owner=p.id) or (p.role='officer' and r.assigned_to=p.id)));
$$;
create function app_private.assert_data() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not app_private.session_valid() then raise exception 'AUTH_REQUIRED: Sign in again.' using errcode='42501';end if;
 if not app_private.data_access() then raise exception 'MFA_OR_VERIFICATION: Verify your email and complete authenticator protection.' using errcode='42501';end if;
end $$;
create function app_private.rate_limit(scope text, subject text, maximum integer, seconds integer) returns void language plpgsql security definer set search_path='' as $$
declare bucket text; value integer;
begin
 bucket:=scope||':'||subject||':'||floor(extract(epoch from now())/seconds)::text;
 insert into app_private.rate_limits(key,count,expires_at) values(bucket,1,now()+make_interval(secs=>seconds*2))
 on conflict(key) do update set count=app_private.rate_limits.count+1 returning count into value;
 if value>maximum then raise exception 'RATE_LIMIT: Too many requests. Retry later.' using errcode='P0001';end if;
 delete from app_private.rate_limits where expires_at<now();
end $$;
create function app_private.log(action text,target text,details jsonb default '{}'::jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.audit_log(actor,actor_name,action,target,details)
 select id,name,action,target,details from public.profiles where id=auth.uid();
$$;
create function app_private.user_json(p public.profiles) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'community',p.community,'role',p.role,'active',p.active,
 'createdAt',p.created_at,'verified',exists(select 1 from auth.users where id=p.id and email_confirmed_at is not null),
 'mfaEnabled',exists(select 1 from auth.mfa_factors where user_id=p.id and status='verified'));
$$;
create function app_private.report_json(r public.reports) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('_id',r.id,'clientId',r.client_id,'crop',r.crop,'community',r.community,'symptom',r.symptom,
 'onset',r.onset,'description',r.description,'affected',r.affected,'audioLanguage',r.audio_language,
 'photo',r.photo,'audio',r.audio,'ai',r.ai,'status',r.status,'priority',r.priority,'version',r.version,'createdAt',r.created_at,
 'owner',(select jsonb_build_object('_id',id,'name',name) from public.profiles where id=r.owner),
 'assignedTo',(select jsonb_build_object('_id',id,'name',name) from public.profiles where id=r.assigned_to));
$$;
create function app_private.media_ok(media jsonb, user_id uuid, client_id uuid, kind text) returns boolean language sql stable security definer set search_path='' as $$
 select media is null or (jsonb_typeof(media)='object' and exists(select 1 from storage.objects o
 where o.bucket_id='crop-evidence' and o.name=media->>'path'
 and split_part(o.name,'/',1)=user_id::text and split_part(o.name,'/',2)=client_id::text
 and split_part(o.name,'/',4)=kind and array_length(string_to_array(o.name,'/'),1)=4
 and (o.metadata->>'size')::bigint between 1 and case when kind='photo' then 1500000 else 1100000 end
 and (media->>'bytes')::bigint=(o.metadata->>'size')::bigint
 and media->>'mime'=o.metadata->>'mimetype'
 and ((kind='photo' and media->>'mime' in ('image/jpeg','image/png','image/webp'))
 or (kind='audio' and media->>'mime' in ('audio/webm','audio/ogg','audio/mp4','audio/wav')))));
$$;

-- All exposed tables deny direct mutation. Validated RPCs perform atomic writes.
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles,public.reports,public.messages,public.notifications,public.audit_log from anon,authenticated;
grant select on public.profiles,public.reports,public.messages,public.notifications,public.audit_log to authenticated;
create policy profiles_read on public.profiles for select to authenticated using ((id=(select auth.uid()) and (select app_private.session_valid())) or (select app_private.is_admin()));
create policy reports_read on public.reports for select to authenticated using (app_private.can_read_report(id));
create policy messages_read on public.messages for select to authenticated using (app_private.can_read_report(report_id));
create policy notifications_read on public.notifications for select to authenticated using (user_id=(select auth.uid()) and (select app_private.data_access()));
create policy audit_read on public.audit_log for select to authenticated using ((select app_private.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('crop-evidence','crop-evidence',false,1500000,array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/wav']);
create function app_private.media_referenced(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.reports where photo->>'path'=object_path or audio->>'path'=object_path);
$$;
create policy evidence_insert on storage.objects for insert to authenticated with check (
 bucket_id='crop-evidence' and app_private.data_access() and (storage.foldername(name))[1]=auth.uid()::text
 and array_length(string_to_array(name,'/'),1)=4 and exists(select 1 from public.profiles where id=auth.uid() and role='farmer')
);
create policy evidence_read on storage.objects for select to authenticated using (
 bucket_id='crop-evidence' and app_private.data_access() and (
 ((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and role='farmer')) or exists(select 1 from public.reports r
 where (r.photo->>'path'=name or r.audio->>'path'=name) and app_private.can_read_report(r.id)))
);
create policy evidence_delete_unsubmitted on storage.objects for delete to authenticated using (
 bucket_id='crop-evidence' and app_private.data_access() and (storage.foldername(name))[1]=auth.uid()::text
 and not app_private.media_referenced(name)
);

create function app_private.api(p_path text,p_method text default 'GET',p_body jsonb default '{}'::jsonb,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; r public.reports; target public.profiles; msg public.messages;
 parts text[]; rid uuid; total integer; page integer; lim integer; offset_n integer; items jsonb; q text; filter_status text; role_filter text; counts jsonb;
begin
 if not app_private.session_valid() then raise exception 'AUTH_REQUIRED: Sign in again.' using errcode='42501'; end if;
 select * into strict me from public.profiles where id=auth.uid();
 perform app_private.rate_limit('api',me.id::text,180,60);
 if p_path='/auth/me' and p_method='GET' then return jsonb_build_object('user',app_private.user_json(me));end if;
 if p_path='/auth/profile' and p_method='PATCH' then
  if p_body - array['name','community'] <> '{}'::jsonb then raise exception 'Unsupported profile fields.';end if;
  update public.profiles set name=trim(p_body->>'name'),community=trim(coalesce(p_body->>'community','')) where id=me.id returning * into me;
  perform app_private.log('account.profile_updated',me.id::text);
  return jsonb_build_object('user',app_private.user_json(me));
 end if;
 if p_path='/auth/logout-all' and p_method='POST' then
  update public.profiles set revoked_before=clock_timestamp(),access_version=access_version+1 where id=me.id;
  perform app_private.log('account.sessions_revoked',me.id::text);return jsonb_build_object('ok',true);
 end if;
 perform app_private.assert_data();
 page:=greatest(1,least(10000,coalesce((p_query->>'page')::integer,1)));
 lim:=greatest(1,least(50,coalesce((p_query->>'limit')::integer,15)));offset_n:=(page-1)*lim;
 q:=left(coalesce(p_query->>'q',''),100);filter_status:=nullif(p_query->>'status','');role_filter:=nullif(p_query->>'role','');
 if p_path='/reports/summary' and p_method='GET' then
  select jsonb_object_agg(status,n) into counts from (select status,count(*) n from public.reports where (me.role='admin' or (me.role='farmer' and owner=me.id) or (me.role='officer' and assigned_to=me.id)) group by status) x;
  select count(*) into total from public.reports where (me.role='admin' or (me.role='farmer' and owner=me.id) or (me.role='officer' and assigned_to=me.id));
  select coalesce(jsonb_agg(app_private.report_json(x)),'[]') into items from (select * from public.reports where (me.role='admin' or (me.role='farmer' and owner=me.id) or (me.role='officer' and assigned_to=me.id)) order by created_at desc limit 5)x;
  return jsonb_build_object('counts',coalesce(counts,'{}'),'total',total,'recent',items);
 end if;
 if p_path='/reports' and p_method='GET' then
  select count(*) into total from public.reports where (me.role='admin' or (me.role='farmer' and owner=me.id) or (me.role='officer' and assigned_to=me.id)) and (filter_status is null or status=filter_status) and (q='' or position(lower(q) in lower(crop||' '||community))>0);
  select coalesce(jsonb_agg(app_private.report_json(x)-'ai'),'[]') into items from (select * from public.reports where (me.role='admin' or (me.role='farmer' and owner=me.id) or (me.role='officer' and assigned_to=me.id)) and (filter_status is null or status=filter_status) and (q='' or position(lower(q) in lower(crop||' '||community))>0) order by created_at desc,id limit lim offset offset_n)x;
  return jsonb_build_object('items',items,'total',total,'page',page,'pages',greatest(1,ceil(total::numeric/lim)));
 end if;
 if p_path='/reports' and p_method='POST' then
  if me.role<>'farmer' then raise exception 'Only farmers can submit reports.' using errcode='42501';end if;
  if p_body - array['clientId','crop','community','symptom','onset','description','affected','audioLanguage','photo','audio'] <> '{}' then raise exception 'Unsupported report fields.';end if;
  select * into r from public.reports where owner=me.id and client_id=(p_body->>'clientId')::uuid;
  if found then return jsonb_build_object('report',app_private.report_json(r));end if;
  perform app_private.rate_limit('report-create',me.id::text,10,3600);
  if (p_body->>'onset')::date>current_date then raise exception 'Observation date cannot be in the future.';end if;
  if not app_private.media_ok(nullif(p_body->'photo','null'),me.id,(p_body->>'clientId')::uuid,'photo') or not app_private.media_ok(nullif(p_body->'audio','null'),me.id,(p_body->>'clientId')::uuid,'audio') then raise exception 'Attachment ownership or metadata is invalid.';end if;
  if length(trim(coalesce(p_body->>'description','')))=0 and nullif(p_body->'audio','null') is null then raise exception 'Add a description or recording.';end if;
  if nullif(p_body->'audio','null') is not null and p_body->>'audioLanguage' is null then raise exception 'Choose a recording language.';end if;
  insert into public.reports(owner,client_id,crop,community,symptom,onset,description,affected,audio_language,photo,audio)
  values(me.id,(p_body->>'clientId')::uuid,p_body->>'crop',trim(p_body->>'community'),p_body->>'symptom',(p_body->>'onset')::date,trim(coalesce(p_body->>'description','')),coalesce(p_body->>'affected',''),p_body->>'audioLanguage',nullif(p_body->'photo','null'),nullif(p_body->'audio','null'))
  on conflict(owner,client_id) do nothing returning * into r;
  if not found then select * into r from public.reports where owner=me.id and client_id=(p_body->>'clientId')::uuid;
  else perform app_private.log('report.submitted',r.id::text);end if;
  return jsonb_build_object('report',app_private.report_json(r));
 end if;
 parts:=string_to_array(trim(both '/' from p_path),'/');
 if parts[1]='reports' and array_length(parts,1)>=2 then
  rid:=parts[2]::uuid;
  if not app_private.can_read_report(rid) then raise exception 'NOT_FOUND: Report not found.' using errcode='P0002';end if;
  select * into strict r from public.reports where id=rid for update;
  if not app_private.can_read_report(rid) then raise exception 'NOT_FOUND: Report access changed.' using errcode='P0002';end if;
  if array_length(parts,1)=2 and p_method='GET' then return jsonb_build_object('report',app_private.report_json(r));end if;
  if parts[3]='messages' and p_method='GET' then
   select count(*) into total from public.messages where report_id=rid;
   select coalesce(jsonb_agg(jsonb_build_object('_id',id,'author',author,'authorName',author_name,'role',role,'text',text,'createdAt',created_at) order by created_at,id),'[]') into items from (select * from public.messages where report_id=rid order by created_at desc,id desc limit lim offset offset_n)x;
   return jsonb_build_object('items',items,'total',total,'page',page,'pages',greatest(1,ceil(total::numeric/lim)));
  end if;
  if parts[3]='messages' and p_method='POST' then
   if p_body - array['clientId','text'] <> '{}' then raise exception 'Unsupported message fields.';end if;
   select * into msg from public.messages where report_id=rid and client_id=(p_body->>'clientId')::uuid;
   if found then
    if msg.author<>me.id then raise exception 'Message identifier already used.';end if;
   else
    perform app_private.rate_limit('message',me.id::text,30,60);
    insert into public.messages(report_id,author,author_name,role,text,client_id) values(rid,me.id,me.name,me.role,trim(p_body->>'text'),(p_body->>'clientId')::uuid) returning * into msg;
    insert into public.notifications(user_id,report_id,text) select case when me.role='farmer' then r.assigned_to else r.owner end,rid,case when me.role='farmer' then 'A farmer added an update.' else 'Your extension team sent feedback.' end where (me.role<>'farmer' or r.assigned_to is not null);
    perform app_private.log('report.message_sent',rid::text);
   end if;
   return jsonb_build_object('message',jsonb_build_object('_id',msg.id,'text',msg.text));
  end if;
  if p_method='PATCH' and (array_length(parts,1)=2 or parts[3]='assignment') then
   if me.role not in ('officer','admin') then raise exception 'Staff access required.' using errcode='42501';end if;
   if (p_body->>'version')::integer is distinct from r.version then raise exception 'CONFLICT: This report changed. Refresh before saving.' using errcode='40001';end if;
   if parts[3]='assignment' then
    if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
    if p_body - array['version','officerId'] <> '{}' then raise exception 'Unsupported assignment fields.';end if;
    if p_body->>'officerId' is not null and not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=(p_body->>'officerId')::uuid and p.role='officer' and p.active and u.email_confirmed_at is not null) then raise exception 'Choose an active verified officer.';end if;
    update public.reports set assigned_to=(p_body->>'officerId')::uuid,version=version+1,updated_at=now() where id=rid returning * into r;
    if r.assigned_to is not null then insert into public.notifications(user_id,report_id,text) values(r.assigned_to,rid,'A crop report has been assigned to you.');end if;
    perform app_private.log('report.assigned',rid::text,jsonb_build_object('officerId',r.assigned_to));
   else
    if p_body - array['version','status','priority'] <> '{}' then raise exception 'Unsupported review fields.';end if;
    update public.reports set status=p_body->>'status',priority=p_body->>'priority',version=version+1,updated_at=now() where id=rid returning * into r;
    insert into public.notifications(user_id,report_id,text) values(r.owner,rid,'Your report status is now '||lower(r.status)||'.');
    perform app_private.log('report.review_updated',rid::text,jsonb_build_object('status',r.status,'priority',r.priority));
   end if;
   return jsonb_build_object('report',app_private.report_json(r));
  end if;
 end if;
 if p_path='/notifications' and p_method='GET' then
  select count(*) into total from public.notifications where user_id=me.id and read_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('_id',id,'report',report_id,'text',text,'readAt',read_at,'createdAt',created_at)),'[]') into items from (select * from public.notifications where user_id=me.id order by created_at desc limit 30)x;
  return jsonb_build_object('items',items,'unread',total);
 end if;
 if parts[1]='notifications' and parts[3]='read' and p_method='POST' then
  update public.notifications set read_at=now() where id=parts[2]::uuid and user_id=me.id;
  if not found then raise exception 'NOT_FOUND: Notification not found.';end if;
  return jsonb_build_object('ok',true);
 end if;
 if parts[1]='admin' then
  if not app_private.is_admin() then raise exception 'Administrator access required.' using errcode='42501';end if;
  if p_path='/admin/overview' and p_method='GET' then return jsonb_build_object('users',(select count(*) from public.profiles),'officers',(select count(*) from public.profiles where role='officer' and active),'unassigned',(select count(*) from public.reports where assigned_to is null and status<>'Closed'));end if;
  if p_path='/admin/users' and p_method='GET' then
   select count(*) into total from public.profiles where (role_filter is null or role=role_filter) and (q='' or position(lower(q) in lower(name||' '||email))>0);
   select coalesce(jsonb_agg(app_private.user_json(x)),'[]') into items from (select * from public.profiles where (role_filter is null or role=role_filter) and (q='' or position(lower(q) in lower(name||' '||email))>0) order by created_at desc,id limit lim offset offset_n)x;
   return jsonb_build_object('items',items,'total',total,'page',page,'pages',greatest(1,ceil(total::numeric/lim)));
  end if;
  if parts[2]='users' and parts[3] is not null and p_method in ('PATCH','POST') then
   select * into target from public.profiles where id=parts[3]::uuid for update;
   if not found then raise exception 'NOT_FOUND: Account not found.';end if;
   if target.role='admin' then raise exception 'Administrator accounts cannot be changed here.' using errcode='42501';end if;
   if p_method='PATCH' and array_length(parts,1)=3 then
    if p_body - array['role','active'] <> '{}' or p_body->>'role' not in ('farmer','officer') or jsonb_typeof(p_body->'active')<>'boolean' then raise exception 'Invalid account permissions.';end if;
    if p_body->>'role'='officer' and not exists(select 1 from auth.users where id=target.id and email_confirmed_at is not null) then raise exception 'Verify email before promoting an officer.';end if;
    update public.profiles set role=p_body->>'role',active=(p_body->>'active')::boolean,revoked_before=clock_timestamp(),access_version=access_version+1 where id=target.id returning * into target;
    perform app_private.log('account.access_changed',target.id::text,p_body);
   elsif p_method='POST' and parts[4]='revoke' then
    update public.profiles set revoked_before=clock_timestamp(),access_version=access_version+1 where id=target.id returning * into target;
    perform app_private.log('account.sessions_revoked',target.id::text);
   else raise exception 'Unknown action.';end if;
   return jsonb_build_object('user',app_private.user_json(target),'message','Access updated. Existing app sessions revoked.');
  end if;
  if p_path='/admin/audit' and p_method='GET' then
   select count(*) into total from public.audit_log;
   select coalesce(jsonb_agg(jsonb_build_object('_id',id,'actorName',actor_name,'action',action,'target',target,'details',details,'createdAt',created_at)),'[]') into items from (select * from public.audit_log order by created_at desc,id limit lim offset offset_n)x;
   return jsonb_build_object('items',items,'total',total,'page',page,'pages',greatest(1,ceil(total::numeric/lim)));
  end if;
 end if;
 raise exception 'NOT_FOUND: Endpoint not found.' using errcode='P0002';
end $$;

create function app_private.ai_context(p_report_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;r public.reports;
begin
 perform app_private.assert_data();select * into p from public.profiles where id=auth.uid();
 if p.role not in ('officer','admin') or not app_private.can_read_report(p_report_id) then raise exception 'Report not available for AI review.' using errcode='42501';end if;
 perform app_private.rate_limit('ai-user',p.id::text,10,3600);perform app_private.rate_limit('ai-site','all',100,3600);
 select * into strict r from public.reports where id=p_report_id;
 return jsonb_build_object('report',app_private.report_json(r),'actor',p.id,'accessVersion',p.access_version,'sessionId',auth.jwt()->>'session_id');
end $$;
create function app_private.save_ai(p_report_id uuid,p_actor uuid,p_session uuid,p_access_version integer,p_kind text,p_result jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;r public.reports;field text;
begin
 select * into p from public.profiles where id=p_actor;
 select * into r from public.reports where id=p_report_id for update;
 if p.id is null or r.id is null or not p.active or p.access_version<>p_access_version or p.role not in ('admin','officer') or (p.role='officer' and r.assigned_to is distinct from p.id)
 or not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p.id and (p.revoked_before is null or s.created_at>p.revoked_before)) then raise exception 'Access changed during analysis.' using errcode='42501';end if;
 field:=case p_kind when 'brief' then 'brief' when 'segment' then 'segmentation' when 'transcribe' then 'transcript' end;
 if field is null or jsonb_typeof(p_result)<>'object' or length(p_result::text)>100000 then raise exception 'Invalid AI result.';end if;
 update public.reports set ai=jsonb_set(ai,array[field],p_result),updated_at=now() where id=p_report_id;
 insert into public.audit_log(actor,actor_name,action,target,details) values(p.id,p.name,'ai.'||p_kind,p_report_id::text,jsonb_build_object('model',p_result->>'model','elapsedMs',p_result->'elapsedMs'));
end $$;

-- Public functions are invoker wrappers. Privileged logic stays in an unexposed schema.
create function public.farmrelay_api(p_path text,p_method text default 'GET',p_body jsonb default '{}'::jsonb,p_query jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select app_private.api(p_path,p_method,p_body,p_query); $$;
create function public.farmrelay_ai_context(p_report_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select app_private.ai_context(p_report_id); $$;
create function public.farmrelay_save_ai(p_report_id uuid,p_actor uuid,p_session uuid,p_access_version integer,p_kind text,p_result jsonb) returns void language sql security invoker set search_path='' as $$ select app_private.save_ai(p_report_id,p_actor,p_session,p_access_version,p_kind,p_result); $$;

-- Explicit function grants prevent anonymous execution and service-role spoofing.
revoke all on all functions in schema app_private from public,anon,authenticated,service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.api(text,text,jsonb,jsonb),app_private.ai_context(uuid) to authenticated;
grant execute on function app_private.save_ai(uuid,uuid,uuid,integer,text,jsonb) to service_role;
grant execute on function app_private.session_valid(),app_private.data_access(),app_private.is_admin(),app_private.can_read_report(uuid),app_private.media_referenced(text) to authenticated;
revoke all on function public.farmrelay_api(text,text,jsonb,jsonb),public.farmrelay_ai_context(uuid),public.farmrelay_save_ai(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.farmrelay_api(text,text,jsonb,jsonb),public.farmrelay_ai_context(uuid) to authenticated;
grant execute on function public.farmrelay_save_ai(uuid,uuid,uuid,integer,text,jsonb) to service_role;
-- Realtime sends only rows authorized by the subscriber's RLS policies.
alter publication supabase_realtime add table public.notifications,public.messages,public.reports;
