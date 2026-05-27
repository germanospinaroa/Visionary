do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'stores'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'stores'
  ) then
    alter table pilot.stores set schema public;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'survey_runs'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'survey_runs'
  ) then
    alter table pilot.survey_runs set schema public;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'images'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'images'
  ) then
    alter table pilot.images set schema public;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'questions'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'questions'
  ) then
    alter table pilot.questions set schema public;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'answers'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'answers'
  ) then
    alter table pilot.answers set schema public;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'pilot' and table_name = 'human_reviews'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'human_reviews'
  ) then
    alter table pilot.human_reviews set schema public;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
grant usage, select on sequences to authenticated, service_role;
