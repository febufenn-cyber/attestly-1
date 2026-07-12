import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
  calculateManifestQuality,
  detectContentWarnings,
  normalizeEvidenceText,
  sha256Hex,
  stableNodeId,
  type DocumentNode,
  type ExtractionManifest,
  type ExtractionWarning,
} from '../../../packages/evidence/src/index';

export interface ExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  sourceSha256: string;
  scanStatus: ExtractionManifest['scanStatus'];
  startedAt: string;
}

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  trimValues: false,
  processEntities: false,
  stopNodes: ['*.script'],
} as const;

function textFromXmlOrdered(value: unknown): string {
  if (Array.isArray(value)) return value.map(textFromXmlOrdered).join('');
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const record = value as Record<string, unknown>;
  if (typeof record['#text'] === 'string') return record['#text'];
  return Object.entries(record)
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, child]) => textFromXmlOrdered(child))
    .join('');
}

function statistics(nodes: DocumentNode[]) {
  return {
    textCharacters: nodes.reduce((sum, node) => sum + node.text.length, 0),
    nonEmptyNodes: nodes.filter((node) => normalizeEvidenceText(node.text).length > 0).length,
    tableCount: nodes.filter((node) => node.type === 'table').length,
    figureCount: nodes.filter((node) => node.type === 'figure').length,
    ocrNodeCount: nodes.filter((node) => node.extractionMethod === 'ocr').length,
  };
}

function buildManifest(
  input: ExtractionInput,
  nodes: DocumentNode[],
  warnings: ExtractionWarning[],
  extra: Pick<ExtractionManifest, 'documentTitle' | 'pageCount' | 'sheetCount'>,
): ExtractionManifest {
  const contentWarnings = detectContentWarnings(nodes);
  const allWarnings = [...warnings, ...contentWarnings];
  const expectedUnits = extra.pageCount ?? extra.sheetCount;
  return {
    schemaVersion: 1,
    sourceSha256: input.sourceSha256,
    sourceMimeType: input.mimeType,
    sourceFileName: input.fileName,
    extractorName: 'attestly-canonical-extractor',
    extractorVersion: '1.0.0',
    normalizationRulesetVersion: 'phase3-v1',
    scanStatus: input.scanStatus,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    ...extra,
    nodes,
    warnings: allWarnings,
    quality: calculateManifestQuality(nodes, allWarnings, expectedUnits),
    statistics: statistics(nodes),
  };
}

function textNode(
  id: string,
  displayOrder: number,
  text: string,
  overrides: Partial<DocumentNode> = {},
): DocumentNode {
  return {
    id,
    parentId: null,
    type: 'paragraph',
    displayOrder,
    text,
    normalizedText: normalizeEvidenceText(text),
    pageNumber: null,
    sheetName: null,
    cellRange: null,
    headingPath: [],
    paragraphIndex: null,
    characterStart: null,
    characterEnd: null,
    boundingBox: null,
    extractionMethod: 'native_text',
    extractionConfidence: 0.99,
    flags: [],
    metadata: {},
    ...overrides,
  };
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

async function extractTextOrCsv(input: ExtractionInput): Promise<ExtractionManifest> {
  const decoded = new TextDecoder('utf-8', { fatal: false })
    .decode(input.bytes)
    .replace(/^\uFEFF/, '');
  const isCsv =
    ['text/csv', 'application/csv'].includes(input.mimeType.toLowerCase()) ||
    input.fileName.toLowerCase().endsWith('.csv');
  const nodes: DocumentNode[] = [];
  const warnings: ExtractionWarning[] = [];

  if (!isCsv) {
    const paragraphs = decoded
      .split(/\n\s*\n/g)
      .map((part) => part.trim())
      .filter(Boolean);
    let offset = 0;
    for (let index = 0; index < paragraphs.length; index += 1) {
      const paragraph = paragraphs[index];
      const start = decoded.indexOf(paragraph, offset);
      offset = Math.max(offset, start + paragraph.length);
      nodes.push(
        textNode(stableNodeId('txt', index, paragraph.slice(0, 40)), index, paragraph, {
          paragraphIndex: index,
          characterStart: start >= 0 ? start : null,
          characterEnd: start >= 0 ? start + paragraph.length : null,
        }),
      );
    }
  } else {
    const lines = decoded.split(/\r?\n/).filter((line) => line.length > 0);
    const delimiter =
      (lines[0]?.split('\t').length ?? 0) > (lines[0]?.split(',').length ?? 0) ? '\t' : ',';
    const headers = parseDelimitedLine(lines[0] ?? '', delimiter).map(
      (header, index) => normalizeEvidenceText(header) || `Column ${index + 1}`,
    );
    nodes.push(
      textNode('csv-sheet', 0, input.fileName, {
        type: 'sheet',
        sheetName: input.fileName,
        extractionMethod: 'spreadsheet_cell',
      }),
    );
    let order = 1;
    for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
      const cells = parseDelimitedLine(lines[rowIndex], delimiter);
      for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
        const value = cells[columnIndex] ?? '';
        if (!normalizeEvidenceText(value)) continue;
        const cell = `${columnIndex + 1}:${rowIndex + 1}`;
        nodes.push(
          textNode(
            stableNodeId('csv', rowIndex, columnIndex, value.slice(0, 30)),
            order++,
            `${headers[columnIndex] ?? `Column ${columnIndex + 1}`}: ${value}`,
            {
              parentId: 'csv-sheet',
              type: 'cell',
              sheetName: input.fileName,
              cellRange: cell,
              extractionMethod: 'spreadsheet_cell',
              metadata: {
                row: rowIndex + 1,
                column: columnIndex + 1,
                header: headers[columnIndex] ?? null,
              },
            },
          ),
        );
      }
    }
  }

  if (nodes.length === 0) {
    warnings.push({
      code: 'empty_text_document',
      severity: 'critical',
      message: 'No extractable text was found.',
      nodeId: null,
      pageNumber: null,
      sheetName: null,
      metadata: {},
    });
  }
  return buildManifest(input, nodes, warnings, {
    documentTitle: input.fileName,
    pageCount: null,
    sheetCount: isCsv ? 1 : null,
  });
}

async function extractPdf(input: ExtractionInput): Promise<ExtractionManifest> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: input.bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const nodes: DocumentNode[] = [];
  const warnings: ExtractionWarning[] = [];
  let order = 0;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter(
        (item): item is typeof item & {
          str: string;
          transform: number[];
          width: number;
          height: number;
        } => 'str' in item && typeof item.str === 'string',
      )
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }))
      .filter((item) => normalizeEvidenceText(item.text).length > 0)
      .sort((left, right) =>
        Math.abs(right.y - left.y) > 3 ? right.y - left.y : left.x - right.x,
      );

    const pageId = `pdf-page-${pageNumber}`;
    nodes.push(
      textNode(pageId, order++, `Page ${pageNumber}`, {
        type: 'page',
        pageNumber,
        extractionConfidence: items.length > 0 ? 1 : 0,
        metadata: { width: viewport.width, height: viewport.height },
      }),
    );

    const lines: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
    for (const item of items) {
      const previous = lines.at(-1);
      if (previous && Math.abs(previous.y - item.y) <= 3) {
        previous.text = `${previous.text} ${item.text}`.trim();
        previous.width = Math.max(previous.width, item.x + item.width - previous.x);
        previous.height = Math.max(previous.height, item.height);
      } else {
        lines.push({ ...item });
      }
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      nodes.push(
        textNode(
          stableNodeId('pdf', pageNumber, lineIndex, line.text.slice(0, 40)),
          order++,
          line.text,
          {
            parentId: pageId,
            pageNumber,
            paragraphIndex: lineIndex,
            boundingBox: {
              x: line.x,
              y: viewport.height - line.y,
              width: line.width,
              height: line.height,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
            },
            extractionConfidence: 0.92,
          },
        ),
      );
    }

    const visibleCharacters = lines.reduce((sum, line) => sum + line.text.length, 0);
    if (visibleCharacters < 30) {
      warnings.push({
        code: 'pdf_page_ocr_required',
        severity: 'critical',
        message:
          'This page has insufficient native text and requires OCR or visual review before evidence approval.',
        nodeId: pageId,
        pageNumber,
        sheetName: null,
        metadata: { visibleCharacters },
      });
    }
  }

  return buildManifest(input, nodes, warnings, {
    documentTitle: input.fileName,
    pageCount: document.numPages,
    sheetCount: null,
  });
}

function xmlName(node: Record<string, unknown>): string | null {
  const key = Object.keys(node).find(
    (candidate) => !candidate.startsWith('@_') && candidate !== '#text',
  );
  return key ? (key.includes(':') ? key.split(':').at(-1)! : key) : null;
}

function orderedWordParagraphs(
  parsed: unknown,
): Array<{ text: string; type: 'paragraph' | 'heading' | 'table_cell'; flags: string[] }> {
  const result: Array<{
    text: string;
    type: 'paragraph' | 'heading' | 'table_cell';
    flags: string[];
  }> = [];
  const walk = (
    node: unknown,
    context: { inCell: boolean; deleted: boolean; inserted: boolean; hidden: boolean },
  ) => {
    if (!Array.isArray(node)) return;
    for (const item of node) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const name = xmlName(record);
      const childKey = name
        ? Object.keys(record).find(
            (key) => (key.includes(':') ? key.split(':').at(-1) : key) === name,
          )
        : undefined;
      const child = childKey ? record[childKey] : null;
      if (name === 'p') {
        const text = normalizeEvidenceText(textFromXmlOrdered(child));
        if (text) {
          const styleText = JSON.stringify(child);
          const heading = /Heading[1-9]|Title|Subtitle/i.test(styleText);
          result.push({
            text,
            type: context.inCell ? 'table_cell' : heading ? 'heading' : 'paragraph',
            flags: [
              context.deleted ? 'tracked_deletion' : '',
              context.inserted ? 'tracked_insertion' : '',
              context.hidden ? 'hidden_text' : '',
            ].filter(Boolean),
          });
        }
      } else {
        walk(child, {
          inCell: context.inCell || name === 'tc',
          deleted: context.deleted || name === 'del',
          inserted: context.inserted || name === 'ins',
          hidden: context.hidden || name === 'vanish',
        });
      }
    }
  };
  walk(parsed, { inCell: false, deleted: false, inserted: false, hidden: false });
  return result;
}

async function extractDocx(input: ExtractionInput): Promise<ExtractionManifest> {
  const zip = await JSZip.loadAsync(input.bytes, { checkCRC32: true, createFolders: false });
  const entryNames = Object.keys(zip.files);
  if (entryNames.length > 10_000) throw new Error('docx_archive_entry_limit');
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) throw new Error('docx_document_xml_missing');
  const xml = await documentEntry.async('string');
  if (xml.length > 30_000_000) throw new Error('docx_xml_size_limit');
  const parser = new XMLParser(XML_OPTIONS);
  const parsed = parser.parse(xml);
  const paragraphs = orderedWordParagraphs(parsed);
  const nodes: DocumentNode[] = [];
  const warnings: ExtractionWarning[] = [];
  let order = 0;
  let headingPath: string[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (paragraph.type === 'heading') headingPath = [paragraph.text];
    const id = stableNodeId('docx', index, paragraph.text.slice(0, 50));
    nodes.push(
      textNode(id, order++, paragraph.text, {
        type: paragraph.type,
        paragraphIndex: index,
        headingPath: paragraph.type === 'heading' ? [] : headingPath,
        extractionMethod: 'structured_ooxml',
        extractionConfidence: paragraph.flags.length > 0 ? 0.72 : 0.96,
        flags: paragraph.flags,
      }),
    );
    if (paragraph.flags.includes('tracked_deletion')) {
      warnings.push({
        code: 'docx_tracked_deletion',
        severity: 'warning',
        message:
          'Tracked deleted text was preserved as flagged content and must not be treated as current evidence automatically.',
        nodeId: id,
        pageNumber: null,
        sheetName: null,
        metadata: {},
      });
    }
    if (paragraph.flags.includes('hidden_text')) {
      warnings.push({
        code: 'docx_hidden_text',
        severity: 'warning',
        message: 'Hidden text was preserved as flagged untrusted content.',
        nodeId: id,
        pageNumber: null,
        sheetName: null,
        metadata: {},
      });
    }
  }

  const relationshipEntry = zip.file('word/_rels/document.xml.rels');
  if (relationshipEntry) {
    const relationships = await relationshipEntry.async('string');
    const externalCount = (relationships.match(/TargetMode="External"/g) ?? []).length;
    if (externalCount > 0) {
      warnings.push({
        code: 'docx_external_relationships',
        severity: 'warning',
        message: 'The DOCX contains external relationships. They were not followed or executed.',
        nodeId: null,
        pageNumber: null,
        sheetName: null,
        metadata: { externalCount },
      });
    }
  }
  const macroEntries = entryNames.filter((name) => /vbaProject|macros?/i.test(name));
  if (macroEntries.length > 0) {
    warnings.push({
      code: 'docx_active_content',
      severity: 'critical',
      message:
        'The package contains active-content entries and cannot be approved without security review.',
      nodeId: null,
      pageNumber: null,
      sheetName: null,
      metadata: { count: macroEntries.length },
    });
  }

  return buildManifest(input, nodes, warnings, {
    documentTitle: input.fileName,
    pageCount: null,
    sheetCount: null,
  });
}

async function extractXlsx(input: ExtractionInput): Promise<ExtractionManifest> {
  const workbook = new ExcelJS.Workbook();
  const buffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  );
  await workbook.xlsx.load(buffer);
  const nodes: DocumentNode[] = [];
  const warnings: ExtractionWarning[] = [];
  let order = 0;

  for (const worksheet of workbook.worksheets) {
    const sheetId = stableNodeId('sheet', worksheet.id, worksheet.name);
    nodes.push(
      textNode(sheetId, order++, worksheet.name, {
        type: 'sheet',
        sheetName: worksheet.name,
        extractionMethod: 'spreadsheet_cell',
        extractionConfidence: 1,
        flags: worksheet.state !== 'visible' ? ['hidden_sheet'] : [],
        metadata: {
          state: worksheet.state,
          rowCount: worksheet.rowCount,
          columnCount: worksheet.columnCount,
        },
      }),
    );
    if (worksheet.state !== 'visible') {
      warnings.push({
        code: 'xlsx_hidden_sheet',
        severity: 'warning',
        message: 'A hidden sheet was preserved and must not silently influence evidence retrieval.',
        nodeId: sheetId,
        pageNumber: null,
        sheetName: worksheet.name,
        metadata: { state: worksheet.state },
      });
    }
    if (worksheet.rowCount > 100_000 || worksheet.columnCount > 2_000) {
      throw new Error('xlsx_dimension_limit');
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowHidden = row.hidden === true;
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const address = cell.address;
        const formula =
          typeof cell.value === 'object' && cell.value && 'formula' in cell.value
            ? String(cell.value.formula)
            : null;
        const result =
          typeof cell.value === 'object' && cell.value && 'result' in cell.value
            ? cell.value.result
            : null;
        const visible =
          cell.text ??
          (result === null || result === undefined ? String(cell.value ?? '') : String(result));
        if (!normalizeEvidenceText(visible) && !formula) return;
        const column = worksheet.getColumn(columnNumber);
        const hidden = rowHidden || column.hidden === true;
        const id = stableNodeId(
          'xlsx',
          worksheet.name,
          address,
          visible.slice(0, 30),
          formula,
        );
        nodes.push(
          textNode(id, order++, visible || `[Formula: ${formula}]`, {
            parentId: sheetId,
            type: 'cell',
            sheetName: worksheet.name,
            cellRange: address,
            extractionMethod: 'spreadsheet_cell',
            extractionConfidence: formula ? 0.78 : 0.98,
            flags: [
              hidden ? 'hidden_cell' : '',
              formula ? 'formula_present' : '',
              cell.note ? 'comment_present' : '',
            ].filter(Boolean),
            metadata: {
              row: rowNumber,
              column: columnNumber,
              formula,
              cachedResult: result,
              numberFormat: cell.numFmt,
              note: cell.note ? '[present]' : null,
            },
          }),
        );
        if (formula) {
          warnings.push({
            code: 'xlsx_formula_preserved_not_executed',
            severity: 'info',
            message:
              'A formula expression was preserved as untrusted metadata and was not executed by Attestly.',
            nodeId: id,
            pageNumber: null,
            sheetName: worksheet.name,
            metadata: { address },
          });
        }
        if (hidden) {
          warnings.push({
            code: 'xlsx_hidden_content',
            severity: 'warning',
            message: 'Hidden spreadsheet content was preserved as flagged data.',
            nodeId: id,
            pageNumber: null,
            sheetName: worksheet.name,
            metadata: { address },
          });
        }
      });
    });
  }

  return buildManifest(input, nodes, warnings, {
    documentTitle: input.fileName,
    pageCount: null,
    sheetCount: workbook.worksheets.length,
  });
}

export async function extractDocument(input: ExtractionInput): Promise<ExtractionManifest> {
  const actualHash = await sha256Hex(input.bytes);
  if (actualHash !== input.sourceSha256) throw new Error('source_hash_mismatch');
  const normalizedMime = input.mimeType.toLowerCase().split(';')[0].trim();
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error('source_size_limit');
  }

  if (normalizedMime === 'application/pdf') return extractPdf(input);
  if (
    normalizedMime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(input);
  }
  if (
    normalizedMime ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return extractXlsx(input);
  }
  if (['text/plain', 'text/csv', 'application/csv'].includes(normalizedMime)) {
    return extractTextOrCsv(input);
  }
  throw new Error(`unsupported_mime_type:${normalizedMime}`);
}
