import './config/loadEnv.js';
import { jobPollingLoop } from './services/jobPollingLoop.js';

// Entry point
(async () => {
  await jobPollingLoop();
})();
