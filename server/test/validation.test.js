import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout } from '../src/utils/validation.js';
const valid = { title: 'Leg day', workout_type: 'Strength', status: 'completed', duration_seconds: 60, ended_at: new Date().toISOString(), exercises: [{ exercise_name: 'Squat', sets: [{ set_number: 1, reps: 5, weight_kg: 80 }] }] };
test('accepts a valid completed workout', () => assert.doesNotThrow(() => validateWorkout(valid)));
test('rejects completed workouts without duration', () => assert.throws(() => validateWorkout({ ...valid, duration_seconds: 0 })));
test('rejects negative set values', () => assert.throws(() => validateWorkout({ ...valid, exercises: [{ exercise_name: 'Squat', sets: [{ set_number: 1, reps: -1 }] }] })));
