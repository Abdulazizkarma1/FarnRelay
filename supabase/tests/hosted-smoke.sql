-- Run only against a staging project after all migrations.
-- Synthetic users and sessions exist inside this transaction only.
-- No email, provider request or persistent test data is created.
begin;
do $test$
declare
 root_role text:=current_user; f uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); a uuid:=gen_random_uuid();
 fs uuid:=gen_random_uuid(); os uuid:=gen_random_uuid(); xs uuid:=gen_random_uuid(); ads uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); r uuid; run uuid; data jsonb; blocked boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (f,f||'@farmrelay.example','{"name":"Hosted test farmer"}',now()),
 (o,o||'@farmrelay.example','{"name":"Hosted test officer"}',now()),
 (x,x||'@farmrelay.example','{"name":"Hosted test other"}',now()),
 (a,a||'@farmrelay.example','{"name":"Hosted test admin"}',now());
 insert into auth.sessions(id,user_id,created_at,updated_at,aal) values (fs,f,now(),now(),'aal1'),(os,o,now(),now(),'aal1'),(xs,x,now(),now(),'aal1'),(ads,a,now(),now(),'aal1');
 update public.profiles set role='officer' where id=o;
 update public.profiles set role='admin' where id=a;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',f,'session_id',fs,'aal','aal1')::text,true);
 perform set_config('role','authenticated',true);
 data:=public.farmrelay_api('/reports','POST',jsonb_build_object('clientId',c,'crop','Maize','community','Hosted fixture','symptom','Leaf damage','onset',current_date,'description','Synthetic smoke test only'),'{}');
 r:=(data->'report'->>'_id')::uuid;
 if (public.farmrelay_api('/reports','POST',jsonb_build_object('clientId',c,'crop','Maize','community','Hosted fixture','symptom','Leaf damage','onset',current_date,'description','Synthetic smoke test only'),'{}')->'report'->>'_id')::uuid<>r then raise exception 'Idempotency failed';end if;
 perform public.farmrelay_investigation(r,'answers',jsonb_build_object('clientId',gen_random_uuid(),'answers',jsonb_build_object('insects','Unsure')));
 blocked:=false;begin update public.profiles set role='admin' where id=f;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct role mutation was not denied';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',x,'session_id',xs,'aal','aal1')::text,true);
 if exists(select 1 from public.reports) then raise exception 'Cross-account RLS failed';end if;
 blocked:=false;begin perform public.farmrelay_investigation(r,'get');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-account RPC failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'session_id',os,'aal','aal1')::text,true);
 if exists(select 1 from public.reports) then raise exception 'Unassigned officer read failed';end if;
 perform set_config('role',root_role,true);
 update public.reports set assigned_to=o where id=r;
 perform set_config('role','authenticated',true);
 data:=public.farmrelay_investigation(r,'get');
 if data->'report'->>'_id'<>r::text then raise exception 'Assigned officer read failed';end if;
 data:=public.farmrelay_start_analysis(r,'investigate');run:=(data->'run'->>'id')::uuid;
 if data->'run' ? 'session_id' then raise exception 'Internal session leak';end if;
 perform set_config('role',root_role,true);
 update public.reports set assigned_to=null where id=r;
 perform public.farmrelay_finish_analysis(run,'{"model":"smoke-test","brief":{"summary":"No model call"}}',null);
 if (select state from public.ai_runs where id=run)<>'failed' then raise exception 'Revoked AI persistence failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'session_id',ads,'aal','aal1')::text,true);
 perform set_config('role','authenticated',true);
 blocked:=false;begin perform public.farmrelay_api('/reports','GET','{}','{}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Admin MFA gate failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'session_id',ads,'aal','aal2')::text,true);
 data:=public.farmrelay_api('/reports','GET','{}','{}');
 if (data->>'total')::integer<>1 then raise exception 'Admin aal2 access failed';end if;
 perform set_config('role',root_role,true);
end
$test$;
rollback;
select jsonb_build_object('status','hosted SQL smoke checks passed; all fixture writes rolled back','users',(select count(*) from auth.users),'reports',(select count(*) from public.reports)) as result;
