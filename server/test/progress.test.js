import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkouts } from '../src/utils/workouts.js';

test('calculates volume and personal records from completed workouts only', () => {
  const now = new Date().toISOString();
  const workouts = [
    { status: 'completed', started_at: now, workout_exercises: [{ exercise_name: 'Bench Press', workout_sets: [{ reps: 5, weight_kg: 80 }, { reps: 8, weight_kg: 70 }] }] },
    { status: 'in_progress', started_at: now, workout_exercises: [{ exercise_name: 'Bench Press', workout_sets: [{ reps: 1, weight_kg: 100 }] }] },
  ];
  const result = summarizeWorkouts(workouts);
  assert.equal(result.total_volume, 960);
  assert.deepEqual(result.personal_records, [{ exercise_name: 'Bench Press', max_weight_kg: 80 }]);
  assert.equal(result.frequency_total, 1);
});
