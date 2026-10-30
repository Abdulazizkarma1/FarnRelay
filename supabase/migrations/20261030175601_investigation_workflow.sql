-- Additive investigation workflow. Existing reports and attachments remain valid.
alter table public.reports add column answers jsonb not null default '{}'::jsonb,
 add column evidence_version integer not null default 0,
 add column followup_due date,
 add column outcome text check(outcome in ('Improved','Unchanged','Worsened','Cannot determine'));
create index reports_followup_due on public.reports(followup_due) where status<>'Closed';
create table public.case_evidence (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
 client_id uuid not null, actor uuid not null references public.profiles(id),
 kind text not null check(kind in ('photo','audio')), label text not null check(length(label) between 1 and 80),
 media jsonb not null, language text, created_at timestamptz not null default now(),
 unique(report_id,client_id), unique(media)
);
create index case_evidence_report on public.case_evidence(report_id,created_at);
create index case_evidence_actor on public.case_evidence(actor);
create unique index case_evidence_path on public.case_evidence((media->>'path'));
create table public.case_events (
 id uuid primary key default gen_random_uuid(),report_id uuid not null references public.reports(id) on delete cascade,
 client_id uuid not null, actor uuid not null references public.profiles(id), actor_name text not null,
 kind text not null check(kind in ('submitted','evidence','answers','question','advice','review','followup','transcript','region')),
 body jsonb not null default '{}', created_at timestamptz not null default now(),unique(report_id,client_id)
);
create index case_events_report on public.case_events(report_id,created_at);
create index case_events_actor on public.case_events(actor);
create table public.ai_runs (
 id uuid primary key default gen_random_uuid(),report_id uuid not null references public.reports(id) on delete cascade,
 actor uuid not null references public.profiles(id),session_id uuid not null,access_version integer not null,
 evidence_version integer not null,kind text not null check(kind in ('investigate','guide','segment','transcribe')),
 state text not null default 'processing' check(state in ('processing','complete','failed','superseded')),
 result jsonb,error text,created_at timestamptz not null default now(),completed_at timestamptz
);
create index ai_runs_report on public.ai_runs(report_id,created_at desc);
create index ai_runs_actor on public.ai_runs(actor);
-- Existing media gets stable evidence IDs without changing object paths.
insert into public.case_evidence(report_id,client_id,actor,kind,label,media,language)
 select id,gen_random_uuid(),owner,'photo','Initial close view',photo,null from public.reports where photo is not null;
insert into public.case_evidence(report_id,client_id,actor,kind,label,media,language)
 select id,gen_random_uuid(),owner,'audio','Initial voice note',audio,audio_language from public.reports where audio is not null;
-- No direct client mutations. The RPC checks ownership, metadata and state together.
alter table public.case_evidence enable row level security;
alter table public.case_events enable row level security;
alter table public.ai_runs enable row level security;
revoke all on public.case_evidence,public.case_events,public.ai_runs from public,anon,authenticated;
grant select on public.case_evidence,public.case_events,public.ai_runs to authenticated;
create policy evidence_case_read on public.case_evidence for select to authenticated using(app_private.can_read_report(report_id));
create policy events_case_read on public.case_events for select to authenticated using(app_private.can_read_report(report_id));
create policy runs_case_read on public.ai_runs for select to authenticated using(app_private.can_read_report(report_id));
create or replace function app_private.media_referenced(object_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.reports where photo->>'path'=object_path or audio->>'path'=object_path)
 or exists(select 1 from public.case_evidence where media->>'path'=object_path);
$$;
drop policy evidence_read on storage.objects;
create policy evidence_read on storage.objects for select to authenticated using (
 bucket_id='crop-evidence' and app_private.data_access() and (
 ((storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles where id=auth.uid() and role='farmer'))
 or exists(select 1 from public.case_evidence e where e.media->>'path'=name and app_private.can_read_report(e.report_id))
 or exists(select 1 from public.reports r where (r.photo->>'path'=name or r.audio->>'path'=name) and app_private.can_read_report(r.id)))
);
-- Enrich the existing DTO without changing the original API routes.
alter function app_private.report_json(public.reports) rename to report_json_v2;
create function app_private.report_json(r public.reports) returns jsonb language sql stable security definer set search_path='' as $$
 select app_private.report_json_v2(r)||jsonb_build_object('answers',r.answers,'evidenceVersion',r.evidence_version,'followupDue',r.followup_due,'outcome',r.outcome,
 'evidenceCount',(select count(*) from public.case_evidence where report_id=r.id));
$$;
create function app_private.case_snapshot(rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('report',app_private.report_json(r),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.case_evidence e where e.report_id=r.id),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from (select * from public.case_events where report_id=r.id order by created_at desc limit 100)e),'[]'),
 'runs',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,kind,state,result,error,evidence_version,created_at,completed_at from public.ai_runs where report_id=r.id order by created_at desc limit 20)a),'[]'))
 from public.reports r where r.id=rid;
$$;
create function app_private.investigation(p_report_id uuid,p_action text,p_body jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles;r public.reports;ev jsonb;existing public.case_events;cid uuid; payload jsonb;recipient uuid;
begin
 perform app_private.assert_data();
 select * into strict me from public.profiles where id=auth.uid();
 if not app_private.can_read_report(p_report_id) then raise exception 'NOT_FOUND: Case unavailable.' using errcode='42501';end if;
 select * into strict r from public.reports where id=p_report_id for update;
 if not app_private.can_read_report(p_report_id) then raise exception 'NOT_FOUND: Case access changed.' using errcode='42501';end if;
 if p_action='get' then return app_private.case_snapshot(r.id);end if;
 perform app_private.rate_limit('case-write',me.id::text,60,60);
 cid:=(p_body->>'clientId')::uuid;
 if cid is null then raise exception 'A request identifier is required.';end if;
 select * into existing from public.case_events where report_id=r.id and client_id=cid;
 if found then
  if existing.actor<>me.id then raise exception 'Request identifier already used.';end if;
  return app_private.case_snapshot(r.id);
 end if;
 if length(p_body::text)>30000 then raise exception 'Case update is too large.';end if;
 payload:=p_body-'clientId'-'version';
 if p_action='evidence' then
  if me.role<>'farmer' or r.owner<>me.id then raise exception 'Only the reporting farmer can attach evidence.' using errcode='42501';end if;
  if p_body-array['clientId','items','note']<>'{}' or jsonb_typeof(p_body->'items') is distinct from 'array' or jsonb_array_length(p_body->'items') not between 1 and 4 then raise exception 'Add one to four attachments.';end if;
  if (select count(*) from public.case_evidence where report_id=r.id)+jsonb_array_length(p_body->'items')>20 then raise exception 'This case has reached its attachment limit.';end if;
  for ev in select value from jsonb_array_elements(p_body->'items') loop
   if ev->>'kind' not in ('photo','audio') or ev->>'kind' is null or ev->'media' is null or ev->'media'='null' or not coalesce(app_private.media_ok(ev->'media',me.id,r.client_id,ev->>'kind'),false) then raise exception 'Attachment ownership or metadata is invalid.';end if;
   if ev->>'kind'='audio' and coalesce(ev->>'language','') not in ('English','Twi','Dagbani','Hausa','Other') then raise exception 'Choose a recording language.';end if;
   insert into public.case_evidence(report_id,client_id,actor,kind,label,media,language)
   values(r.id,(ev->>'clientId')::uuid,me.id,ev->>'kind',ev->>'label',ev->'media',ev->>'language');
  end loop;
  payload:=jsonb_build_object('text',left(coalesce(p_body->>'note','Additional field evidence'),2000),'count',jsonb_array_length(p_body->'items'));
  update public.reports set evidence_version=evidence_version+1,version=version+1,updated_at=now(),status='Needs review',followup_due=null where id=r.id;
 elsif p_action='answers' then
  if me.role<>'farmer' or r.owner<>me.id then raise exception 'Only the reporting farmer can update answers.' using errcode='42501';end if;
  if p_body-array['clientId','answers']<>'{}' or jsonb_typeof(p_body->'answers') is distinct from 'object' or (p_body->'answers')-array['growthStage','extent','onsetKnown','insects','wholePlant','additionalContext']<>'{}' or length((p_body->'answers')::text)>4000 then raise exception 'Unsupported answers.';end if;
  if exists(select 1 from jsonb_each(p_body->'answers') where jsonb_typeof(value)<>'string' or length(value::text)>1200) then raise exception 'Answers must be short text.';end if;
  update public.reports set answers=answers||(p_body->'answers'),evidence_version=evidence_version+1,version=version+1,updated_at=now(),status='Needs review',followup_due=null where id=r.id;
 elsif p_action in ('question','advice','review','transcript','region') then
  if me.role not in ('officer','admin') then raise exception 'Staff review required.' using errcode='42501';end if;
  if (p_body->>'version')::integer is distinct from r.version then raise exception 'CONFLICT: Refresh before saving your review.' using errcode='40001';end if;
  if p_body-array['clientId','version','text','due','outcome']<>'{}' or length(trim(coalesce(p_body->>'text',''))) not between 1 and 4000 then raise exception 'Write a review or question.';end if;
  if p_body->>'due' is not null and ((p_body->>'due')::date<current_date or (p_body->>'due')::date>current_date+366) then raise exception 'Choose a future follow-up date within one year.';end if;
  update public.reports set version=version+1,updated_at=now(),
   status=case when p_action='question' then 'Follow-up needed' when p_action='advice' then 'In review' else status end,
   followup_due=case when p_action in ('advice','review') then nullif(p_body->>'due','')::date else followup_due end,
   outcome=case when p_action='review' then p_body->>'outcome' else outcome end,
   evidence_version=evidence_version+case when p_action='transcript' then 1 else 0 end
  where id=r.id;
 elsif p_action='followup' then
  if me.role<>'farmer' or r.owner<>me.id then raise exception 'Only the reporting farmer can add a field update.' using errcode='42501';end if;
  if p_body-array['clientId','text','outcome']<>'{}' or length(trim(coalesce(p_body->>'text',''))) not between 1 and 2000 or coalesce(p_body->>'outcome','') not in ('Improved','Unchanged','Worsened','Cannot determine') then raise exception 'Describe the change and choose an outcome.';end if;
  update public.reports set evidence_version=evidence_version+1,version=version+1,updated_at=now(),status='Needs review',followup_due=null where id=r.id;
 else raise exception 'Unsupported investigation action.';
 end if;
 insert into public.case_events(report_id,client_id,actor,actor_name,kind,body) values(r.id,cid,me.id,me.name,p_action,payload);
 recipient:=case when me.role='farmer' then r.assigned_to else r.owner end;
 if recipient is not null then insert into public.notifications(user_id,report_id,text) values(recipient,r.id,case when p_action='advice' then 'Reviewed advice is ready.' when p_action='question' then 'Your officer requested more information.' else 'Your crop case has an update.' end);end if;
 perform app_private.log('case.'||p_action,r.id::text);
 return app_private.case_snapshot(r.id);
end $$;
create function public.farmrelay_investigation(p_report_id uuid,p_action text,p_body jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select app_private.investigation(p_report_id,p_action,p_body);$$;
-- A report lock deduplicates paid analysis for the same evidence version.
create function app_private.start_analysis(p_report_id uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles;r public.reports;a public.ai_runs;
begin
 perform app_private.assert_data();select * into strict me from public.profiles where id=auth.uid();
 if not app_private.can_read_report(p_report_id) then raise exception 'Case unavailable.' using errcode='42501';end if;
 select * into strict r from public.reports where id=p_report_id for update;
 if not app_private.can_read_report(r.id) or (me.role='farmer' and p_kind<>'guide') then raise exception 'This AI action requires staff access.' using errcode='42501';end if;
 if r.crop<>'Maize' then raise exception 'AI investigation currently supports maize only.';end if;
 if p_kind not in ('investigate','guide','segment','transcribe') then raise exception 'Unsupported AI action.';end if;
 select * into a from public.ai_runs where report_id=r.id and kind=p_kind and evidence_version=r.evidence_version and state='complete' order by created_at desc limit 1;
 if found then return jsonb_build_object('cached',true,'run',to_jsonb(a)-'session_id'-'access_version');end if;
 if exists(select 1 from public.ai_runs where report_id=r.id and kind=p_kind and state='processing' and created_at>now()-interval '2 minutes') then raise exception 'PROCESSING: Analysis is already running. Refresh shortly.';end if;
 update public.ai_runs set state='failed',error='Processing interrupted. Retry available.',completed_at=now() where report_id=r.id and state='processing' and created_at<=now()-interval '2 minutes';
 perform app_private.rate_limit('ai-user',me.id::text,10,3600);perform app_private.rate_limit('ai-site','all',100,3600);
 insert into public.ai_runs(report_id,actor,session_id,access_version,evidence_version,kind) values(r.id,me.id,(auth.jwt()->>'session_id')::uuid,me.access_version,r.evidence_version,p_kind) returning * into a;
 return jsonb_build_object('cached',false,'run',to_jsonb(a)-'session_id'-'access_version','case',app_private.case_snapshot(r.id));
end $$;
create function app_private.finish_analysis(p_run_id uuid,p_result jsonb default null,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.ai_runs;r public.reports;p public.profiles;
begin
 select * into strict a from public.ai_runs where id=p_run_id;
 select * into strict r from public.reports where id=a.report_id for update;
 select * into strict a from public.ai_runs where id=p_run_id for update;
 if a.state<>'processing' then return;end if;
 select * into p from public.profiles where id=a.actor;
 if not p.active or p.access_version<>a.access_version or not exists(select 1 from auth.sessions s where s.id=a.session_id and s.user_id=p.id and (p.revoked_before is null or s.created_at>p.revoked_before)) or not coalesce((p.role='admin' or (p.role='officer' and r.assigned_to=p.id) or (p.role='farmer' and r.owner=p.id and a.kind='guide')),false) then
  update public.ai_runs set state='failed',error='Access changed during analysis.',completed_at=now() where id=a.id;return;
 end if;
 if p_error is not null then update public.ai_runs set state='failed',error=left(p_error,300),completed_at=now() where id=a.id;return;end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' or length(p_result::text)>100000 then raise exception 'Invalid AI output.';end if;
 update public.ai_runs set state=case when r.evidence_version=a.evidence_version then 'complete' else 'superseded' end,result=p_result,completed_at=now() where id=a.id;
 update public.reports set updated_at=now() where id=r.id;
 insert into public.audit_log(actor,actor_name,action,target,details) values(p.id,p.name,'case.ai.'||a.kind,r.id::text,jsonb_build_object('runId',a.id,'model',p_result->>'model'));
end $$;
create function public.farmrelay_start_analysis(p_report_id uuid,p_kind text) returns jsonb language sql security invoker set search_path='' as $$select app_private.start_analysis(p_report_id,p_kind);$$;
create function public.farmrelay_finish_analysis(p_run_id uuid,p_result jsonb default null,p_error text default null) returns void language sql security invoker set search_path='' as $$select app_private.finish_analysis(p_run_id,p_result,p_error);$$;
revoke all on function app_private.report_json(public.reports),app_private.case_snapshot(uuid),app_private.investigation(uuid,text,jsonb),app_private.start_analysis(uuid,text),app_private.finish_analysis(uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.farmrelay_investigation(uuid,text,jsonb),public.farmrelay_start_analysis(uuid,text),public.farmrelay_finish_analysis(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function app_private.investigation(uuid,text,jsonb),app_private.start_analysis(uuid,text),public.farmrelay_investigation(uuid,text,jsonb),public.farmrelay_start_analysis(uuid,text) to authenticated;
grant execute on function app_private.finish_analysis(uuid,jsonb,text),public.farmrelay_finish_analysis(uuid,jsonb,text) to service_role;
alter publication supabase_realtime add table public.case_events,public.ai_runs;

-- Do not expose session identifiers or access-version internals through direct reads.
revoke select on public.ai_runs from authenticated;
grant select(id,report_id,actor,evidence_version,kind,state,result,error,created_at,completed_at) on public.ai_runs to authenticated;
-- Carry existing human conversations into the unified timeline.
insert into public.case_events(report_id,client_id,actor,actor_name,kind,body,created_at)
 select report_id,id,author,author_name,case when role='farmer' then 'followup' else 'advice' end,jsonb_build_object('text',text,'legacy',true),created_at from public.messages;
create function app_private.track_case_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and (old.status is distinct from new.status or old.assigned_to is distinct from new.assigned_to or old.priority is distinct from new.priority) then
  insert into public.case_events(report_id,client_id,actor,actor_name,kind,body)
  select new.id,gen_random_uuid(),id,name,'review',jsonb_build_object('statusChange',true,'text','Status: '||new.status||'. Priority: '||new.priority||'.','assigned',new.assigned_to)
  from public.profiles where id=auth.uid();
 end if;
 return new;
end $$;
revoke all on function app_private.track_case_status() from public,anon,authenticated,service_role;
create trigger case_status_event after update on public.reports for each row execute function app_private.track_case_status();

-- Server-filtered queues keep pagination and counts accurate for large workspaces.
create function app_private.case_list(p_query jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles;scope text;q text;st text;lim integer;page integer;total integer;items jsonb;
begin
 perform app_private.assert_data();select * into strict me from public.profiles where id=auth.uid();
 scope:=coalesce(p_query->>'queue','all');q:=left(coalesce(p_query->>'q',''),100);st:=nullif(p_query->>'status','');
 if scope not in ('all','unassigned','due','waiting','recent') then raise exception 'Unknown queue.';end if;
 lim:=greatest(1,least(50,coalesce((p_query->>'limit')::integer,15)));page:=greatest(1,least(10000,coalesce((p_query->>'page')::integer,1)));
 select count(*) into total from public.reports r where
 (me.role='admin' or (me.role='farmer' and r.owner=me.id) or (me.role='officer' and r.assigned_to=me.id))
 and (st is null or r.status=st) and (q='' or position(lower(q) in lower(r.crop||' '||r.community))>0)
 and (scope='all' or (scope='unassigned' and r.assigned_to is null) or (scope='due' and r.followup_due<=current_date and r.status<>'Closed') or (scope='waiting' and r.status='Follow-up needed') or (scope='recent' and r.updated_at>now()-interval '1 day'));
 select coalesce(jsonb_agg(app_private.report_json(x)-'ai'),'[]') into items from (select r.* from public.reports r where
 (me.role='admin' or (me.role='farmer' and r.owner=me.id) or (me.role='officer' and r.assigned_to=me.id))
 and (st is null or r.status=st) and (q='' or position(lower(q) in lower(r.crop||' '||r.community))>0)
 and (scope='all' or (scope='unassigned' and r.assigned_to is null) or (scope='due' and r.followup_due<=current_date and r.status<>'Closed') or (scope='waiting' and r.status='Follow-up needed') or (scope='recent' and r.updated_at>now()-interval '1 day'))
 order by case when r.priority='high' then 0 else 1 end,r.updated_at desc,r.id limit lim offset (page-1)*lim)x;
 return jsonb_build_object('items',items,'total',total,'page',page,'pages',greatest(1,ceil(total::numeric/lim)));
end $$;
create or replace function public.farmrelay_api(p_path text,p_method text default 'GET',p_body jsonb default '{}',p_query jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select case when p_path='/reports' and p_method='GET' then app_private.case_list(p_query) else app_private.api(p_path,p_method,p_body,p_query) end;
$$;
revoke all on function app_private.case_list(jsonb) from public,anon,authenticated,service_role;
grant execute on function app_private.case_list(jsonb) to authenticated;
