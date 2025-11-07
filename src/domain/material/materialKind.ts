/** Material types accepted for exam source documents (aligned with {@link ITextExtractor}). */
export enum SupportedMaterialKind {
  PDF = 'pdf',
  DOCX = 'docx',
  TXT = 'txt',
}

function extensionOf(fileName: string | undefined): string | undefined {
  if (!fileName?.includes('.')) {
    return undefined;
  }
  return fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
}

export function detectMaterialKind(
  fileName: string | undefined,
  mimeType: string | undefined
): SupportedMaterialKind | undefined {
  const ext = extensionOf(fileName);
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return SupportedMaterialKind.PDF;
  }
  if (ext === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return SupportedMaterialKind.DOCX;
  }
  if (ext === 'txt' || mimeType === 'text/plain') {
    return SupportedMaterialKind.TXT;
  }
  return undefined;
}
