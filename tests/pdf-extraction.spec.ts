import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { SupportedMaterialKind } from '../src/domain/material/materialKind';
import { MammothPdfTextExtractor } from '../src/infrastructure/text/mammothPdfTextExtractor.adapter';

describe('PDF Text Extraction', () => {
  const dataDir = path.join(__dirname, 'data');
  let extractor: MammothPdfTextExtractor;

  beforeAll(() => {
    extractor = new MammothPdfTextExtractor();
  });

  it('should extract text correctly for all PDF files in data dir', async () => {
    let files: string[];
    try {
      files = await fs.readdir(dataDir);
    } catch (e) {
      console.warn('No data directory found, skipping test');
      return;
    }

    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.warn('No PDF files found in data dir, skipping test');
      return;
    }

    for (const file of pdfFiles) {
      const filePath = path.join(dataDir, file);
      
      const rawText = await extractor.extractText({ filePath, kind: SupportedMaterialKind.PDF });
      
      expect(rawText).toBeDefined();
      expect(typeof rawText).toBe('string');
      expect(rawText.length).toBeGreaterThan(0);
    }
  }, 30000); // 30 seconds timeout for large PDFs
});
