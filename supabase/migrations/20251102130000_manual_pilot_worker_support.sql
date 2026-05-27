alter table public.survey_runs
drop constraint if exists survey_runs_status_check;

alter table public.survey_runs
add constraint survey_runs_status_check
check (
  status in (
    'pending',
    'running',
    'extracting_images',
    'answering_questions',
    'selecting_used_images',
    'completed',
    'failed',
    'paused',
    'human_review',
    'supervisor_rejected',
    'stopped'
  )
);

alter table public.survey_runs
add column if not exists survey_url text,
add column if not exists current_step text,
add column if not exists current_question_index integer,
add column if not exists validator_code text,
add column if not exists browser_session_id text,
add column if not exists last_heartbeat_at timestamptz,
add column if not exists error_screenshot_bucket text,
add column if not exists error_screenshot_path text,
add column if not exists last_error_code text,
add column if not exists browser_config jsonb not null default '{}'::jsonb;

create table if not exists public.browser_events (
  id uuid primary key default gen_random_uuid(),
  survey_run_id uuid not null references public.survey_runs(id) on delete cascade,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  event_type text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  screenshot_bucket text,
  screenshot_path text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_browser_events_survey_run_id on public.browser_events(survey_run_id);
create index if not exists idx_browser_events_level on public.browser_events(level);

alter table public.browser_events enable row level security;

drop policy if exists "pilot_authenticated_read_browser_events" on public.browser_events;
create policy "pilot_authenticated_read_browser_events"
on public.browser_events
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_browser_events" on public.browser_events;
create policy "pilot_authenticated_write_browser_events"
on public.browser_events
for all
to authenticated
using (true)
with check (true);
