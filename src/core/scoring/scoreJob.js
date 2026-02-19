import { SCORE_THRESHOLD } from '../../config/constants.js';
import { stripHtml, toWordSet } from '../../utils/text.js';

// Enhanced matching using all essential job keys:
// id, title, created_at, published_at, description, job_type, job_site,
// skill_requirements.skill.name, city.name, city.country.name,
// sectors.sector.name, compensation_type, experience_level, entity.name

/* Preference structure (example)
{
  roles: { "planning engineer": 5, engineer: 3 },
  skills: { primavera: 4, "ms project": 3, wbs: 2, "earned value": 2 },
  sectors: { construction: 3, civil: 2 },
  locations: { "addis ababa": 5, onsite: 1 },
  experience_level: { senior: 5, mid: 3 },
  job_type: { full_time: 2, contract: 1 },
  boosts: { company: { "Eyufree Trading PLC": 2 } },
  compensation_type: { monthly: 1, hourly: 0 }
}
*/

const CATEGORY_KEYS = {
  // roles should only match against the job title text
  roles: ['title'],
  skills: ['description', 'skill_requirements.skill.name'],
  sectors: ['sectors.sector.name'],
  locations: ['city.name', 'city.country.name'],
  job_site: ['job_site'],
  job_type: ['job_type'],
  experience_level: ['experience_level'],
  compensation_type: ['compensation_type'],
  companies: ['entity.name'],
};

function getNestedValues(job, path) {
  const parts = path.split('.');
  function dive(obj, i) {
    if (i === parts.length) return [obj];
    const key = parts[i];
    const val = obj?.[key];
    if (Array.isArray(val)) return val.flatMap(v => dive(v, i + 1));
    if (val === undefined || val === null) return [];
    return dive(val, i + 1);
  }
  return dive(job, 0).filter(v => typeof v === 'string');
}

function normalize(str) { return (str || '').toLowerCase(); }

function scoreCategory(job, prefs = {}, category, details) {
  const mapping = prefs[category];
  if (!mapping || typeof mapping !== 'object') return 0;
  const fields = CATEGORY_KEYS[category];
  if (!fields) return 0;
  let subtotal = 0;
  const tokensCache = new Map();
  for (const field of fields) {
    const values = getNestedValues(job, field);
    for (const raw of values) {
      const base = normalize(raw);
      if (!tokensCache.has(base)) tokensCache.set(base, toWordSet(base));
      const wordSet = tokensCache.get(base);
      for (const [pref, weight] of Object.entries(mapping)) {
        const prefNorm = normalize(pref);
        // Exact token or substring heuristic
        if (wordSet.has(prefNorm) || base.includes(prefNorm)) {
          subtotal += Number(weight) || 0;
          details.push({ category, field, value: raw, prefKey: pref, weight: Number(weight) || 0 });
        }
      }
    }
  }
  return subtotal;
}

function scoreDescription(job, prefs, details) {
  const skills = prefs.skills || {};
  if (!job.description || !Object.keys(skills).length) return 0;
  const text = stripHtml(job.description).toLowerCase();
  let subtotal = 0;
  for (const [skill, weight] of Object.entries(skills)) {
    if (text.includes(skill.toLowerCase())) subtotal += Number(weight) || 0;
  }
  return subtotal;
}

function scoreAdvanced(job, prefs, details) {
  let subtotal = 0;
  // Freshness (published_at or created_at age)
  const freshPref = prefs.freshness || {};
  const ts = Date.parse(job.published_at || job.created_at || '') || null;
  if (ts && freshPref.max_age_days && freshPref.weight) {
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    if (ageDays <= freshPref.max_age_days) {
      subtotal += freshPref.weight;
      details.push({ category: 'freshness', ageDays: Number(ageDays.toFixed(2)), weight: freshPref.weight });
    }
  }

  return subtotal;
}

export function calculateScore(job, preferences = {}, outDetails = []) {
  let total = 0;
  total += scoreCategory(job, preferences, 'roles', outDetails);
  total += scoreCategory(job, preferences, 'skills', outDetails);
  total += scoreCategory(job, preferences, 'sectors', outDetails);
  total += scoreCategory(job, preferences, 'locations', outDetails);
  total += scoreCategory(job, preferences, 'job_site', outDetails);
  total += scoreCategory(job, preferences, 'job_type', outDetails);
  total += scoreCategory(job, preferences, 'experience_level', outDetails);
  total += scoreCategory(job, preferences, 'compensation_type', outDetails);
  total += scoreCategory(job, preferences, 'companies', outDetails);
  total += scoreDescription(job, preferences, outDetails);
  total += scoreAdvanced(job, preferences, outDetails);
  return total;
}

export function enrichJobsWithScore(jobs, preferences) {
  return jobs.map(j => {
    const details = [];
    const score = calculateScore(j, preferences, details);
  const threshold = Number(preferences?.score_threshold ?? SCORE_THRESHOLD);
  return { ...j, score, match: score >= threshold, match_details: details };
  });
}
