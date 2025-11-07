import fs from 'fs/promises';
import path from 'path';

import { SupportedMaterialKind } from '../domain/material/materialKind';
import { MammothPdfTextExtractor } from '../infrastructure/text/mammothPdfTextExtractor.adapter';

function analyzeTextQuality(text: string): {
  charCount: number;
  wordCount: number;
  garbageRatio: number;
  repetitionRatio: number;
  estimatedTokens: number;
} {
  const charCount = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const garbageMatches = text.match(/[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?:;'"()-]/g);
  const garbageRatio = charCount > 0 ? (garbageMatches?.length ?? 0) / charCount : 0;

  const wordFreq = new Map<string, number>();
  for (const w of words) {
    const key = w.toLowerCase();
    wordFreq.set(key, (wordFreq.get(key) ?? 0) + 1);
  }
  let repeatedWords = 0;
  for (const c of wordFreq.values()) {
    if (c > 1) {
      repeatedWords += c - 1;
    }
  }
  const repetitionRatio = wordCount > 0 ? repeatedWords / wordCount : 0;

  const estimatedTokens = Math.ceil(charCount / 2.5);

  return { charCount, wordCount, garbageRatio, repetitionRatio, estimatedTokens };
}

async function main(): Promise<void> {
  const files = [
    'Biochemie svalu-text.pdf',
    'pred_Enterobakterie_a_anaeroby_e4d284e6c1b62706a1867fdadcb67fd4.pdf',
    'pred_meningokoky_lzicarova_cz_2026_a7de637e17190a2f94881663b62a4d61.pdf',
    'pred_Nefermentující_tyčinky,_Campylobacter,_Helicobacter_CZ_Melter.pdf',
  ];

  const extractor = new MammothPdfTextExtractor();

  for (const file of files) {
    const fullPath = path.join(process.cwd(), file);
    try {
      const buffer = await fs.readFile(fullPath);
      console.log(`\n======================================`);
      console.log(`📄 Analyzing: ${file}`);
      console.log(`======================================`);
      console.log(`File size: ${(buffer.length / 1024).toFixed(2)} KB`);

      const extractedText = await extractor.extractText({ filePath: fullPath, kind: SupportedMaterialKind.PDF });

      const metrics = analyzeTextQuality(extractedText);

      console.log(`Total chars: ${metrics.charCount}`);
      console.log(`Total words: ${metrics.wordCount}`);
      console.log(`Garbage ratio: ${(metrics.garbageRatio * 100).toFixed(2)}%`);
      console.log(`Repetition ratio: ${(metrics.repetitionRatio * 100).toFixed(2)}%`);
      console.log(`--------------------------------------`);
      console.log(`➡️ Estimated Tokens: ${metrics.estimatedTokens}`);

      const isTooLarge = metrics.estimatedTokens > 15000;
      console.log(`✅ Passes 15,000 token limit: ${!isTooLarge ? 'YES' : 'NO ❌'}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
}

main().catch(console.error);
