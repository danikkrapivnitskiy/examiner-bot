import 'reflect-metadata';
import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { SupportedMaterialKind } from '../src/domain/material/materialKind';
import { MammothPdfTextExtractor } from '../src/infrastructure/text/mammothPdfTextExtractor.adapter';

describe('DOCX Text Extraction', () => {
  const dataDir = path.join(__dirname, 'data');
  let extractor: MammothPdfTextExtractor;

  beforeAll(() => {
    extractor = new MammothPdfTextExtractor();
  });

  it('should extract text correctly for all DOCX files in data dir', async () => {
    let files: string[];
    try {
      files = await fs.readdir(dataDir);
    } catch (e) {
      console.warn('No data directory found, skipping test');
      return;
    }

    const docxFiles = files.filter(f => f.endsWith('.docx'));

    if (docxFiles.length === 0) {
      console.warn('No DOCX files found in data dir, skipping test');
      return;
    }

    for (const file of docxFiles) {
      const filePath = path.join(dataDir, file);
      
      const rawText = await extractor.extractText({ filePath, kind: SupportedMaterialKind.DOCX });
      
      expect(rawText).toBeDefined();
      expect(typeof rawText).toBe('string');
      expect(rawText.length).toBeGreaterThan(0);
    }
  }, 30000); // 30 seconds timeout for large DOCX files
});
