/**
 * Produces a single-segment filename safe for object storage keys (no path separators).
 */
export function sanitizeUploadFileName(originalName: string | undefined, fallbackUniqueId: string): string {
  const trimmed = originalName?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : `document-${fallbackUniqueId}`;
  const leaf = base.replace(/^.*[/\\]/u, '');
  const asciiSafe = leaf.replace(/[^\w.-]+/gu, '_').replace(/_{2,}/g, '_');
  const capped = asciiSafe.slice(0, 180);
  return capped.length > 0 ? capped : `document-${fallbackUniqueId}`;
}
