import 'reflect-metadata';
import path from 'path';
import { promises as fs } from 'node:fs';
import { MammothPdfTextExtractor } from '../infrastructure/text/mammothPdfTextExtractor.adapter';
import { SupportedMaterialKind } from '../domain/material/materialKind';
import { MAX_DOCUMENT_ESTIMATED_TOKENS } from '../config/text.constants';
import { MaterialTooLargeTokensError, ScannedDocumentError } from '../domain/errors/material.errors';

async function run() {
  const filePath = path.join(
    __dirname,
    '../../tests/data/Hurych,_Šťíha_Lékařská_mikrobiologie_repetitorium_Triton_2020.pdf'
  );
  const extractor = new MammothPdfTextExtractor();

  console.log(`Analyzing file: ${filePath}`);
  console.log('Extracting text... (this may take a while for a 380MB file)');

  try {
    const startTime = Date.now();
    const text = await extractor.extractText({ filePath, kind: SupportedMaterialKind.PDF });
    const extractTimeMs = Date.now() - startTime;

    console.log(`Extraction complete in ${extractTimeMs}ms. Length: ${text.length} chars.`);

    const stats = await fs.stat(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);
    console.log(`File size: ${fileSizeMb.toFixed(2)} MB`);

    if (fileSizeMb > 5 && text.length < 10000) {
      throw new ScannedDocumentError();
    }

    const estimatedTokens = Math.ceil(text.length / 2.5);
    console.log(`Estimated tokens: ${estimatedTokens}`);
    console.log(`Limit: ${MAX_DOCUMENT_ESTIMATED_TOKENS}`);

    if (estimatedTokens > MAX_DOCUMENT_ESTIMATED_TOKENS) {
      throw new MaterialTooLargeTokensError(estimatedTokens, MAX_DOCUMENT_ESTIMATED_TOKENS);
    }

    console.log('File is within the limit and is not a scan.');
  } catch (error) {
    if (error instanceof ScannedDocumentError) {
      console.error('\n✅ SUCCESS: The logic correctly rejected the file as a scanned document!');
      console.error(`Error message: ${error.message}`);
    } else if (error instanceof MaterialTooLargeTokensError) {
      console.error('\n❌ FAILED: The logic rejected it for being too large instead of a scanned document!');
      console.error(`Error message: ${error.message}`);
    } else {
      console.error('\n❌ Unexpected error:', error);
    }
  }
}

run().catch(console.error);
