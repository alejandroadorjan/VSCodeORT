import { runDashboardMetricsTests } from './dashboardMetrics.test';
import { runGitHubClientTests } from './githubClient.test';

async function main() {
  try {
    await runGitHubClientTests();
    await runDashboardMetricsTests();
    console.log('All unit tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Unit tests failed:', err);
    process.exit(1);
  }
}

void main();
