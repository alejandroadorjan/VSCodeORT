import { runDashboardMetricsTests } from './dashboardMetrics.test';
import { runGitHubClientTests } from './githubClient.test';
import { runFormattersTests } from './formatters.test';
import { runCardsTests } from './cards.test';
import { runGitHubClientExtraTests } from './githubClient.extra.test';

async function main() {
  try {
    await runGitHubClientTests();
    await runGitHubClientExtraTests();
    await runFormattersTests();
    await runCardsTests();
    await runDashboardMetricsTests();
    console.log('All unit tests passed');
    process.exit(0);
  } catch (err) {
    console.error('Unit tests failed:', err);
    process.exit(1);
  }
}

void main();
