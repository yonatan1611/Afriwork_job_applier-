import { ChatGroq } from '@langchain/groq';
import { GROQ_API_KEY } from '../../config/constants.js';

export function getGroqChat(modelName = 'llama-3.1-8b-instant') {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  return new ChatGroq({ apiKey: GROQ_API_KEY, model: modelName, temperature: 0.4 });
}
