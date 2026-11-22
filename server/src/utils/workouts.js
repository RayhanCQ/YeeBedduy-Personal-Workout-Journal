export function serializeWorkout(row) {
  if (!row) return null;
  const exerciseRows = row.workout_exercises || [];
  return { ...row, exercises: exerciseRows.sort((a, b) => a.exercise_order - b.exercise_order).map((exercise) => ({ ...exercise, sets: (exercise.workout_sets || []).sort((a, b) => a.set_number - b.set_number) })) };
}
export function summarizeWorkouts(workouts, days = 30) {
  const today = new Date(); const start = new Date(today); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0);
  const completed = workouts.filter((workout) => workout.status === 'completed' && new Date(workout.started_at) >= start);
  const frequencyByDate = new Map(); const records = new Map(); let volume = 0;
  for (const workout of completed) {
    const key = new Date(workout.started_at).toLocaleDateString('en-CA'); frequencyByDate.set(key, (frequencyByDate.get(key) || 0) + 1);
    for (const exercise of workout.workout_exercises || []) for (const set of exercise.workout_sets || []) {
      const reps = Number(set.reps); const weight = Number(set.weight_kg); if (Number.isFinite(reps) && Number.isFinite(weight)) { volume += reps * weight; const previous = records.get(exercise.exercise_name) || 0; records.set(exercise.exercise_name, Math.max(previous, weight)); }
    }
  }
  const frequency = Array.from({ length: 28 }, (_, index) => { const day = new Date(today); day.setDate(today.getDate() - 27 + index); return frequencyByDate.get(day.toLocaleDateString('en-CA')) || 0; });
  return { total_volume: volume, frequency, frequency_total: completed.length, personal_records: [...records].map(([exercise_name, max_weight_kg]) => ({ exercise_name, max_weight_kg })) };
}
