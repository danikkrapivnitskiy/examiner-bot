import type { SupportedMaterialKind } from '../../domain/material/materialKind';

export interface ITextExtractor {
  extractText(params: { filePath: string; kind: SupportedMaterialKind }): Promise<string>;
}
