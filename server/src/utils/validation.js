export const WORKOUT_TYPES = ['Strength', 'Cardio', 'Flexibility', 'Sports', 'Other'];
export function fail(message, status = 400) { const error = new Error(message); error.status = status; return error; }
export function positiveNumber(value, label) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw fail(`${label} must be greater than zero.`); return number; }
export function validateWorkout(body) {
  if (!String(body.title || '').trim()) throw fail('Workout name is required.');
  if (!WORKOUT_TYPES.includes(body.workout_type)) throw fail('Workout type is invalid.');
  if (!['in_progress', 'completed'].includes(body.status)) throw fail('Workout status is invalid.');
  const duration = Number(body.duration_seconds);
  if (!Number.isInteger(duration) || duration < 0) throw fail('Duration must be a non-negative whole number of seconds.');
  if (body.status === 'completed' && (!body.ended_at || duration < 1)) throw fail('A completed workout needs an end time and duration.');
  for (const exercise of body.exercises || []) {
    if (!String(exercise.exercise_name || '').trim()) throw fail('Every exercise needs a name.');
    for (const set of exercise.sets || []) {
      if (!Number.isInteger(Number(set.set_number)) || Number(set.set_number) < 1) throw fail('Set number must be at least 1.');
      for (const key of ['reps', 'weight_kg', 'duration_seconds', 'distance_km']) if (set[key] != null && (!Number.isFinite(Number(set[key])) || Number(set[key]) < 0)) throw fail(`${key} cannot be negative.`);
    }
  }
}
