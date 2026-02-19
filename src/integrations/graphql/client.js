import fetch from 'cross-fetch';
import { GRAPHQL_ENDPOINT, HASURA_ANON_ROLE, PAGE_SIZE } from '../../config/constants.js';

const GET_ALL_JOBS = `query GetAllJobs($offset: Int!, $whereCondition: jobs_bool_exp!, $orderCondition: [jobs_order_by!]) {
  jobs(order_by: $orderCondition, offset: $offset, limit: ${PAGE_SIZE}, where: $whereCondition) {
    id
    title
    created_at
    published_at
    description
    job_type
    job_site
    skill_requirements { skill { name id } }
    city { name country { name } }
    sectors { sector { name id } }
    deadline
    compensation_amount_cents
    compensation_type
    compensation_currency
    experience_level
    entity { type name }
  }
}`;

export async function fetchJobs({ offset = 0, whereCondition = { _and: [{ approval_status: { _eq: 'PUBLISHED' } }] }, orderCondition = { published_at: 'desc' } }) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-role': HASURA_ANON_ROLE,
    },
    body: JSON.stringify({
      operationName: 'GetAllJobs',
      query: GET_ALL_JOBS,
      variables: { offset, whereCondition, orderCondition },
    }),
  });
  if (!res.ok) throw new Error(`GraphQL error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL returned errors: ' + JSON.stringify(json.errors));
  return json.data.jobs;
}

export async function fetchJobById(id) {
  const query = `query GetJobById($id: uuid!) {
    jobs(where: { id: { _eq: $id } }, limit: 1) {
      id
      title
      created_at
      published_at
      description
      job_type
      job_site
      skill_requirements { skill { name id } }
      city { name country { name } }
      sectors { sector { name id } }
      deadline
      compensation_type
      experience_level
      entity { type name }
    }
  }`;
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-role': HASURA_ANON_ROLE },
    body: JSON.stringify({ query, variables: { id } }),
  });
  if (!res.ok) throw new Error(`GraphQL error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL returned errors: ' + JSON.stringify(json.errors));
  const jobs = json.data.jobs || [];
  return jobs[0] || null;
}
