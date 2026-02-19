import { getDb } from '../integrations/mongodb/client.js';

const COLLECTION = 'user_profiles';

export async function getUserProfile(chatId) {
  if (!chatId) return null;
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ chat_id: String(chatId) });
}

export async function setUserExperience(chatId, experience_text) {
  if (!chatId) throw new Error('chatId required');
  const db = await getDb();
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    { chat_id: String(chatId) },
    { $set: { experience_text }, $setOnInsert: { chat_id: String(chatId), created_at: new Date() }, $currentDate: { updated_at: true } },
    { upsert: true, returnDocument: 'after' }
  );
  return res.value;
}

export async function clearUserExperience(chatId) {
  if (!chatId) throw new Error('chatId required');
  const db = await getDb();
  const res = await db.collection(COLLECTION).updateOne(
    { chat_id: String(chatId) },
    { $unset: { experience_text: '' }, $currentDate: { updated_at: true } }
  );
  return res.modifiedCount;
}
