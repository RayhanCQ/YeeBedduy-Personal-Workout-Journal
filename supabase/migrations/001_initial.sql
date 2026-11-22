create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weekly_workout_goal integer not null default 3 check (weekly_workout_goal >= 1),
  preferred_weight_unit text not null default 'kg' check (preferred_weight_unit in ('kg', 'lb')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Strength' check (category in ('Strength', 'Cardio', 'Mobility', 'Other')),
  movement_type text not null default 'Compound' check (movement_type in ('Compound', 'Isolation', 'Isometric', 'Not Applicable')),
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  instructions text not null default '',
  is_custom boolean not null default false,
  created_by uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_exercise_owner check ((is_custom and created_by is not null) or (not is_custom))
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  workout_type text not null check (workout_type in ('Strength', 'Cardio', 'Flexibility', 'Sports', 'Other')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_workout_complete check (status <> 'completed' or (ended_at is not null and duration_seconds > 0))
);
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  exercise_order integer not null check (exercise_order >= 1),
  created_at timestamptz not null default now()
);
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null check (set_number >= 1),
  reps integer check (reps >= 0),
  weight_kg numeric(8,2) check (weight_kg >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  distance_km numeric(8,3) check (distance_km >= 0),
  is_warmup boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric(6,2) not null check (weight_kg > 0),
  measured_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);
create index workouts_user_started_idx on public.workouts(user_id, started_at desc);
create index workouts_user_status_idx on public.workouts(user_id, status);
create index workout_exercises_workout_idx on public.workout_exercises(workout_id);
create index workout_sets_exercise_idx on public.workout_sets(workout_exercise_id);
create index body_weight_user_measured_idx on public.body_weight_entries(user_id, measured_at);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger settings_updated before update on public.user_settings for each row execute procedure public.touch_updated_at();
create trigger exercises_updated before update on public.exercises for each row execute procedure public.touch_updated_at();
create trigger workouts_updated before update on public.workouts for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_weight_entries enable row level security;
alter table public.exercises enable row level security;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own settings" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own workouts" on public.workouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own workout exercises" on public.workout_exercises for all using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid())) with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy "own workout sets" on public.workout_sets for all using (exists (select 1 from public.workout_exercises we join public.workouts w on w.id = we.workout_id where we.id = workout_exercise_id and w.user_id = auth.uid())) with check (exists (select 1 from public.workout_exercises we join public.workouts w on w.id = we.workout_id where we.id = workout_exercise_id and w.user_id = auth.uid()));
create policy "own body weights" on public.body_weight_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "read global and own exercises" on public.exercises for select using (not is_custom or created_by = auth.uid());
create policy "manage own custom exercises" on public.exercises for all using (is_custom and created_by = auth.uid()) with check (is_custom and created_by = auth.uid());

-- The API validates the authenticated owner before calling this transaction.
create or replace function public.upsert_workout_with_details(p_workout jsonb) returns public.workouts language plpgsql security definer set search_path = public as $$
declare v_workout public.workouts; v_exercise jsonb; v_set jsonb; v_row public.workout_exercises; v_id uuid := nullif(p_workout->>'id', '')::uuid; v_user uuid := (p_workout->>'user_id')::uuid;
begin
  if v_id is null then
    insert into public.workouts (user_id, title, workout_type, status, started_at, ended_at, duration_seconds, notes)
    values (v_user, p_workout->>'title', p_workout->>'workout_type', p_workout->>'status', (p_workout->>'started_at')::timestamptz, nullif(p_workout->>'ended_at','')::timestamptz, (p_workout->>'duration_seconds')::integer, nullif(p_workout->>'notes','')) returning * into v_workout;
  else
    update public.workouts set title = p_workout->>'title', workout_type = p_workout->>'workout_type', status = p_workout->>'status', started_at = (p_workout->>'started_at')::timestamptz, ended_at = nullif(p_workout->>'ended_at','')::timestamptz, duration_seconds = (p_workout->>'duration_seconds')::integer, notes = nullif(p_workout->>'notes','') where id = v_id and user_id = v_user returning * into v_workout;
    if not found then raise exception 'Workout not found'; end if;
    delete from public.workout_exercises where workout_id = v_id;
  end if;
  for v_exercise in select * from jsonb_array_elements(coalesce(p_workout->'exercises', '[]'::jsonb)) loop
    insert into public.workout_exercises (workout_id, exercise_id, exercise_name, exercise_order) values (v_workout.id, nullif(v_exercise->>'exercise_id','')::uuid, v_exercise->>'exercise_name', (v_exercise->>'exercise_order')::integer) returning * into v_row;
    for v_set in select * from jsonb_array_elements(coalesce(v_exercise->'sets', '[]'::jsonb)) loop
      insert into public.workout_sets (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_km, is_warmup) values (v_row.id, (v_set->>'set_number')::integer, nullif(v_set->>'reps','')::integer, nullif(v_set->>'weight_kg','')::numeric, nullif(v_set->>'duration_seconds','')::integer, nullif(v_set->>'distance_km','')::numeric, coalesce((v_set->>'is_warmup')::boolean, false));
    end loop;
  end loop;
  return v_workout;
end; $$;
revoke all on function public.upsert_workout_with_details(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_workout_with_details(jsonb) to service_role;

insert into public.exercises (name, category, movement_type, primary_muscle, secondary_muscles, equipment, instructions) values
('Barbell Back Squat','Strength','Compound','Quadriceps',array['Glutes','Hamstrings'],array['Barbell','Rack'],'Brace your core, sit down and back, then drive through your mid-foot.'),
('Barbell Bench Press','Strength','Compound','Chest',array['Triceps','Shoulders'],array['Barbell','Bench'],'Lower the bar under control to your chest and press it up.'),
('Conventional Deadlift','Strength','Compound','Hamstrings',array['Glutes','Back'],array['Barbell'],'Keep the bar close and stand by pushing the floor away.'),
('Overhead Press','Strength','Compound','Shoulders',array['Triceps'],array['Barbell'],'Keep ribs down and press the bar overhead in a straight path.'),
('Pull Up','Strength','Compound','Back',array['Biceps'],array['Pull-up bar'],'Start from a dead hang and pull elbows down toward your ribs.'),
('Barbell Row','Strength','Compound','Back',array['Biceps'],array['Barbell'],'Hinge at the hips and row the bar toward your lower ribs.'),
('Dumbbell Lunge','Strength','Compound','Quadriceps',array['Glutes','Hamstrings'],array['Dumbbells'],'Step forward, lower the back knee, and push back to standing.'),
('Leg Press','Strength','Compound','Quadriceps',array['Glutes'],array['Machine'],'Lower the sled under control and press without locking knees hard.'),
('Hip Thrust','Strength','Compound','Glutes',array['Hamstrings'],array['Barbell','Bench'],'Drive hips up and squeeze glutes at the top.'),
('Lat Pulldown','Strength','Compound','Back',array['Biceps'],array['Cable machine'],'Pull the bar toward your upper chest with a tall torso.'),
('Dumbbell Curl','Strength','Isolation','Biceps',array['Forearms'],array['Dumbbells'],'Keep elbows still and curl with controlled tempo.'),
('Triceps Pushdown','Strength','Isolation','Triceps',array[],array['Cable machine'],'Keep elbows at your sides and extend fully.'),
('Lateral Raise','Strength','Isolation','Shoulders',array[],array['Dumbbells'],'Raise arms to shoulder height with soft elbows.'),
('Leg Extension','Strength','Isolation','Quadriceps',array[],array['Machine'],'Extend knees smoothly and control the return.'),
('Leg Curl','Strength','Isolation','Hamstrings',array[],array['Machine'],'Curl heels toward you and avoid lifting hips.'),
('Calf Raise','Strength','Isolation','Calves',array[],array['Machine'],'Pause at the top and lower heels through a full range.'),
('Cable Fly','Strength','Isolation','Chest',array['Shoulders'],array['Cable machine'],'Bring hands together in a wide hugging arc.'),
('Face Pull','Strength','Isolation','Shoulders',array['Back'],array['Cable machine'],'Pull rope toward your face and rotate hands back.'),
('Plank','Strength','Isometric','Abs/Core',array['Shoulders'],array['Bodyweight'],'Keep a straight line from shoulders to heels while bracing.'),
('Wall Sit','Strength','Isometric','Quadriceps',array['Glutes'],array['Bodyweight'],'Hold thighs parallel to the floor with your back on a wall.'),
('Dead Hang','Strength','Isometric','Forearms',array['Back'],array['Pull-up bar'],'Hang with active shoulders and a comfortable grip.'),
('Running','Cardio','Not Applicable','Full Body',array[],array['None'],'Maintain a relaxed posture and sustainable pace.'),
('Cycling','Cardio','Not Applicable','Quadriceps',array['Calves'],array['Bike'],'Pedal smoothly at a pace appropriate for your session.'),
('Jump Rope','Cardio','Not Applicable','Calves',array['Shoulders'],array['Jump rope'],'Keep jumps low and rotate from the wrists.'),
('Cat-Cow','Mobility','Not Applicable','Back',array['Abs/Core'],array['Bodyweight'],'Move slowly between a rounded and extended spine.');
