export const ADAPTER_VERSION = '0.1.0'

/**
 * The RedDwarf @reddwarf/contracts package.json version this adapter
 * was vendored against. Bump when re-vendoring reddwarf-types.ts.
 */
export const ADAPTER_TARGET_CONTRACTS_VERSION = '0.1.0'

/**
 * Source commit of RedDwarf at vendoring time. Printed in telemetry
 * and persisted with every translation as `targetSchemaVersion`.
 */
export const ADAPTER_TARGET_COMMIT = '9648d893a55b5a310b913a09e011282ae25057b8'

export function targetSchemaVersion(): string {
  return `${ADAPTER_TARGET_CONTRACTS_VERSION}@${ADAPTER_TARGET_COMMIT.slice(0, 12)}`
}
