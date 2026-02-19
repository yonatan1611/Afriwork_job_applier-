import fetch from 'cross-fetch';
import { GRAPHQL_ENDPOINT, AFRIWORK_BEARER_TOKEN, AFRIWORK_ORIGIN_PLATFORM_ID, HASURA_ANON_ROLE, AFRIWORK_PROFILE_ID } from '../config/constants.js';
import { AFRIWORK_LOGIN_EMAIL, AFRIWORK_LOGIN_PASSWORD } from '../config/constants.js';
let currentBearerToken = AFRIWORK_BEARER_TOKEN;
let currentJobSeekerId = null; // legacy, may be unused
let currentUserId = null; // logged-in users.id

const DEBUG_AUTH = /^(true|1|yes)$/i.test(process.env.AFRIWORK_DEBUG_AUTH || '');

function isAuthError(res, json) {
  const statusAuth = res?.status === 401 || res?.status === 403;
  const gqlAuth = json?.errors?.some(e =>
    e?.extensions?.code === 'access-denied' ||
    (typeof e?.message === 'string' && /Authentication hook unauthorized/i.test(e.message))
  );
  return Boolean(statusAuth || gqlAuth);
}

function safeTokenHint(token) {
  if (!token) return '(empty)';
  const prefix = String(token).slice(0, 10);
  return `${prefix}…(${String(token).length})`;
}

// Refreshes the bearer token using login mutation
export async function refreshBearerToken() {
  if (!AFRIWORK_LOGIN_EMAIL || !AFRIWORK_LOGIN_PASSWORD) {
    throw new Error('Missing AFRIWORK_LOGIN_EMAIL or AFRIWORK_LOGIN_PASSWORD environment variables');
  }
  const loginBody = {
    operationName: 'login',
    query: `mutation login($email: String!, $password: String!) {\n  login(user: {email_or_phone: $email, password: $password}) {\n    user_metadata {\n      id\n      pic\n      full_name\n      __typename\n    }\n    token\n    refresh_token\n    __typename\n  }\n}`,
    variables: {
      email: AFRIWORK_LOGIN_EMAIL,
      password: AFRIWORK_LOGIN_PASSWORD,
    },
  };
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hasura-role': HASURA_ANON_ROLE || 'anonymous',
    },
    body: JSON.stringify(loginBody),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Invalid login response: ' + text.slice(0, 500)); }
  if (!res.ok || json.errors) {
    throw new Error('Login error: ' + (json.errors ? JSON.stringify(json.errors) : `${res.status} ${res.statusText}`));
  }
  const token = json.data?.login?.token;
  if (!token) throw new Error('No token returned from login mutation');
  currentBearerToken = token;
  // capture user id from metadata (users.id)
  currentUserId = json.data?.login?.user_metadata?.id || currentUserId;
  return token;
}

// Mutation expects non-null profile_id (uuid!)
const APPLY_MUTATION = `mutation ApplyToJob($application: JobApplicationInput!, $job_id: uuid!, $origin_platform_id: uuid!, $telegramUserName: String, $profile_id: uuid!) {\n  apply_to_job(\n    application: $application\n    job_id: $job_id\n    origin_platform_id: $origin_platform_id\n    telegram_username: $telegramUserName\n    profile_id: $profile_id\n  ) {\n    application_id\n    __typename\n  }\n}`;

// Fetch default_profile_id for the logged-in user
async function getDefaultProfileIdForUser(userId) {
  if (!userId) return null;
  const body = {
    operationName: 'GetDefaultProfileId',
    // Keep this query minimal so it works even when other tables/fields are hidden
    // for the current role (Hasura will otherwise return "field ... not found in type: query_root").
    query: `query GetDefaultProfileId($userId: uuid!) {\n  jobSeeker: job_seekers(where: {user_id: {_eq: $userId}}, limit: 1) {\n    id\n    default_profile_id\n    __typename\n  }\n}`,
    variables: { userId },
  };

  // Some tokens do not allow the `user` role, but do allow `job_seeker`.
  // Try `job_seeker` first, then fall back to `user`. If either fails due to auth,
  // refresh the token once and retry.
  const rolesToTry = ['job_seeker', 'user'];
  let lastErr;

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const role of rolesToTry) {
      const res = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hasura-role': role,
          authorization: `Bearer ${currentBearerToken}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }

      if (DEBUG_AUTH) {
        console.log('[afriworkApiApplyService] profile lookup', {
          role,
          status: res.status,
          userId,
          token: safeTokenHint(currentBearerToken),
          hasErrors: Boolean(json?.errors),
        });
      }

      if (!res.ok || json?.errors) {
        lastErr = new Error('Profile lookup error: ' + (json?.errors ? JSON.stringify(json.errors) : `${res.status} ${res.statusText}`));
        // If auth error, try next role; if none work and we haven't refreshed yet, refresh and retry.
        if (isAuthError(res, json)) {
          continue;
        }
        // If the schema/role doesn't expose job_seekers, provide a more actionable message.
        const validationFailed = json?.errors?.some(e => e?.extensions?.code === 'validation-failed');
        const mentionsJobSeekers = json?.errors?.some(e => typeof e?.message === 'string' && /job_seekers/i.test(e.message));
        if (validationFailed && mentionsJobSeekers) {
          throw new Error(
            'Profile lookup error: your GraphQL role/schema does not expose job_seekers. ' +
            'Set AFRIWORK_PROFILE_ID in env to bypass lookup, or adjust role permissions. ' +
            'Original: ' + JSON.stringify(json.errors)
          );
        }
        throw lastErr;
      }
      const js = json?.data?.jobSeeker?.[0];
      return js?.default_profile_id || null;
    }
    await refreshBearerToken();
  }
  throw lastErr || new Error('Profile lookup error: unknown');
}

export async function applyViaApi({ jobId, coverLetter, telegramUsername }) {
  if (!currentBearerToken) {
    await refreshBearerToken();
  }
  if (!AFRIWORK_ORIGIN_PLATFORM_ID) {
    throw new Error('AFRIWORK_ORIGIN_PLATFORM_ID not set.');
  }
  // Ensure we have user id for profile lookup
  if (!currentUserId) {
    try { await refreshBearerToken(); } catch {}
  }
  let profileId = AFRIWORK_PROFILE_ID || null;
  if (!profileId) {
    profileId = await getDefaultProfileIdForUser(currentUserId);
  }
  if (!profileId) {
    throw new Error('No profile_id available. Set AFRIWORK_PROFILE_ID in env or ensure GetAllProfiles returns default_profile_id.');
  }

  const body = {
    operationName: 'ApplyToJob',
    query: APPLY_MUTATION,
    variables: {
      application: { cover_letter: coverLetter },
      job_id: jobId,
      origin_platform_id: AFRIWORK_ORIGIN_PLATFORM_ID,
      telegramUserName: telegramUsername,
      profile_id: profileId,
    },
  };

  let res, text, json;
  try {
    res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hasura-role': 'job_seeker',
        authorization: `Bearer ${currentBearerToken}`,
      },
      body: JSON.stringify(body),
    });
    text = await res.text();
    try { json = JSON.parse(text); } catch { json = undefined; }
    const hasErrors = !res.ok || (json && json.errors);
    if (hasErrors) {
      const statusAuth = res.status === 401 || res.status === 403;
      const gqlAuth = json?.errors?.some(e => (e.extensions?.code === 'access-denied' || (e.message && /Authentication hook unauthorized/i.test(e.message))));
      if (statusAuth || gqlAuth) {
        await refreshBearerToken();
        res = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hasura-role': 'job_seeker',
            authorization: `Bearer ${currentBearerToken}`,
          },
          body: JSON.stringify(body),
        });
        text = await res.text();
        try { json = JSON.parse(text); } catch { json = undefined; }
        if (!res.ok || (json && json.errors)) {
          throw new Error('Apply error after refresh: ' + (json?.errors ? JSON.stringify(json.errors) : `${res.status} ${res.statusText}`));
        }
      } else {
        throw new Error('Apply error: ' + (json?.errors ? JSON.stringify(json.errors) : `${res.status} ${res.statusText}`));
      }
    }
  } catch (err) {
    throw err;
  }
  return json.data.apply_to_job;
}
