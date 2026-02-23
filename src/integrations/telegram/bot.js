import TelegramBot from "node-telegram-bot-api";
import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_POLLING,
} from "../../config/constants.js";
import {
  updatePreferenceCategory,
  removePreferenceKey,
  getJobPreferences,
  getAllowedCategories,
  setScoreThreshold,
  clearScoreThreshold,
} from "../../repositories/jobPreferencesRepo.js";
import { setJobStatus } from "../../repositories/jobsAppliedRepo.js";
import { generateCoverLetterForJobId } from "../../services/coverLetterService.js";
import { saveCoverLetter } from "../../repositories/coverLettersRepo.js";
import {
  setUserExperience,
  clearUserExperience,
} from "../../repositories/userProfileRepo.js";
import { getUserProfile } from "../../repositories/userProfileRepo.js";
import { clearAppliedJobs } from "../../repositories/jobsAppliedRepo.js";
import { applyViaApi } from "../../services/afriworkApiApplyService.js";

if (!TELEGRAM_BOT_TOKEN) {
  console.warn("TELEGRAM_BOT_TOKEN not set; telegram features disabled");
}

export const bot = TELEGRAM_BOT_TOKEN
  ? new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: TELEGRAM_POLLING })
  : null;

if (bot) {
  // Minimal HTML escaping for safe Telegram HTML parse_mode messages
  const escapeHtml = (s = "") =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  function tokenizeArgs(str) {
    // Normalize smart quotes to straight quotes
    const normalized = String(str)
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      .replaceAll("‘", "'")
      .replaceAll("’", "'");
    const tokens = [];
    const regex = /("([^"]+)")|(\S+)/g;
    let m;
    while ((m = regex.exec(normalized))) {
      if (m[2]) tokens.push(m[2]);
      else if (m[3]) tokens.push(m[3]);
    }
    return tokens;
  }

  bot.onText(/^\/pref(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const argString = match[1];
    if (!argString) {
      const prefs = await getJobPreferences();
      await bot.sendMessage(
        chatId,
        `Current preferences:\n<pre>${escapeHtml(JSON.stringify(prefs, null, 2))}</pre>`,
        { parse_mode: "HTML" },
      );
      await bot.sendMessage(chatId, "For full manual: /pref help");
      return;
    }
    const parts = tokenizeArgs(argString.trim());
    const action = parts.shift()?.toLowerCase();
    try {
      if (action === "help") {
        const manual = [
          "<b>Preference manual</b>",
          "Structure (keys can be added with weights):",
          '<pre>{\n  "roles": { "planning engineer": 5, "engineer": 3 },\n  "skills": { "primavera": 4, "ms project": 3, "wbs": 2 },\n  "sectors": { "construction": 3 },\n  "locations": { "addis ababa": 5 },\n  "job_site": { "onsite": 1, "remote": 2 },\n  "job_type": { "full_time": 2 },\n  "experience_level": { "senior": 5 },\n  "companies": { "Eyufree Trading PLC": 2 },\n  "compensation_type": { "monthly": 1 },\n  "freshness": { "max_age_days": 7, "weight": 1 }\n}</pre>',
          "Quotes are required for multi-word keys (straight or smart quotes are accepted).",
          "",
          "<b>Set examples</b>",
          '/pref set roles "planning engineer" 5',
          '/pref set skills "ms project" 3',
          "/pref set sectors construction 3",
          '/pref set locations "addis ababa" 5',
          "/pref set job_site onsite 1",
          "/pref set job_type full_time 2",
          "/pref set experience_level senior 5",
          '/pref set companies "Eyufree Trading PLC" 2',
          "/pref set compensation_type monthly 1",
          "",
          "<b>Delete examples</b>",
          '/pref del roles "planning engineer"',
          '/pref del companies "Eyufree Trading PLC"',
          "",
          "Synonyms: role->roles, skill->skills, location->locations, exp/experience/seniority->experience_level, job-type->job_type.",
          "",
          "<b>Threshold controls</b>",
          "/pref threshold                 # show current threshold",
          "/pref threshold set 12          # set threshold to 12",
          "/pref threshold clear           # remove custom threshold (fallback to default)",
        ].join("\n");
        await bot.sendMessage(chatId, manual, { parse_mode: "HTML" });
        return;
      } else if (action === "categories") {
        await bot.sendMessage(
          chatId,
          "Allowed categories:\n" + getAllowedCategories().join(", "),
        );
        return;
      } else if (action === "threshold") {
        const sub = (parts.shift() || "").toLowerCase();
        if (!sub) {
          const prefs = await getJobPreferences();
          const current = prefs?.score_threshold ?? null;
          const envDefault = process.env.SCORE_THRESHOLD;
          const note =
            current == null
              ? `Using default (${envDefault})`
              : `Current: ${current}`;
          await bot.sendMessage(chatId, `Match score threshold -> ${note}`);
          return;
        }
        if (sub === "set") {
          const val = Number(parts.shift());
          if (!Number.isFinite(val))
            throw new Error("Usage: /pref threshold set <number>");
          await setScoreThreshold(val);
          await bot.sendMessage(chatId, `Threshold updated to ${val}.`);
          return;
        }
        if (sub === "clear") {
          await clearScoreThreshold();
          await bot.sendMessage(chatId, "Threshold cleared; will use default.");
          return;
        }
        throw new Error(
          "Unknown threshold subcommand. Use: /pref threshold [set <number>|clear]",
        );
      }
      if (action === "set") {
        const [categoryRaw, keyRaw, weightStr] = parts;
        const category = categoryRaw; // normalization inside repo
        const key = keyRaw; // keep original case for display
        const weight = Number(weightStr);
        if (!categoryRaw || !keyRaw || !weightStr)
          throw new Error("Format: /pref set <category> <key> <number>");
        if (!Number.isFinite(weight))
          throw new Error("Weight must be a number");
        const updated =
          (await updatePreferenceCategory(category, key, weight)) || {};
        const keys = Object.keys(updated || {});
        const normCat =
          keys.find((k) => k.toLowerCase() === category.toLowerCase()) ||
          category;
        const catObj =
          updated && updated[normCat]
            ? updated[normCat]
            : updated[category] || {};
        await bot.sendMessage(
          chatId,
          `Updated ${normCat}.${key} = ${weight}\n<pre>${escapeHtml(JSON.stringify(catObj || {}, null, 2))}</pre>`,
          { parse_mode: "HTML" },
        );
      } else if (action === "del") {
        const [category, key] = parts;
        if (!category || !key)
          throw new Error("Format: /pref del <category> <key>");
        const updated = await removePreferenceKey(category, key);
        await bot.sendMessage(chatId, `Removed ${category}.${key}.`);
      } else {
        await bot.sendMessage(chatId, "Unknown action. Use set|del.");
      }
    } catch (e) {
      await bot.sendMessage(chatId, "Error: " + e.message);
    }
  });

  bot.onText(/^\/jobs\s+clear$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const deleted = await clearAppliedJobs();
      await bot.sendMessage(chatId, `Cleared ${deleted} job records.`);
    } catch (e) {
      await bot.sendMessage(chatId, "Error clearing jobs: " + e.message);
    }
  });

  bot.onText(/^\/jobs$/i, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "Subcommands:\n/jobs clear\n/refetch - run manual job search (aliases: /searchjobs, /scan)",
    );
  });

  // General help command
  bot.onText(/^\/help$/i, async (msg) => {
    const chatId = msg.chat.id;
    const help = [
      "Commands:",
      "/jobs - show jobs subcommands",
      "/jobs clear - clear recorded jobs",
      "/refetch - run manual job search (aliases: /searchjobs, /scan)",
      "/pref - manage preferences (use /pref help for details)",
      "/threshold - view/set threshold",
      "/exp - manage experience (use /exp help)",
    ].join("\n");
    await bot.sendMessage(chatId, help);
  });

  // Threshold controls
  bot.onText(/^\/threshold\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    const prefs = await getJobPreferences();
    const current = prefs?.score_threshold ?? null;
    const envDefault = process.env.SCORE_THRESHOLD;
    const note =
      current == null ? `Using default (${envDefault})` : `Current: ${current}`;
    await bot.sendMessage(chatId, `Match score threshold -> ${note}`);
  });

  bot.onText(/^\/threshold\s+set\s+(\S+)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const val = Number(match[1]);
    if (!Number.isFinite(val))
      return bot.sendMessage(chatId, "Usage: /threshold set <number>");
    try {
      await setScoreThreshold(val);
      await bot.sendMessage(chatId, `Threshold updated to ${val}.`);
    } catch (e) {
      await bot.sendMessage(chatId, "Failed to set threshold: " + e.message);
    }
  });

  bot.on("callback_query", async (query) => {
    try {
      const data = JSON.parse(query.data || "{}");
      const chatId = query.message?.chat?.id;
      const msgId = query.message?.message_id;
      if (!data || !data.cmd || !data.job_id) return;
      if (data.cmd === "ignore") {
        await setJobStatus(String(data.job_id), "ignored");
        await bot.answerCallbackQuery(query.id, { text: "Ignored" });
        if (chatId && msgId) {
          const original = query.message?.text || "";
          const header = "<b>🚫 IGNORED</b>\n\n";
          const alreadyTagged = /^<b>🚫 IGNORED<\/b>/.test(original);
          const newText = alreadyTagged ? original : header + original;
          await bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: msgId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] },
          });
        }
      } else if (data.cmd === "apply") {
        await setJobStatus(String(data.job_id), "applied");
        await bot.answerCallbackQuery(query.id, { text: "Marked as applied" });
        if (chatId && msgId) {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: msgId },
          );
        }
        // Generate cover letter
        try {
          const letter = await generateCoverLetterForJobId(
            String(data.job_id),
            chatId,
          );
          await saveCoverLetter({
            job_id: String(data.job_id),
            job_title:
              query.message?.text?.match(
                /<b>💼 Job Title:<\/b> ([^\n]+)/,
              )?.[1] || "",
            content: letter,
          });
          if (chatId) {
            await bot.sendMessage(
              chatId,
              "<b>Cover Letter Draft</b>\n\n" + escapeHtml(letter),
              { parse_mode: "HTML" },
            );
          }
          // Apply via Afriwork API (API-only)
          try {
            const username = query.from?.username || undefined;
            await applyViaApi({
              jobId: String(data.job_id),
              coverLetter: letter,
              telegramUsername: username,
            });
            if (chatId) {
              await bot.sendMessage(
                chatId,
                "✅ Application submitted via API.",
              );
              // Tag the original job message as APPLIED
              if (msgId) {
                const original = query.message?.text || "";
                const header = "<b>✅ APPLIED</b>\n\n";
                const alreadyTagged = /^<b>✅ APPLIED<\/b>/.test(original);
                const newText = alreadyTagged ? original : header + original;
                await bot.editMessageText(newText, {
                  chat_id: chatId,
                  message_id: msgId,
                  parse_mode: "HTML",
                  reply_markup: { inline_keyboard: [] },
                });
              }
            }
          } catch (autoErr) {
            if (chatId)
              await bot.sendMessage(
                chatId,
                "⚠️ Auto-apply error: " + (autoErr?.message || String(autoErr)),
              );
          }
        } catch (e) {
          if (chatId)
            await bot.sendMessage(
              chatId,
              "Failed to generate cover letter. " + e.message,
            );
        }
      }
    } catch (e) {
      // Fallback: acknowledge to avoid Telegram retry storm
      if (query?.id)
        await bot
          .answerCallbackQuery(query.id, { text: "Action failed" })
          .catch(() => {});
      console.error("callback_query error", e);
    }
  });

  // Experience management
  bot.onText(/^\/exp\s+set\s+([\s\S]+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const text = (match?.[1] || "").trim();
    if (!text)
      return bot.sendMessage(chatId, "Format: /exp set <your experience text>");
    try {
      await setUserExperience(chatId, text);
      await bot.sendMessage(chatId, "Saved your experience summary.");
    } catch (e) {
      await bot.sendMessage(chatId, "Failed to save experience: " + e.message);
    }
  });

  bot.onText(/^\/exp\s+clear$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await clearUserExperience(chatId);
      await bot.sendMessage(chatId, "Cleared your saved experience.");
    } catch (e) {
      await bot.sendMessage(chatId, "Failed to clear experience: " + e.message);
    }
  });

  bot.onText(/^\/exp\s+help$/i, async (msg) => {
    const chatId = msg.chat.id;
    const help = [
      "<b>Experience commands</b>",
      "/exp - show currently saved experience",
      "/exp set &lt;text&gt; - save/update your experience summary",
      "/exp clear - remove saved experience",
      "",
      "Example:",
      "/exp set 5+ years as Planning Engineer using Primavera P6; led schedules for multi-site projects.",
    ].join("\n");
    await bot.sendMessage(chatId, help, { parse_mode: "HTML" });
  });

  bot.onText(/^\/exp$/i, async (msg) => {
    const chatId = msg.chat.id;
    const profile = await getUserProfile(chatId);
    if (profile?.experience_text) {
      await bot.sendMessage(
        chatId,
        "<b>Saved experience</b>\n\n<pre>" +
          escapeHtml(profile.experience_text) +
          "</pre>",
        { parse_mode: "HTML" },
      );
    } else {
      await bot.sendMessage(
        chatId,
        "No experience saved. Use /exp set <text> to add one.",
      );
    }
  });

  // Manual refetch / job search command
  bot.onText(/^\/(?:refetch|searchjobs|scan)\b(?:\s+now)?$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(chatId, "🔎 Starting manual job search...");
      const mod = await import("../../services/jobPollingLoop.js");
      if (!mod?.pollOnce) {
        await bot.sendMessage(chatId, "Manual search is not available.");
        return;
      }
      const result = await mod.pollOnce();
      await bot.sendMessage(
        chatId,
        `✅ Manual search complete. Fetched ${result.total}, New ${result.newCount}, Matches ${result.matches}`,
      );
    } catch (e) {
      await bot.sendMessage(
        chatId,
        "Manual search failed: " + (e?.message || String(e)),
      );
    }
  });

  // Suppress noisy 409 conflict logs (other instance polling). Still visible in library logs, but we avoid double-printing.
  bot.on("polling_error", (err) => {
    const msg = String(err?.message || err || "");
    if (msg.includes("409 Conflict")) return;
    console.error("polling_error", err);
  });
}