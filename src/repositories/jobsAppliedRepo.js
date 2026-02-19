import { getDb } from '../integrations/mongodb/client.js';

export async function getAppliedJobIds() {
  const db = await getDb();
  const docs = await db.collection('jobs_applied').find({}, { projection: { job_id: 1 } }).toArray();
  return new Set(docs.map(d => d.job_id));
}

export async function recordAppliedJobs(jobs) {
  if (!jobs.length) return 0;
  const db = await getDb();
  const payload = jobs.map(j => ({
    job_id: j.id,
    job_title: j.title,
    status: j.match ? 'matched' : 'ignored',
    match_score: typeof j.score === 'number' ? j.score : null,
    created_at: new Date()
  }));
  const res = await db.collection('jobs_applied').insertMany(payload, { ordered: false });
  return res.insertedCount || payload.length;
}

export async function clearAppliedJobs() {
  const db = await getDb();
  const res = await db.collection('jobs_applied').deleteMany({});
  return res.deletedCount;
}

export async function setJobStatus(job_id, status) {
  const db = await getDb();
  const res = await db.collection('jobs_applied').updateOne(
    { job_id },
    { $set: { status, updated_at: new Date() } },
    { upsert: true }
  );
  return res.modifiedCount || res.upsertedCount || 0;
}
