// ============================================================================
// Environment Utilities
// ============================================================================

export function getTenantId(): string {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    throw new Error('TENANT_ID environment variable is not set');
  }
  return tenantId;
}

export function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Invalid integer value for ${key}: '${value}'. Expected a number.`
    );
  }

  return parsed;
}
