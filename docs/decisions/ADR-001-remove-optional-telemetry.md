# ADR-001: Remove optional telemetry appenders (academic fork)

## Status
Accepted for academic use.

## Context
VS Code supports disabling telemetry via `telemetry.telemetryLevel`. However, concrete telemetry appenders and their npm dependencies are still loaded at runtime even when disabled. This fork studies the architectural impact of physically removing those modules.

## Decision
Keep `ITelemetryService` and all `publicLog` call sites intact. Register `NullTelemetryService` as the active implementation at all entry points. Delete concrete appender files once they have no remaining references.

## Alternatives considered
1. Only set `telemetry.telemetryLevel = off` at runtime — rejected, does not remove code or dependencies.
2. Delete all `publicLog` call sites — rejected, too invasive and likely to cause regressions.
3. Delete `ITelemetryService` entirely — rejected, breaks extension API.
4. Null Object Pattern (chosen) — preserves API, removes infrastructure.

## Positive consequences
- Fewer npm dependencies.
- No telemetry data leaves the machine under any runtime configuration.
- Clear architectural boundary between telemetry API and telemetry infrastructure.

## Negative consequences
- Usage metrics and A/B experiment infrastructure are disabled.
- Not suitable for upstream submission.

## Validation
- Project compiles with `npm run compile`.
- Zero grep matches for concrete appender references in `src/`.
- Test confirms active service is `TelemetryLevel.NONE`.
