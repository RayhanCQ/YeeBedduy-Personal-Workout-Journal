import express from 'express';
import cors from 'cors';
import { db } from './config/supabase.js';
import { requireAuth } from './middleware/auth.js';
import { fail, positiveNumber, validateWorkout } from './utils/validation.js';
import { serializeWorkout, summarizeWorkouts } from './utils/workouts.js';

const app = express();
app.use(cors()); app.use(express.json({ limit: '1mb' }));
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const selectWorkouts = '*, workout_exercises(*, workout_sets(*))';
async function ensureUser(user) {
  const display_name = user.user_metadata?.display_name || user.email?.split('@')[0] || null;
  const { error } = await db.from('profiles').upsert({ id: user.id, display_name }, { onConflict: 'id', ignoreDuplicates: true }); if (error) throw error;
  const { error: settingsError } = await db.from('user_settings').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true }); if (settingsError) throw settingsError;
}
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1', requireAuth, asyncRoute(async (req, _res, next) => { await ensureUser(req.user); next(); }));
const router = express.Router();

router.get('/profile', asyncRoute(async (req, res) => { const [{ data: profile, error }, { data: settings, error: settingsError }] = await Promise.all([db.from('profiles').select('*').eq('id', req.user.id).single(), db.from('user_settings').select('*').eq('user_id', req.user.id).single()]); if (error || settingsError) throw error || settingsError; res.json({ data: { profile, settings, email: req.user.email } }); }));
router.patch('/profile', asyncRoute(async (req, res) => { const display_name = String(req.body.display_name || '').trim(); if (!display_name) throw fail('Display name is required.'); const { data, error } = await db.from('profiles').update({ display_name }).eq('id', req.user.id).select().single(); if (error) throw error; res.json({ data }); }));
router.patch('/settings', asyncRoute(async (req, res) => { const goal = Number(req.body.weekly_workout_goal); if (!Number.isInteger(goal) || goal < 1) throw fail('Weekly workout goal must be at least 1.'); const { data, error } = await db.from('user_settings').update({ weekly_workout_goal: goal }).eq('user_id', req.user.id).select().single(); if (error) throw error; res.json({ data }); }));

router.get('/dashboard', asyncRoute(async (req, res) => { const [{ data: workouts, error }, { data: settings, error: settingsError }] = await Promise.all([db.from('workouts').select('*').eq('user_id', req.user.id).eq('status', 'completed').order('started_at', { ascending: false }), db.from('user_settings').select('weekly_workout_goal').eq('user_id', req.user.id).single()]); if (error || settingsError) throw error || settingsError; const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0); const week = workouts.filter((w) => new Date(w.started_at) >= monday); const unique = [...new Set(week.map((w) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(w.started_at).getDay()]))]; res.json({ data: { completed_workouts: week.length, active_days: unique, total_duration_seconds: week.reduce((sum, w) => sum + w.duration_seconds, 0), weekly_goal: settings.weekly_workout_goal, last_workout: workouts[0] || null, streak: 0 } }); }));

router.get('/exercises', asyncRoute(async (req, res) => { const { search = '', muscle, movement_type, equipment } = req.query; let query = db.from('exercises').select('*').or(`is_custom.eq.false,created_by.eq.${req.user.id}`).order('name').limit(100); if (search) query = query.ilike('name', `%${String(search).replace(/[%_]/g, '')}%`); if (muscle) query = query.eq('primary_muscle', muscle); if (movement_type) query = query.eq('movement_type', movement_type); if (equipment) query = query.contains('equipment', [equipment]); const { data, error } = await query; if (error) throw error; res.json({ data }); }));
router.get('/exercises/:id', asyncRoute(async (req, res) => { const { data, error } = await db.from('exercises').select('*').eq('id', req.params.id).or(`is_custom.eq.false,created_by.eq.${req.user.id}`).single(); if (error) throw fail('Exercise not found.', 404); res.json({ data }); }));
router.post('/exercises', asyncRoute(async (req, res) => { const name = String(req.body.name || '').trim(); if (!name) throw fail('Exercise name is required.'); const { data, error } = await db.from('exercises').insert({ ...req.body, name, is_custom: true, created_by: req.user.id }).select().single(); if (error) throw error; res.status(201).json({ data }); }));

router.get('/workouts', asyncRoute(async (req, res) => { const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100); let query = db.from('workouts').select('*').eq('user_id', req.user.id).order('started_at', { ascending: false }).limit(limit); if (req.query.type) query = query.eq('workout_type', req.query.type); const { data, error } = await query; if (error) throw error; res.json({ data }); }));
router.get('/workouts/:id', asyncRoute(async (req, res) => { const { data, error } = await db.from('workouts').select(selectWorkouts).eq('id', req.params.id).eq('user_id', req.user.id).single(); if (error) throw fail('Workout not found.', 404); res.json({ data: serializeWorkout(data) }); }));
async function writeWorkout(req, res, id) { validateWorkout(req.body); const payload = { ...req.body, title: req.body.title.trim(), user_id: req.user.id, id: id || null }; const { data, error } = await db.rpc('upsert_workout_with_details', { p_workout: payload }); if (error) throw error; res.status(id ? 200 : 201).json({ data }); }
router.post('/workouts', asyncRoute((req, res) => writeWorkout(req, res)));
router.patch('/workouts/:id', asyncRoute((req, res) => writeWorkout(req, res, req.params.id)));
router.delete('/workouts/:id', asyncRoute(async (req, res) => { const { error } = await db.from('workouts').delete().eq('id', req.params.id).eq('user_id', req.user.id); if (error) throw error; res.status(204).send(); }));

router.get('/body-weight', asyncRoute(async (req, res) => { const { data, error } = await db.from('body_weight_entries').select('*').eq('user_id', req.user.id).order('measured_at'); if (error) throw error; res.json({ data }); }));
router.post('/body-weight', asyncRoute(async (req, res) => { const weight_kg = positiveNumber(req.body.weight_kg, 'Weight'); if (!req.body.measured_at) throw fail('Measurement date is required.'); const { data, error } = await db.from('body_weight_entries').insert({ user_id: req.user.id, weight_kg, measured_at: req.body.measured_at, notes: req.body.notes || null }).select().single(); if (error) throw error; res.status(201).json({ data }); }));
router.delete('/body-weight/:id', asyncRoute(async (req, res) => { const { error } = await db.from('body_weight_entries').delete().eq('id', req.params.id).eq('user_id', req.user.id); if (error) throw error; res.status(204).send(); }));
router.get('/progress/summary', asyncRoute(async (req, res) => { const [{ data: workouts, error }, { data: body_weights, error: weightError }] = await Promise.all([db.from('workouts').select(selectWorkouts).eq('user_id', req.user.id).eq('status', 'completed'), db.from('body_weight_entries').select('*').eq('user_id', req.user.id).order('measured_at')]); if (error || weightError) throw error || weightError; res.json({ data: { ...summarizeWorkouts(workouts, Number(req.query.range) || 30), body_weights } }); }));
app.use('/api/v1', router);
app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ message: error.message || 'An unexpected error occurred.' }); });
export default app;
