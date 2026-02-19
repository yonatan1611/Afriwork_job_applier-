import { getDb } from '../integrations/mongodb/client.js';

const COLLECTION = 'my_job_preference';
const CATEGORY_SYNONYMS = {
  role: 'roles',
  roles: 'roles',
  skill: 'skills',
  skills: 'skills',
  location: 'locations',
  locations: 'locations',
  company: 'companies',
  companies: 'companies',
  // experience variants map to experience_level for consistency
  exp: 'experience_level',
  experience: 'experience_level',
  'experience-level': 'experience_level',
  seniority: 'experience_level',
  // job type variants
  jobtype: 'job_type',
  'job-type': 'job_type',
  // compensation type variants
  compensation: 'compensation_type',
  'compensation-type': 'compensation_type'
};

function normalizeCategory(cat) {
  if (!cat) return cat;
  cat = cat.toLowerCase();
  if (CATEGORY_SYNONYMS[cat]) return CATEGORY_SYNONYMS[cat];
  return cat;
}

export function normalizeCategoryName(cat) {
  return normalizeCategory(cat);
}

export function getAllowedCategories() {
  return ['roles','skills','locations','experience_level','job_type','job_site','compensation_type','companies'];
}

export async function getJobPreferences() {
  const db = await getDb();
  // For now assume one preferences document (can be extended with userId later)
  const doc = await db.collection(COLLECTION).findOne({});
  return doc || {};
}

export async function upsertJobPreferences(patch) {
  const db = await getDb();
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {},
    { $set: patch, $setOnInsert: { created_at: new Date() }, $currentDate: { updated_at: true } },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value;
}

export async function updatePreferenceCategory(category, key, value) {
  category = normalizeCategory(category);
  if (!getAllowedCategories().includes(category)) throw new Error('Invalid category');
  if (typeof key !== 'string' || !key.trim()) throw new Error('Invalid key');
  if (!Number.isFinite(Number(value))) throw new Error('Invalid weight (must be a number)');
  const db = await getDb();
  const field = `${category}.${key}`;
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {},
    { $set: { [field]: value }, $currentDate: { updated_at: true } },
    { upsert: true, returnDocument: 'after' }
  );
  if (res.value) return res.value;
  // Fallback fetch (shouldn't normally happen, but guards against driver edge cases)
  const doc = await db.collection(COLLECTION).findOne({}) || {};
  return doc;
}

export async function removePreferenceKey(category, key) {
  category = normalizeCategory(category);
  if (!getAllowedCategories().includes(category)) throw new Error('Invalid category');
  if (typeof key !== 'string' || !key.trim()) throw new Error('Invalid key');
  const db = await getDb();
  const field = `${category}.${key}`;
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {},
    { $unset: { [field]: '' }, $currentDate: { updated_at: true } },
    { returnDocument: 'after' }
  );
  if (res.value) return res.value;
  const doc = await db.collection(COLLECTION).findOne({}) || {};
  return doc;
}

// Threshold controls
export async function setScoreThreshold(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error('Threshold must be a number');
  const db = await getDb();
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {},
    { $set: { score_threshold: num }, $setOnInsert: { created_at: new Date() }, $currentDate: { updated_at: true } },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value;
}

export async function clearScoreThreshold() {
  const db = await getDb();
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    {},
    { $unset: { score_threshold: '' }, $currentDate: { updated_at: true } },
    { returnDocument: 'after' }
  );
  return res.value;
}
