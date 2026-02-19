import { calculateScore } from '../src/core/scoring/scoreJob.js';

function assert(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    process.exitCode = 1;
  } else {
    console.log('PASS', name);
  }
}

(function testScoring() {
  const job = { title: 'Senior Fullstack Engineer', description: 'Looking for React and GraphQL expert', city: { name: 'Berlin', country: { name: 'Germany' } }, experience_level: 'expert', sectors: [], entity: { name: 'TechCorp' } };
  const prefs = { roles: { fullstack: 4 }, skills: { react: 2, graphql: 4 }, locations: { berlin: 3 }, experience: { expert: 5 } };
  const score = calculateScore(job, prefs);
  assert('Score should be >= expected', score >= 4 + 2 + 4 + 3 + 5);
})();
