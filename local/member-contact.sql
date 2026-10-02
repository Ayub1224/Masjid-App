-- Members join using an Indian mobile number; email is required only for owners.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('mosque_private.mosque_command(uuid,jsonb)'::regprocedure);
 definition:=replace(definition, 'email is null and newrole<>''admin''', 'email is null and newrole=''owner''');
 execute definition;
 definition:=pg_get_functiondef('public.mosque_command_people_v2(uuid,jsonb)'::regprocedure);
 definition:=replace(definition, 'target_role in (''admin'',''owner'')', 'target_role in (''member'',''admin'',''owner'')');
 execute definition;
 definition:=pg_get_functiondef('public.mosque_command(uuid,jsonb)'::regprocedure);
 definition:=replace(definition, 'target_role in (''admin'',''owner'')', 'target_role in (''member'',''admin'',''owner'')');
 execute definition;
end $$;
