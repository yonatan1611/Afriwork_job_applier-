import { fetchJobs } from "../integrations/graphql/client.js";
import { getJobPreferences } from "../repositories/jobPreferencesRepo.js";
import {
  getAppliedJobIds,
  recordAppliedJobs,
} from "../repositories/jobsAppliedRepo.js";
import { enrichJobsWithScore } from "../core/scoring/scoreJob.js";
import { bot } from "../integrations/telegram/bot.js";
import { POLL_INTERVAL_MS, TELEGRAM_CHAT_ID } from "../config/constants.js";

// Minimal HTML escaping for safe Telegram HTML parse_mode messages
const escapeHtml = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

async function sendTelegramForMatches(matches) {
  if (!bot || !TELEGRAM_CHAT_ID) return;
  for (const job of matches) {
    const skills = escapeHtml(
      job.skill_requirements
        ?.map((s) => s.skill?.name)
        .filter(Boolean)
        .join(", ") || "N/A",
    );
    const sector = escapeHtml(job.sectors?.[0]?.sector?.name || "N/A");
    const loc = job.city
      ? `${escapeHtml(job.city.name)}, ${escapeHtml(job.city.country?.name || "")}`
      : "Remote";
    const deadlineStr = job.deadline
      ? new Date(job.deadline).toLocaleDateString("en-GB")
      : "N/A";

    const compAmount =
      typeof job.compensation_amount_cents === "number" &&
      job.compensation_amount_cents > 0
        ? String(job.compensation_amount_cents / 100)
        : "N/A";
    const message =
      `<b>💼 Job Title:</b> ${escapeHtml(job.title)}\n` +
      `<b>📌 Job Type:</b> ${escapeHtml(job.job_type || "")}\n` +
      `<b>🌍 Location:</b> ${loc}\n` +
      `<b>💼 Experience:</b> ${escapeHtml(job.experience_level || "")}\n` +
      `<b>💰 Salary/Compensation:</b> ${compAmount} ${escapeHtml(job.compensation_currency || "")} / ${escapeHtml(job.compensation_type || "")}\n` +
      `<b>🗓 Deadline:</b> ${escapeHtml(deadlineStr)}\n\n` +
      `<b>Sector:</b> ${sector}\n` +
      `<b>Company:</b> ${escapeHtml(job.entity?.name || "N/A")}\n\n` +
      `<b>Skills Required:</b> ${skills}\n` +
      `<b>Matching Score:</b> ${escapeHtml(String(job.score))}`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: "Apply ✅",
            callback_data: JSON.stringify({ cmd: "apply", job_id: job.id }),
          },
          {
            text: "Ignore ❌",
            callback_data: JSON.stringify({ cmd: "ignore", job_id: job.id }),
          },
        ],
      ],
    };
    await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard,
    });
  }
}

export async function pollOnce() {
  console.log("Running one polling cycle");
  try {
    const [jobs, prefs, appliedIds] = await Promise.all([
      fetchJobs({ offset: 0 }),
      getJobPreferences(),
      getAppliedJobIds(),
    ]);

    const newJobs = jobs.filter((j) => !appliedIds.has(j.id));
    const scored = enrichJobsWithScore(newJobs, prefs?.json || prefs);
    const matches = scored.filter((j) => j.match);

    await recordAppliedJobs(scored); // record all scored jobs with status matched/ignored
    await sendTelegramForMatches(matches);

    console.log(
      `Cycle complete. Total fetched: ${jobs.length}. New: ${newJobs.length}. Matches: ${matches.length}`,
    );
    return {
      total: jobs.length,
      newCount: newJobs.length,
      matches: matches.length,
    };
  } catch (err) {
    console.error("Polling cycle error", err);
    throw err;
  }
}

export async function jobPollingLoop() {
  await pollOnce();
  setTimeout(jobPollingLoop, POLL_INTERVAL_MS).unref();
}