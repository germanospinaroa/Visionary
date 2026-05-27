create extension if not exists pgcrypto;

create schema if not exists pilot;

grant usage on schema pilot to authenticated;
grant usage on schema pilot to service_role;

create or replace function pilot.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists pilot.stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  status text not null default 'pending' check (
    status in (
      'pending',
      'in_progress',
      'completed',
      'failed',
      'human_review',
      'supervisor_rejected',
      'paused'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists pilot.survey_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references pilot.stores(id) on delete cascade,
  validator_code text,
  status text not null default 'pending' check (
    status in (
      'pending',
      'running',
      'completed',
      'failed',
      'human_review',
      'supervisor_rejected',
      'stopped'
    )
  ),
  started_at timestamptz,
  completed_at timestamptz,
  final_code text,
  run_metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists pilot.images (
  id uuid primary key default gen_random_uuid(),
  survey_run_id uuid not null references pilot.survey_runs(id) on delete cascade,
  image_role text not null check (
    image_role in ('source', 'questionnaire', 'derived', 'crop', 'artifact')
  ),
  source_url text,
  storage_bucket text not null,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  crops jsonb not null default '[]'::jsonb,
  ocr_regions jsonb not null default '[]'::jsonb,
  section_estimates jsonb not null default '[]'::jsonb,
  product_candidate_zones jsonb not null default '[]'::jsonb,
  quality_score numeric(5,2),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (storage_bucket, storage_path)
);

create table if not exists pilot.questions (
  id uuid primary key default gen_random_uuid(),
  survey_run_id uuid not null references pilot.survey_runs(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  screenshot_bucket text,
  screenshot_path text,
  detected_question text,
  instructions jsonb not null default '[]'::jsonb,
  clarifications jsonb not null default '[]'::jsonb,
  options jsonb not null default '[]'::jsonb,
  question_type text not null default 'unknown',
  registry_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'analyzed', 'approved', 'rejected', 'human_review')
  ),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (survey_run_id, question_index)
);

create table if not exists pilot.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references pilot.questions(id) on delete cascade,
  selected_option_label text,
  selected_option_text text,
  internal_response text check (internal_response in ('sí', 'no', 'no sé')),
  confidence text check (confidence in ('alta', 'media', 'baja')),
  explanation text,
  reasoning jsonb not null default '{}'::jsonb,
  evidence_image_id uuid references pilot.images(id) on delete set null,
  evidence_crop_path text,
  evidence_coordinates text,
  evidence_section text,
  ocr_evidence text,
  no_puedo_responder boolean not null default false,
  no_puedo_responder_reason text,
  supervisor_status text not null default 'pending' check (
    supervisor_status in (
      'pending',
      'approve',
      'reject',
      'force_no_puedo_responder',
      'retry_with_new_crops'
    )
  ),
  supervisor_rationale text,
  hallucination_risk text check (hallucination_risk in ('alta', 'media', 'baja')),
  final_payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (question_id)
);

create table if not exists pilot.human_reviews (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references pilot.answers(id) on delete cascade,
  action text not null check (action in ('approve', 'correct', 'retry', 'override')),
  corrected_option_label text,
  corrected_option_text text,
  reason text,
  reviewer_user_id uuid default auth.uid(),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_stores_status on pilot.stores(status);
create index if not exists idx_survey_runs_store_id on pilot.survey_runs(store_id);
create index if not exists idx_survey_runs_status on pilot.survey_runs(status);
create index if not exists idx_images_survey_run_id on pilot.images(survey_run_id);
create index if not exists idx_questions_survey_run_id on pilot.questions(survey_run_id);
create index if not exists idx_questions_status on pilot.questions(status);
create index if not exists idx_answers_supervisor_status on pilot.answers(supervisor_status);

drop trigger if exists stores_set_updated_at on pilot.stores;
create trigger stores_set_updated_at
before update on pilot.stores
for each row execute function pilot.set_updated_at();

drop trigger if exists survey_runs_set_updated_at on pilot.survey_runs;
create trigger survey_runs_set_updated_at
before update on pilot.survey_runs
for each row execute function pilot.set_updated_at();

drop trigger if exists images_set_updated_at on pilot.images;
create trigger images_set_updated_at
before update on pilot.images
for each row execute function pilot.set_updated_at();

drop trigger if exists questions_set_updated_at on pilot.questions;
create trigger questions_set_updated_at
before update on pilot.questions
for each row execute function pilot.set_updated_at();

drop trigger if exists answers_set_updated_at on pilot.answers;
create trigger answers_set_updated_at
before update on pilot.answers
for each row execute function pilot.set_updated_at();

alter table pilot.stores enable row level security;
alter table pilot.survey_runs enable row level security;
alter table pilot.images enable row level security;
alter table pilot.questions enable row level security;
alter table pilot.answers enable row level security;
alter table pilot.human_reviews enable row level security;

drop policy if exists "pilot_authenticated_read_stores" on pilot.stores;
create policy "pilot_authenticated_read_stores"
on pilot.stores
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_stores" on pilot.stores;
create policy "pilot_authenticated_write_stores"
on pilot.stores
for all
to authenticated
using (true)
with check (true);

drop policy if exists "pilot_authenticated_read_survey_runs" on pilot.survey_runs;
create policy "pilot_authenticated_read_survey_runs"
on pilot.survey_runs
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_survey_runs" on pilot.survey_runs;
create policy "pilot_authenticated_write_survey_runs"
on pilot.survey_runs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "pilot_authenticated_read_images" on pilot.images;
create policy "pilot_authenticated_read_images"
on pilot.images
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_images" on pilot.images;
create policy "pilot_authenticated_write_images"
on pilot.images
for all
to authenticated
using (true)
with check (true);

drop policy if exists "pilot_authenticated_read_questions" on pilot.questions;
create policy "pilot_authenticated_read_questions"
on pilot.questions
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_questions" on pilot.questions;
create policy "pilot_authenticated_write_questions"
on pilot.questions
for all
to authenticated
using (true)
with check (true);

drop policy if exists "pilot_authenticated_read_answers" on pilot.answers;
create policy "pilot_authenticated_read_answers"
on pilot.answers
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_answers" on pilot.answers;
create policy "pilot_authenticated_write_answers"
on pilot.answers
for all
to authenticated
using (true)
with check (true);

drop policy if exists "pilot_authenticated_read_human_reviews" on pilot.human_reviews;
create policy "pilot_authenticated_read_human_reviews"
on pilot.human_reviews
for select
to authenticated
using (true);

drop policy if exists "pilot_authenticated_write_human_reviews" on pilot.human_reviews;
create policy "pilot_authenticated_write_human_reviews"
on pilot.human_reviews
for all
to authenticated
using (true)
with check (true);
