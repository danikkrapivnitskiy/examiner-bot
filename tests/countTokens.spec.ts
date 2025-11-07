import 'reflect-metadata';
import { describe, it } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { SupportedMaterialKind } from '../src/domain/material/materialKind';
import { MammothPdfTextExtractor } from '../src/infrastructure/text/mammothPdfTextExtractor.adapter';

describe('Token metrics test', () => {
  it('should print token metrics without failing for PDF files', async () => {
    const dataDir = path.join(__dirname, 'data');
    let files: string[];
    
    try {
      files = await fs.readdir(dataDir);
    } catch {
      console.warn('No data directory found, skipping token metrics');
      return;
    }

    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      console.warn('No PDF files found in tests/data/');
      return;
    }

    const extractor = new MammothPdfTextExtractor();

    console.log('============== PDF TOKEN METRICS TEST ==============\n');

    for (const file of pdfFiles) {
      const filePath = path.join(dataDir, file);
      const stats = await fs.stat(filePath);
      const fileSizeKb = (stats.size / 1024).toFixed(1);

      try {
        const startTime = Date.now();
        const rawText = await extractor.extractText({ filePath, kind: SupportedMaterialKind.PDF });
        const extractTimeMs = Date.now() - startTime;

        const cleanText = rawText;

        const charCount = cleanText.length;
        
        // Эвристика: ~2.5 символа на токен в среднем (смесь кириллицы/латиницы/спецсимволов)
        const estimatedTokens = Math.ceil(charCount / 2.5);

        // Подсчет "мусора"
        const garbageMatches = cleanText.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?:;'"()\-]/g);
        const garbageCount = garbageMatches ? garbageMatches.length : 0;
        const garbageRatio = charCount > 0 ? (garbageCount / charCount) * 100 : 0;

        console.log(`📄 File: ${file}`);
        console.log(`   - Size: ${fileSizeKb} KB`);
        console.log(`   - Extraction time: ${extractTimeMs} ms`);
        console.log(`   - Total Chars (Clean): ${charCount}`);
        console.log(`   - Garbage Ratio: ${garbageRatio.toFixed(2)}%`);
        console.log(`   👉 Estimated Tokens: ~${estimatedTokens}`);
        console.log(`----------------------------------------------------\n`);

      } catch (err) {
        console.error(`❌ Failed to process ${file}:`, err);
      }
    }
  }, 60000); // 60 seconds

  it('should print token metrics without failing for DOCX files', async () => {
    const dataDir = path.join(__dirname, 'data');
    let files: string[];
    
    try {
      files = await fs.readdir(dataDir);
    } catch {
      console.warn('No data directory found, skipping token metrics');
      return;
    }

    const docxFiles = files.filter(f => f.endsWith('.docx'));

    if (docxFiles.length === 0) {
      console.warn('No DOCX files found in tests/data/');
      return;
    }

    const extractor = new MammothPdfTextExtractor();

    console.log('============== DOCX TOKEN METRICS TEST ==============\n');

    for (const file of docxFiles) {
      const filePath = path.join(dataDir, file);
      const stats = await fs.stat(filePath);
      const fileSizeKb = (stats.size / 1024).toFixed(1);

      try {
        const startTime = Date.now();
        const rawText = await extractor.extractText({ filePath, kind: SupportedMaterialKind.DOCX });
        const extractTimeMs = Date.now() - startTime;

        const cleanText = rawText;

        const charCount = cleanText.length;
        
        // Эвристика: ~2.5 символа на токен в среднем (смесь кириллицы/латиницы/спецсимволов)
        const estimatedTokens = Math.ceil(charCount / 2.5);

        // Подсчет "мусора"
        const garbageMatches = cleanText.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?:;'"()\-]/g);
        const garbageCount = garbageMatches ? garbageMatches.length : 0;
        const garbageRatio = charCount > 0 ? (garbageCount / charCount) * 100 : 0;

        console.log(`📄 File: ${file}`);
        console.log(`   - Size: ${fileSizeKb} KB`);
        console.log(`   - Extraction time: ${extractTimeMs} ms`);
        console.log(`   - Total Chars (Clean): ${charCount}`);
        console.log(`   - Garbage Ratio: ${garbageRatio.toFixed(2)}%`);
        console.log(`   👉 Estimated Tokens: ~${estimatedTokens}`);
        console.log(`----------------------------------------------------\n`);

      } catch (err) {
        console.error(`❌ Failed to process ${file}:`, err);
      }
    }
  }, 60000); // 60 seconds
});
