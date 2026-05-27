alter table public.survey_runs
add column if not exists current_screenshot_bucket text,
add column if not exists current_screenshot_path text,
add column if not exists current_screenshot_updated_at timestamptz,
add column if not exists current_question_text text,
add column if not exists last_reasoning_summary text,
add column if not exists last_selected_option_text text,
add column if not exists last_supervisor_decision text;
