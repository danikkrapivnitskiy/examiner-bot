import { injectable } from 'tsyringe';
import mammoth from 'mammoth';
import pdfParserModule from 'pdf2json';
import { promises as fs } from 'node:fs';

import { SupportedMaterialKind } from '../../domain/material/materialKind';
import type { ITextExtractor } from '../../application/ports/textExtractor.port';

function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new pdfParserModule(null, true);

    const tearDown = (): void => {
      try {
        pdfParser.destroy();
      } catch {
        // ignore teardown errors
      }
    };

    pdfParser.once('pdfParser_dataError', (errData: unknown) => {
      let err: Error;
      if (errData instanceof Error) {
        err = errData;
      } else if (typeof errData === 'object' && errData !== null && 'parserError' in errData) {
        err = (errData as { parserError: Error }).parserError;
      } else {
        err = new Error(String(errData));
      }
      tearDown();
      reject(err);
    });

    pdfParser.once('pdfParser_dataReady', () => {
      try {
        resolve(pdfParser.getRawTextContent() ?? '');
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        tearDown();
      }
    });

    // verbosity 0 silences pdf.js / pdf2json console noise (see PDFParser.parseBuffer)
    pdfParser.parseBuffer(buffer, 0);
  });
}

@injectable()
export class MammothPdfTextExtractor implements ITextExtractor {
  async extractText(params: { filePath: string; kind: SupportedMaterialKind }): Promise<string> {
    const { filePath, kind } = params;

    if (kind === SupportedMaterialKind.PDF) {
      const buffer = await fs.readFile(filePath);
      return extractPdfTextFromBuffer(buffer);
    }

    if (kind === SupportedMaterialKind.DOCX) {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value ?? '';
    }

    const buffer = await fs.readFile(filePath);
    return buffer.toString('utf8');
  }
}
