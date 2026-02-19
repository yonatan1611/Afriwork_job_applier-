import { getDb } from '../integrations/mongodb/client.js';

export async function saveCoverLetter({ job_id, job_title, content, model = 'groq:llama-3.1-8b-instant' }) {
  const db = await getDb();
  const doc = { job_id, job_title, content, model, created_at: new Date() };
  const res = await db.collection('cover_letters').insertOne(doc);
  return res.insertedId;
}
