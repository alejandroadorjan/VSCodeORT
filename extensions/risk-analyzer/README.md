# Git Risk Analyzer

A VS Code extension that checks your staged and unstaged changes and gives them a **risk score** (low / medium / high). It helps you catch risky changes before committing.

Four signals are analyzed:

| Signal | What it checks |
|---|---|
| S1 — Critical Path | Are you changing important files? |
| S2 — Change Surface | How many lines are you changing? |
| S3 — Fix History | Have these files been fixed a lot recently? |
| S4 — Test Coverage | Did you change source code without adding tests? |

## Extending

### 1. Add a new signal

Create a file in `src/signals/` that implements `IRiskSignal`:

```ts
import { IRiskSignal, SignalResult } from './signal.interface';
import { PRFile, RiskConfig } from '../types';

export class MySignal implements IRiskSignal {
  readonly id = 'S5';
  readonly description = 'What this signal checks';

  async compute(files: PRFile[], repoRoot: string, config: RiskConfig): Promise<SignalResult> {
    // your logic here
    return { score: 0, detail: 'Some info' };
  }
}
```

Then register it in `src/riskAnalyzer.ts` inside `createDefaultSignals()`:

```ts
import { MySignal } from './signals/mySignal.signal';

export function createDefaultSignals(): IRiskSignal[] {
  return [
    new PathScoreSignal(),
    new SurfaceScoreSignal(),
    new FixHistorySignal(),
    new TestCoverageSignal(),
    new MySignal(),        // <-- add it here
  ];
}
```

### 2. Add a non-git analyzer

Create a new class that implements `IRiskAnalyzer` and swap it in:

```ts
import { IRiskAnalyzer } from './riskAnalyzer';
import { RiskConfig, RiskResult } from './types';

export class LintAnalyzer implements IRiskAnalyzer {
  async analyze(repoRoot: string, config: RiskConfig): Promise<RiskResult> {
    // get data from a linter, CI, API, etc.
    // compute signals and return a RiskResult
  }
}
```

Then use it in your extension entry point instead of `analyzeRisk()`.
