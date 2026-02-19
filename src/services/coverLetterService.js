import { getGroqChat } from '../integrations/llm/groqClient.js';
import { stripHtml } from '../utils/text.js';
import { fetchJobById } from '../integrations/graphql/client.js';
import { getJobPreferences } from '../repositories/jobPreferencesRepo.js';
import { getUserProfile } from '../repositories/userProfileRepo.js';

export async function generateCoverLetterForJobId(jobId, chatId) {
  const job = await fetchJobById(jobId);
  if (!job) throw new Error('Job not found');
  const prefs = await getJobPreferences();
  const profile = await getUserProfile(chatId);

  const desc = stripHtml(job.description || '').trim();
  const skills = (job.skill_requirements || []).map(s => s?.skill?.name).filter(Boolean);
  const sectors = (job.sectors || []).map(s => s?.sector?.name).filter(Boolean);
  const city = job.city?.name || '';
  const country = job.city?.country?.name || '';

  const system = `**Act as an experienced, professional career coach.** Your task is to write a compelling and authentic cover letter that sounds like it was written by a thoughtful human, not a generic AI template.
**Instructions for Tone & Style:**
*   **Tone:** Friendly, professional, and non-dramatic. Avoid clichés like "I'm writing to apply for..." or "I am a highly motivated team player..." Instead, start with a genuine point of connection.
*   **Voice:** Sound like a real person. Use a slightly conversational but still professional style. It's okay to use contractions (e.g., "I'm," "I'd").
*   **Structure:**
    1.  **Engaging Opener:** Start with a sentence that in non template written way.
    2.  **Accomplishment Narrative:** Weave my accomplishments into a short story that directly mirrors 1-2 key responsibilities from the job description. Don't just list my skills; show how I used them to achieve a specific, quantifiable result.
    3.  **Connecting Paragraph:** Briefly explain *why* my experience is a direct fit for their needs and how I can replicate that success for their company.
    4.  **Friendly Closing:** End with a warm, forward-looking statement about being eager to discuss the role further.
*   **Key Requirement:** Keep the entire letter under 900-999 characters. It must be concise and easy to read. and dont use bullet points. dont use generic phrases like "I am excited about the opportunity" or "I look forward to contributing to your team."
* **only generate the cover letter, do not include any other text.**

**Generate a cover letter based on the above information.**
`;

  const user = {
    job: {
      applier_name: "Yonatan Girmachew",
      title: job.title,
      company: job.entity?.name,
      experience_level: job.experience_level,
      job_type: job.job_type,
      job_site: job.job_site,
      compensation_type: job.compensation_type,
      city,
      country,
      sectors,
      skills,
      description: desc,
    },
    preferences: prefs,
  user_profile: profile ? { experience_text: profile.experience_text } : undefined,
  };

  const prompt = [
    ['system', system],
    ['user', `Write a tailored cover letter for the following job JSON. Focus on matching responsibilities and required skills.\n\nJOB:\n${JSON.stringify(user, null, 2)}`],
  ];

  const chat = getGroqChat();
  const messages = prompt.map(([role, content]) => ({ role, content }));
  const res = await chat.invoke(messages);
  const text = res?.content?.toString?.() || (Array.isArray(res?.content) ? res.content.map(p=>p.text||'').join('\n') : '') || '';
  // Post-process to remove any accidental preface and start at the salutation
  const clean = (s) => {
    let t = String(s || '').trim();
    // strip markdown code fences
    t = t.replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, '$1').trim();
    // remove leading generic intros
    t = t.replace(/^(here\s+is|here's|a\s+tailored\s+cover\s+letter|tailored\s+cover\s+letter|cover\s+letter)[:\-\s]*/i, '').trim();
    // remove any single first line that ends with ':' (meta heading)
    t = t.replace(/^[^\n]{0,120}:\s*\n+/i, '');
    // if 'Dear' appears soon, cut everything before it
    const dearIdx = t.search(/\bDear\b/i);
    if (dearIdx > 0 && dearIdx < 200) {
      t = t.slice(dearIdx).trim();
    }
    return t;
  };
  return clean(text);
}
