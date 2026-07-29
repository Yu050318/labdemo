const DEFAULT_NEXT_PATH = "/";

/**
 * Keeps Auth callback redirects on this origin.
 */
export function sanitizeNextPath(value: string | null): string {
  if (
    value === null ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return DEFAULT_NEXT_PATH;
  }

  return value;
}
