import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import {
  AnswerDestinationSchema,
  CompatibilityWarningSchema,
  QuestionnaireConditionSchema,
  QuestionnaireManifestSchema,
  QuestionnaireQuestionSchema,
  StructuralInventorySchema,
  classifyPackageDiff,
  decomposeCompoundQuestion,
  detectPolarity,
  determineCompatibility,
  escapeCsvFormula,
  normalizeQuestion,
  structuralFingerprint,
  type AnswerDestination,
  type CompatibilityWarning,
  type ExportOperation,
  type QuestionnaireCondition,
  type QuestionnaireFormat,
  type QuestionnaireManifest,
  type QuestionnaireQuestion,
  type SourceLocation,
  type StructuralInventory,
} from '../../../packages/questionnaire/src/index';

const PROCESSOR_NAME = 'attestly-questionnaire-processor';
const PROCESSOR_VERSION = 'phase4-v1';
const RULESET_VERSION = 'questionnaire-rules-v1';
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_WORKBOOK_CELLS = 250_000;

function hash(data: ArrayBuffer | Uint8Array | string): string {
  const input = typeof data === 'string' ? data : Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  return createHash('sha256').update(input).digest('hex');
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((item) => item.text).join('');
  if ('formula' in value) return value.result === undefined ? '' : String(value.result);
  if ('error' in value) return String(value.error);
  if ('hyperlink' in value) return value.text ?? value.hyperlink;
  return JSON.stringify(value);
}

function answerFormatFor(text: string, allowedValues: string[] = []) {
  const normalized = text.toLowerCase();
  if (/\b(yes|no|y\/n|true|false)\b/.test(normalized) || allowedValues.some((value) => /^(yes|no|y|n)$/i.test(value))) {
    return {
      valueType: 'boolean' as const,
      allowedValues,
      storedValues: {},
      requiresExplanation: /explain|describe|details?/i.test(text),
      requiresAttachment: /attach|evidence|document/i.test(text),
      multilineAllowed: true,
      blankAllowed: true,
      notApplicableAllowed: allowedValues.some((value) => /n\/?a/i.test(value)),
    };
  }
  if (/percentage|percent|%/.test(normalized)) {
    return {
      valueType: 'percentage' as const,
      allowedValues,
      storedValues: {},
      requiresExplanation: false,
      requiresAttachment: false,
      minimum: 0,
      maximum: 100,
      multilineAllowed: false,
      blankAllowed: true,
      notApplicableAllowed: false,
    };
  }
  if (/date|when|expiry/.test(normalized)) {
    return {
      valueType: 'date' as const,
      allowedValues,
      storedValues: {},
      requiresExplanation: false,
      requiresAttachment: false,
      multilineAllowed: false,
      blankAllowed: true,
      notApplicableAllowed: true,
    };
  }
  return {
    valueType: allowedValues.length ? ('single_choice' as const) : ('text' as const),
    allowedValues,
    storedValues: {},
    requiresExplanation: /explain|describe|details?|provide/i.test(text),
    requiresAttachment: /attach|evidence|document|certificate|report/i.test(text),
    multilineAllowed: true,
    blankAllowed: true,
    notApplicableAllowed: allowedValues.some((value) => /n\/?a/i.test(value)),
  };
}

function questionTypeFor(text: string, atomicCount: number, allowedValues: string[]) {
  const normalized = text.toLowerCase();
  if (atomicCount > 1) return 'compound' as const;
  if (/attach|upload|provide (?:a |the )?(?:document|report|certificate|policy)/i.test(text)) return 'attachment_request' as const;
  if (/percentage|percent|%/.test(normalized)) return 'percentage' as const;
  if (/date|when did|expiry/.test(normalized)) return 'date' as const;
  if (allowedValues.length > 2) return 'single_choice' as const;
  if (/\b(yes|no|y\/n|true|false)\b/.test(normalized) || /^(do|does|is|are|has|have|can)\b/.test(normalized)) {
    return /explain|describe|details?/i.test(text) ? ('boolean_with_explanation' as const) : ('boolean' as const);
  }
  if (/describe|provide|explain|specify|outline/i.test(text)) return 'free_text' as const;
  return 'unknown' as const;
}

function defaultConfidence(overrides: Partial<QuestionnaireQuestion['confidence']> = {}): QuestionnaireQuestion['confidence'] {
  return {
    questionBoundary: 0.82,
    questionType: 0.76,
    instructionSeparation: 0.78,
    answerDestination: 0.72,
    answerFormat: 0.7,
    conditionalRelationship: 0.45,
    compoundDecomposition: 0.65,
    sectionAssignment: 0.75,
    scopeInference: 0,
    exportSafety: 0.7,
    ...overrides,
  };
}

function columnLetter(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function normalizeColumnName(value: string): string {
  return normalizeQuestion(value).toLowerCase();
}

function headerScore(value: string, kind: 'question' | 'answer' | 'id' | 'guidance'): number {
  const normalized = normalizeColumnName(value);
  const patterns: Record<typeof kind, RegExp[]> = {
    question: [/question/, /requirement/, /control description/, /security control/, /assessment item/],
    answer: [/answer/, /response/, /vendor response/, /supplier response/, /implementation status/, /compliance status/],
    id: [/^id$/, /control id/, /question id/, /reference/, /control number/],
    guidance: [/guidance/, /instruction/, /description/, /clarification/, /notes?/],
  };
  return patterns[kind].reduce((score, pattern) => score + (pattern.test(normalized) ? 1 : 0), 0);
}

function detectHeaderRow(worksheet: ExcelJS.Worksheet): {
  row: number;
  questionColumn?: number;
  answerColumn?: number;
  idColumn?: number;
  guidanceColumn?: number;
} {
  let best = { row: 1, score: -1 } as { row: number; score: number; questionColumn?: number; answerColumn?: number; idColumn?: number; guidanceColumn?: number };
  const maximum = Math.min(worksheet.actualRowCount || worksheet.rowCount, 30);
  for (let rowNumber = 1; rowNumber <= maximum; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let score = 0;
    const candidate: typeof best = { row: rowNumber, score: 0 };
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const value = cellText(cell.value);
      const question = headerScore(value, 'question');
      const answer = headerScore(value, 'answer');
      const id = headerScore(value, 'id');
      const guidance = headerScore(value, 'guidance');
      if (question > 0 && !candidate.questionColumn) candidate.questionColumn = columnNumber;
      if (answer > 0 && !candidate.answerColumn) candidate.answerColumn = columnNumber;
      if (id > 0 && !candidate.idColumn) candidate.idColumn = columnNumber;
      if (guidance > 0 && !candidate.guidanceColumn) candidate.guidanceColumn = columnNumber;
      score += question * 3 + answer * 3 + id + guidance;
    });
    candidate.score = score;
    if (candidate.score > best.score) best = candidate;
  }
  return best;
}

function extractAllowedValues(cell: ExcelJS.Cell): string[] {
  const validation = cell.dataValidation;
  if (!validation || validation.type !== 'list' || !validation.formulae?.length) return [];
  const formula = String(validation.formulae[0] ?? '');
  if (/^".*"$/.test(formula)) {
    return formula.slice(1, -1).split(',').map((value) => value.trim()).filter(Boolean);
  }
  return [];
}

function inventoryWarnings(inventory: StructuralInventory): CompatibilityWarning[] {
  const warnings: CompatibilityWarning[] = [];
  if (inventory.macroPresent) {
    warnings.push({
      code: 'macro_present',
      severity: 'critical',
      message: 'The workbook contains VBA or macro-related package parts. Macros will never be executed.',
      recommendedAction: 'Use manual export or provide a macro-free XLSX copy.',
      exportBlocking: true,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: {},
    });
  }
  if (inventory.externalLinks.length) {
    warnings.push({
      code: 'external_links_present',
      severity: 'warning',
      message: `${inventory.externalLinks.length} external relationship part(s) were detected.`,
      recommendedAction: 'Review external dependencies before approving export.',
      exportBlocking: false,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: { parts: inventory.externalLinks },
    });
  }
  for (const [sheet, visibility] of Object.entries(inventory.sheetVisibility)) {
    if (visibility !== 'visible') {
      warnings.push({
        code: visibility === 'very_hidden' ? 'very_hidden_sheet_detected' : 'hidden_sheet_detected',
        severity: visibility === 'very_hidden' ? 'critical' : 'warning',
        message: `Sheet ${sheet} is ${visibility.replace('_', ' ')} and may contain mandatory content.`,
        recommendedAction: 'Review the hidden sheet and explicitly include or exclude its questions.',
        exportBlocking: visibility === 'very_hidden',
        sourceLocation: { format: 'xlsx', sheetName: sheet, sectionPath: [], neighbouringLabels: [] },
        affectedQuestionLocalIds: [],
        affectedDestinationLocalIds: [],
        metadata: {},
      });
    }
  }
  return warnings.map((warning) => CompatibilityWarningSchema.parse(warning));
}

async function packageHashes(zip: JSZip): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir).sort();
  for (const name of names) {
    const bytes = await zip.file(name)?.async('uint8array');
    if (bytes) result[name] = hash(bytes);
  }
  return result;
}

function inferCondition(text: string, questionLocalId: string, previousQuestionLocalId?: string): QuestionnaireCondition | undefined {
  const match = text.match(/(?:if|when)\s+(?:the\s+)?(?:answer\s+to\s+)?(?:the\s+previous\s+question|[^,]+)\s+(?:is|equals)\s+["']?(yes|no|n\/a|other)["']?/i);
  if (!match || !previousQuestionLocalId) return undefined;
  return QuestionnaireConditionSchema.parse({
    localId: `condition-${questionLocalId}`,
    childQuestionLocalId: questionLocalId,
    originalInstruction: match[0],
    expression: { operator: 'equals', questionLocalId: previousQuestionLocalId, value: match[1] },
    parserConfidence: /previous question/i.test(match[0]) ? 0.78 : 0.52,
    humanConfirmed: false,
  });
}

export async function inspectXlsx(source: ArrayBuffer, sourceSha256: string): Promise<QuestionnaireManifest> {
  const startedAt = new Date().toISOString();
  const zip = await JSZip.loadAsync(source, { checkCRC32: true, createFolders: false });
  const hashes = await packageHashes(zip);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !workbookRels) throw new Error('The XLSX package is missing workbook metadata.');

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const workbookDoc = parser.parse(workbookXml) as Record<string, unknown>;
  const workbookRoot = workbookDoc.workbook as Record<string, unknown> | undefined;
  const workbookProtection = Boolean(workbookRoot?.workbookProtection);
  const zipNames = Object.keys(zip.files);
  const macroPresent = zipNames.some((name) => /vbaProject|activeX|macrosheets/i.test(name));
  const externalLinks = zipNames.filter((name) => /externalLinks|connections\.xml/i.test(name));
  const embeddedObjects = zipNames.filter((name) => /embeddings|drawings|media/i.test(name));
  const unsupportedParts = zipNames.filter((name) => /pivotCache|slicer|customXml|webExtensions/i.test(name));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source.slice(0));
  let cellCount = 0;
  const inventory: StructuralInventory = {
    format: 'xlsx',
    sourceSha256,
    sheetNames: workbook.worksheets.map((sheet) => sheet.name),
    sheetVisibility: {},
    usedRanges: {},
    hiddenRows: {},
    hiddenColumns: {},
    mergedRanges: {},
    formulaCells: {},
    validationCells: {},
    namedRanges: Object.keys(workbook.definedNames.model ?? {}),
    externalLinks,
    embeddedObjects,
    macroPresent,
    protectedWorkbook: workbookProtection,
    protectedSheets: [],
    unsupportedParts,
    packagePartHashes: hashes,
  };

  const questions: QuestionnaireQuestion[] = [];
  const destinations: AnswerDestination[] = [];
  const conditions: QuestionnaireCondition[] = [];
  const instructions: QuestionnaireManifest['instructions'] = [];
  const warnings = inventoryWarnings(inventory);
  let displayOrder = 0;

  for (const worksheet of workbook.worksheets) {
    const state = worksheet.state === 'veryHidden' ? 'very_hidden' : worksheet.state === 'hidden' ? 'hidden' : 'visible';
    inventory.sheetVisibility[worksheet.name] = state;
    inventory.usedRanges[worksheet.name] = String(worksheet.dimensions);
    inventory.hiddenRows[worksheet.name] = [];
    inventory.hiddenColumns[worksheet.name] = [];
    inventory.formulaCells[worksheet.name] = [];
    inventory.validationCells[worksheet.name] = [];
    inventory.mergedRanges[worksheet.name] = Object.keys((worksheet.model.merges ?? []).reduce<Record<string, true>>((accumulator, merge) => {
      accumulator[String(merge)] = true;
      return accumulator;
    }, {}));
    if (Boolean((worksheet.model as unknown as { sheetProtection?: unknown }).sheetProtection)) inventory.protectedSheets.push(worksheet.name);

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.hidden) inventory.hiddenRows[worksheet.name]?.push(row.number);
      row.eachCell({ includeEmpty: false }, (cell) => {
        cellCount += 1;
        if (typeof cell.value === 'object' && cell.value && 'formula' in cell.value) inventory.formulaCells[worksheet.name]?.push(cell.address);
        if (cell.dataValidation?.type) inventory.validationCells[worksheet.name]?.push(cell.address);
      });
    });
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      if (worksheet.getColumn(column).hidden) inventory.hiddenColumns[worksheet.name]?.push(columnLetter(column));
    }
    if (cellCount > MAX_WORKBOOK_CELLS) throw new Error(`Workbook exceeds the ${MAX_WORKBOOK_CELLS}-cell processing limit.`);

    const header = detectHeaderRow(worksheet);
    if (!header.questionColumn) {
      warnings.push(
        CompatibilityWarningSchema.parse({
          code: 'question_column_not_detected',
          severity: 'critical',
          message: `No reliable question column was detected on sheet ${worksheet.name}.`,
          recommendedAction: 'Use the mapping interface to select the question and answer columns.',
          exportBlocking: true,
          sourceLocation: { format: 'xlsx', sheetName: worksheet.name, sectionPath: [], neighbouringLabels: [] },
          affectedQuestionLocalIds: [],
          affectedDestinationLocalIds: [],
          metadata: {},
        }),
      );
      continue;
    }
    if (!header.answerColumn) {
      warnings.push(
        CompatibilityWarningSchema.parse({
          code: 'answer_column_not_detected',
          severity: 'critical',
          message: `No reliable answer column was detected on sheet ${worksheet.name}.`,
          recommendedAction: 'Select the intended answer column before freezing the mapping.',
          exportBlocking: true,
          sourceLocation: { format: 'xlsx', sheetName: worksheet.name, sectionPath: [], neighbouringLabels: [] },
          affectedQuestionLocalIds: [],
          affectedDestinationLocalIds: [],
          metadata: {},
        }),
      );
    }

    let sectionPath: string[] = [worksheet.name];
    let previousQuestionLocalId: string | undefined;
    for (let rowNumber = header.row + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const questionCell = row.getCell(header.questionColumn);
      const originalText = normalizeQuestion(cellText(questionCell.value));
      if (!originalText) continue;
      const answerCell = header.answerColumn ? row.getCell(header.answerColumn) : undefined;
      const externalIdentifier = header.idColumn ? normalizeQuestion(cellText(row.getCell(header.idColumn).value)) : undefined;
      const guidance = header.guidanceColumn ? normalizeQuestion(cellText(row.getCell(header.guidanceColumn).value)) : '';
      const looksLikeHeading = !answerCell && originalText.length < 100 && !/[?]$/.test(originalText) && !/^(do|does|is|are|has|have|describe|provide|specify|can)\b/i.test(originalText);
      if (looksLikeHeading) {
        sectionPath = [worksheet.name, originalText];
        continue;
      }
      if (/^(instructions?|guidance|please (?:complete|answer|select)|note:)/i.test(originalText)) {
        instructions.push({
          localId: `instruction-${worksheet.name}-${rowNumber}`,
          scope: 'sheet',
          category: /ignore|system|prompt|tool|secret/i.test(originalText) ? 'untrusted_operational' : 'formatting',
          text: originalText,
          sourceLocation: {
            format: 'xlsx',
            sheetName: worksheet.name,
            cellRange: questionCell.address,
            sectionPath,
            neighbouringLabels: [],
          },
        });
        continue;
      }

      displayOrder += 1;
      const localId = `question-${displayOrder}`;
      const destinationLocalId = `destination-${displayOrder}`;
      const allowedValues = answerCell ? extractAllowedValues(answerCell) : [];
      const atomicRequests = decomposeCompoundQuestion(originalText);
      const formulaPresent = Boolean(answerCell && typeof answerCell.value === 'object' && answerCell.value && 'formula' in answerCell.value);
      const protectedDestination = Boolean((worksheet.model as unknown as { sheetProtection?: unknown }).sheetProtection && answerCell?.protection.locked !== false);
      const sourceLocation: SourceLocation = {
        format: 'xlsx',
        sheetName: worksheet.name,
        cellRange: questionCell.address,
        rowIndex: rowNumber,
        columnIndex: header.questionColumn,
        sectionPath,
        neighbouringLabels: [guidance].filter(Boolean),
      };
      const destination: AnswerDestination = {
        localId: destinationLocalId,
        type: answerCell ? 'xlsx_cell' : 'manual',
        location: {
          format: 'xlsx',
          sheetName: worksheet.name,
          cellRange: answerCell?.address,
          rowIndex: rowNumber,
          columnIndex: header.answerColumn,
          sectionPath,
          neighbouringLabels: [],
        },
        expectedValueType: answerFormatFor(originalText, allowedValues).valueType,
        allowedValues,
        storedValues: {},
        formulaPresent,
        protected: protectedDestination,
        styleHash: answerCell ? hash(JSON.stringify(answerCell.style ?? {})) : undefined,
        validationHash: answerCell?.dataValidation?.type ? hash(JSON.stringify(answerCell.dataValidation)) : undefined,
        writeStrategy: answerCell ? 'replace_value' : 'manual',
      };
      destinations.push(AnswerDestinationSchema.parse(destination));

      const notes: string[] = [];
      if (formulaPresent) notes.push('Proposed answer destination contains a formula.');
      if (protectedDestination) notes.push('Proposed answer destination is protected.');
      if (!header.answerColumn) notes.push('Answer destination requires manual mapping.');
      if (atomicRequests.length > 1) notes.push(`${atomicRequests.length} independently verifiable clauses detected.`);
      const question = QuestionnaireQuestionSchema.parse({
        localId,
        externalIdentifier: externalIdentifier || undefined,
        originalText,
        normalizedText: normalizeQuestion([sectionPath.at(-1), originalText].filter(Boolean).join(': ')),
        type: questionTypeFor(originalText, atomicRequests.length, allowedValues),
        polarity: detectPolarity(originalText),
        displayOrder,
        sectionPath,
        sourceLocation,
        answerFormat: answerFormatFor(originalText, allowedValues),
        answerDestinationLocalIds: [destinationLocalId],
        atomicRequests,
        inclusionStatus: state === 'visible' ? 'included' : 'needs_review',
        confidence: defaultConfidence({
          questionBoundary: 0.88,
          answerDestination: header.answerColumn ? 0.84 : 0.2,
          answerFormat: allowedValues.length ? 0.9 : 0.68,
          compoundDecomposition: atomicRequests.length > 1 ? 0.72 : 0.8,
          exportSafety: formulaPresent || protectedDestination ? 0.05 : answerCell ? 0.82 : 0.1,
        }),
        parserNotes: notes,
      });
      questions.push(question);

      const condition = inferCondition(`${guidance} ${originalText}`, localId, previousQuestionLocalId);
      if (condition) conditions.push(condition);
      previousQuestionLocalId = localId;
      if (formulaPresent) {
        warnings.push(
          CompatibilityWarningSchema.parse({
            code: 'formula_in_answer_destination',
            severity: 'critical',
            message: `${worksheet.name}!${answerCell?.address} contains a formula and will not be overwritten.`,
            recommendedAction: 'Choose a different destination or use manual export.',
            exportBlocking: true,
            sourceLocation: destination.location,
            affectedQuestionLocalIds: [localId],
            affectedDestinationLocalIds: [destinationLocalId],
            metadata: {},
          }),
        );
      }
    }
  }

  const parsedInventory = StructuralInventorySchema.parse(inventory);
  const compatibilityStatus = determineCompatibility(parsedInventory, warnings);
  return QuestionnaireManifestSchema.parse({
    manifestVersion: 1,
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    rulesetVersion: RULESET_VERSION,
    sourceSha256,
    format: 'xlsx',
    compatibilityStatus,
    compatibilityDimensions: {
      import: 'compatible',
      questionDetection: questions.length ? (warnings.some((warning) => warning.code === 'question_column_not_detected') ? 'manual_mapping_required' : 'compatible_with_warnings') : 'manual_mapping_required',
      answerMapping: warnings.some((warning) => ['answer_column_not_detected', 'formula_in_answer_destination'].includes(warning.code)) ? 'manual_mapping_required' : 'compatible',
      conditionalLogic: conditions.some((condition) => !condition.humanConfirmed) ? 'manual_mapping_required' : 'compatible_with_warnings',
      export: compatibilityStatus,
    },
    structuralFingerprint: structuralFingerprint(parsedInventory),
    inventory: parsedInventory,
    questions,
    destinations,
    conditions,
    instructions,
    warnings,
    statistics: {
      detectedQuestions: questions.length,
      detectedDestinations: destinations.length,
      unresolvedMappings: warnings.filter((warning) => warning.exportBlocking).length,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  });
}

function detectDelimiter(line: string): string {
  const candidates = [',', '\t', ';', '|'];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '')): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else value += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  row.push(value.replace(/\r$/, ''));
  if (row.some((cell) => cell !== '') || !rows.length) rows.push(row);
  return rows;
}

function csvEncode(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes(delimiter) || /[\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function serializeCsv(rows: readonly (readonly string[])[], delimiter: string, newline: string): string {
  return rows.map((row) => row.map((value) => csvEncode(value, delimiter)).join(delimiter)).join(newline);
}

export async function inspectCsv(source: ArrayBuffer, sourceSha256: string): Promise<QuestionnaireManifest> {
  const startedAt = new Date().toISOString();
  const text = new TextDecoder('utf-8', { fatal: false }).decode(source);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsv(text, delimiter);
  const headers = rows[0]?.map(normalizeColumnName) ?? [];
  const questionColumn = headers.findIndex((header) => headerScore(header, 'question') > 0);
  const answerColumn = headers.findIndex((header) => headerScore(header, 'answer') > 0);
  const idColumn = headers.findIndex((header) => headerScore(header, 'id') > 0);
  const warnings: CompatibilityWarning[] = [];
  if (questionColumn < 0) {
    warnings.push({
      code: 'question_column_not_detected',
      severity: 'critical',
      message: 'No question column could be identified from the CSV headers.',
      recommendedAction: 'Select a question column in the mapping review.',
      exportBlocking: true,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: { headers },
    });
  }
  if (answerColumn < 0) {
    warnings.push({
      code: 'answer_column_not_detected',
      severity: 'critical',
      message: 'No answer column could be identified from the CSV headers.',
      recommendedAction: 'Select the answer column before freezing the snapshot.',
      exportBlocking: true,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: { headers },
    });
  }

  const questions: QuestionnaireQuestion[] = [];
  const destinations: AnswerDestination[] = [];
  if (questionColumn >= 0) {
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const originalText = normalizeQuestion(rows[rowIndex]?.[questionColumn] ?? '');
      if (!originalText) continue;
      const localId = `question-${questions.length + 1}`;
      const destinationLocalId = `destination-${questions.length + 1}`;
      const atomicRequests = decomposeCompoundQuestion(originalText);
      destinations.push({
        localId: destinationLocalId,
        type: answerColumn >= 0 ? 'csv_field' : 'manual',
        location: {
          format: 'csv',
          rowIndex: rowIndex + 1,
          columnIndex: answerColumn >= 0 ? answerColumn + 1 : undefined,
          headerName: answerColumn >= 0 ? rows[0]?.[answerColumn] : undefined,
          sectionPath: [],
          neighbouringLabels: [],
        },
        expectedValueType: answerFormatFor(originalText).valueType,
        allowedValues: [],
        storedValues: {},
        formulaPresent: false,
        protected: false,
        writeStrategy: answerColumn >= 0 ? 'replace_value' : 'manual',
      });
      questions.push({
        localId,
        externalIdentifier: idColumn >= 0 ? rows[rowIndex]?.[idColumn] : undefined,
        originalText,
        normalizedText: originalText,
        type: questionTypeFor(originalText, atomicRequests.length, []),
        polarity: detectPolarity(originalText),
        displayOrder: questions.length + 1,
        sectionPath: [],
        sourceLocation: {
          format: 'csv',
          rowIndex: rowIndex + 1,
          columnIndex: questionColumn + 1,
          headerName: rows[0]?.[questionColumn],
          sectionPath: [],
          neighbouringLabels: [],
        },
        answerFormat: answerFormatFor(originalText),
        answerDestinationLocalIds: [destinationLocalId],
        atomicRequests,
        inclusionStatus: 'included',
        confidence: defaultConfidence({
          questionBoundary: 0.95,
          answerDestination: answerColumn >= 0 ? 0.95 : 0.1,
          exportSafety: answerColumn >= 0 ? 0.9 : 0.1,
        }),
        parserNotes: [],
      });
    }
  }
  const inventory: StructuralInventory = {
    format: 'csv',
    sourceSha256,
    sheetNames: [],
    sheetVisibility: {},
    usedRanges: {},
    hiddenRows: {},
    hiddenColumns: {},
    mergedRanges: {},
    formulaCells: {},
    validationCells: {},
    namedRanges: [],
    externalLinks: [],
    embeddedObjects: [],
    macroPresent: false,
    protectedWorkbook: false,
    protectedSheets: [],
    unsupportedParts: [],
    packagePartHashes: { source: sourceSha256 },
  };
  const compatibilityStatus = determineCompatibility(inventory, warnings);
  return QuestionnaireManifestSchema.parse({
    manifestVersion: 1,
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    rulesetVersion: RULESET_VERSION,
    sourceSha256,
    format: 'csv',
    compatibilityStatus,
    compatibilityDimensions: {
      import: 'compatible',
      questionDetection: questionColumn >= 0 ? 'compatible' : 'manual_mapping_required',
      answerMapping: answerColumn >= 0 ? 'compatible' : 'manual_mapping_required',
      conditionalLogic: 'compatible_with_warnings',
      export: compatibilityStatus,
    },
    structuralFingerprint: structuralFingerprint(inventory),
    inventory,
    questions,
    destinations,
    conditions: [],
    instructions: [],
    warnings,
    statistics: {
      detectedQuestions: questions.length,
      detectedDestinations: destinations.length,
      unresolvedMappings: warnings.filter((warning) => warning.exportBlocking).length,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  });
}

function textFromDocxNode(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromDocxNode).join('');
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const direct = record['w:t'];
    if (direct !== undefined) return textFromDocxNode(direct);
    return Object.entries(record)
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, value]) => textFromDocxNode(value))
      .join('');
  }
  return '';
}

export async function inspectDocx(source: ArrayBuffer, sourceSha256: string): Promise<QuestionnaireManifest> {
  const startedAt = new Date().toISOString();
  const zip = await JSZip.loadAsync(source, { checkCRC32: true });
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('The DOCX package is missing word/document.xml.');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: false });
  const parsed = parser.parse(documentXml) as Record<string, unknown>;
  const packagePartHashes = await packageHashes(zip);
  const relationships = Object.keys(zip.files).filter((name) => /word\/_rels|external/i.test(name));
  const macroPresent = Object.keys(zip.files).some((name) => /vbaProject|activeX/i.test(name));
  const paragraphs: string[] = [];

  const walk = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record['w:p'] !== undefined) {
      const values = Array.isArray(record['w:p']) ? record['w:p'] : [record['w:p']];
      for (const paragraph of values) {
        const text = normalizeQuestion(textFromDocxNode(paragraph));
        if (text) paragraphs.push(text);
      }
    }
    for (const [key, child] of Object.entries(record)) if (key !== 'w:p') walk(child);
  };
  walk(parsed);

  const questions: QuestionnaireQuestion[] = [];
  const destinations: AnswerDestination[] = [];
  const instructions: QuestionnaireManifest['instructions'] = [];
  const warnings: CompatibilityWarning[] = [];
  if (macroPresent) {
    warnings.push({
      code: 'macro_present',
      severity: 'critical',
      message: 'The DOCX package contains active-content parts.',
      recommendedAction: 'Provide a macro-free document or use manual completion.',
      exportBlocking: true,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: {},
    });
  }
  if (relationships.length) {
    warnings.push({
      code: 'external_relationships_present',
      severity: 'warning',
      message: 'External or relationship parts were detected and will never be followed.',
      recommendedAction: 'Review referenced instructions manually.',
      exportBlocking: false,
      affectedQuestionLocalIds: [],
      affectedDestinationLocalIds: [],
      metadata: { relationships },
    });
  }

  let sectionPath: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const text = paragraphs[index] ?? '';
    if (/^(instructions?|guidance|please (?:complete|answer|select)|note:)/i.test(text)) {
      instructions.push({
        localId: `instruction-${index + 1}`,
        scope: 'workbook',
        category: /ignore|system|prompt|tool|secret/i.test(text) ? 'untrusted_operational' : 'formatting',
        text,
        sourceLocation: { format: 'docx', paragraphId: `paragraph-${index + 1}`, sectionPath, neighbouringLabels: [] },
      });
      continue;
    }
    const questionLike = /[?]$/.test(text) || /^(do|does|is|are|has|have|describe|provide|specify|explain|can)\b/i.test(text);
    if (!questionLike && text.length < 120) {
      sectionPath = [text];
      continue;
    }
    if (!questionLike) continue;
    const localId = `question-${questions.length + 1}`;
    const destinationLocalId = `destination-${questions.length + 1}`;
    const atomicRequests = decomposeCompoundQuestion(text);
    destinations.push({
      localId: destinationLocalId,
      type: 'manual',
      location: { format: 'docx', paragraphId: `paragraph-${index + 1}`, sectionPath, neighbouringLabels: [] },
      expectedValueType: answerFormatFor(text).valueType,
      allowedValues: [],
      storedValues: {},
      formulaPresent: false,
      protected: false,
      writeStrategy: 'manual',
    });
    questions.push({
      localId,
      originalText: text,
      normalizedText: normalizeQuestion([...sectionPath, text].join(': ')),
      type: questionTypeFor(text, atomicRequests.length, []),
      polarity: detectPolarity(text),
      displayOrder: questions.length + 1,
      sectionPath,
      sourceLocation: { format: 'docx', paragraphId: `paragraph-${index + 1}`, sectionPath, neighbouringLabels: [] },
      answerFormat: answerFormatFor(text),
      answerDestinationLocalIds: [destinationLocalId],
      atomicRequests,
      inclusionStatus: 'needs_review',
      confidence: defaultConfidence({ answerDestination: 0.15, exportSafety: 0.05 }),
      parserNotes: ['Automatic DOCX export requires an explicitly mapped content control or table cell.'],
    });
  }
  warnings.push({
    code: 'docx_manual_destination_mapping_required',
    severity: 'critical',
    message: 'DOCX question text was imported, but automatic export remains blocked until safe content controls or table cells are mapped.',
    recommendedAction: 'Map explicit response controls or use the manual completion package.',
    exportBlocking: true,
    affectedQuestionLocalIds: questions.map((question) => question.localId),
    affectedDestinationLocalIds: destinations.map((destination) => destination.localId),
    metadata: {},
  });

  const inventory: StructuralInventory = {
    format: 'docx',
    sourceSha256,
    sheetNames: [],
    sheetVisibility: {},
    usedRanges: {},
    hiddenRows: {},
    hiddenColumns: {},
    mergedRanges: {},
    formulaCells: {},
    validationCells: {},
    namedRanges: [],
    externalLinks: relationships,
    embeddedObjects: Object.keys(zip.files).filter((name) => /word\/(?:media|embeddings)/i.test(name)),
    macroPresent,
    protectedWorkbook: /documentProtection/i.test(documentXml),
    protectedSheets: [],
    unsupportedParts: Object.keys(zip.files).filter((name) => /customXml|activeX|vbaProject/i.test(name)),
    packagePartHashes,
  };
  return QuestionnaireManifestSchema.parse({
    manifestVersion: 1,
    processorName: PROCESSOR_NAME,
    processorVersion: PROCESSOR_VERSION,
    rulesetVersion: RULESET_VERSION,
    sourceSha256,
    format: 'docx',
    compatibilityStatus: 'manual_mapping_required',
    compatibilityDimensions: {
      import: 'compatible_with_warnings',
      questionDetection: questions.length ? 'compatible_with_warnings' : 'manual_mapping_required',
      answerMapping: 'manual_mapping_required',
      conditionalLogic: 'manual_mapping_required',
      export: 'manual_mapping_required',
    },
    structuralFingerprint: structuralFingerprint(inventory),
    inventory,
    questions,
    destinations,
    conditions: [],
    instructions,
    warnings,
    statistics: {
      detectedQuestions: questions.length,
      detectedDestinations: destinations.length,
      unresolvedMappings: destinations.length,
    },
    startedAt,
    completedAt: new Date().toISOString(),
  });
}

export async function inspectQuestionnaire(
  source: ArrayBuffer,
  format: QuestionnaireFormat,
  expectedSha256: string,
): Promise<QuestionnaireManifest> {
  if (source.byteLength <= 0 || source.byteLength > MAX_SOURCE_BYTES) throw new Error('Questionnaire source size is outside the permitted range.');
  const actualHash = hash(source);
  if (actualHash !== expectedSha256) throw new Error('Questionnaire source hash mismatch.');
  if (format === 'xlsx') return inspectXlsx(source, expectedSha256);
  if (format === 'csv') return inspectCsv(source, expectedSha256);
  if (format === 'docx') return inspectDocx(source, expectedSha256);
  throw new Error('PDF questionnaires are import-only and require a manual mapping implementation.');
}

export type ExportRequest = {
  format: QuestionnaireFormat;
  sourceSha256: string;
  operations: ExportOperation[];
  destinations: AnswerDestination[];
};

export type ExportResult = {
  output: ArrayBuffer;
  outputSha256: string;
  structuralDiffs: ReturnType<typeof classifyPackageDiff>;
  changedLocations: string[];
  warnings: string[];
};

export async function exportXlsx(source: ArrayBuffer, request: ExportRequest): Promise<ExportResult> {
  const sourceHash = hash(source);
  if (sourceHash !== request.sourceSha256) throw new Error('Export source hash mismatch.');
  const beforeZip = await JSZip.loadAsync(source, { checkCRC32: true });
  const beforeHashes = await packageHashes(beforeZip);
  if (Object.keys(beforeZip.files).some((name) => /vbaProject|activeX|macrosheets/i.test(name))) {
    throw new Error('Automatic export is blocked for macro or active-content workbooks.');
  }

  const destinations = new Map(request.destinations.map((destination) => [destination.localId, destination]));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source.slice(0));
  const changedLocations: string[] = [];
  for (const operation of request.operations) {
    if (operation.operationType === 'leave_blank') continue;
    if (operation.operationType !== 'write_cell_value') throw new Error(`Operation ${operation.operationType} is not valid for XLSX export.`);
    const destination = destinations.get(operation.destinationLocalId);
    if (!destination?.location.sheetName || !destination.location.cellRange) throw new Error('XLSX export destination is incomplete.');
    if (destination.formulaPresent || destination.protected) throw new Error(`Destination ${destination.localId} is not safely writable.`);
    const worksheet = workbook.getWorksheet(destination.location.sheetName);
    if (!worksheet) throw new Error(`Worksheet ${destination.location.sheetName} no longer exists.`);
    const cell = worksheet.getCell(destination.location.cellRange);
    if (typeof cell.value === 'object' && cell.value && 'formula' in cell.value) throw new Error(`Destination ${cell.address} contains a formula at export time.`);
    cell.value = operation.outwardValue as ExcelJS.CellValue;
    changedLocations.push(`${worksheet.name}!${cell.address}`);
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  const outputBytes = new Uint8Array(outputBuffer);
  const afterZip = await JSZip.loadAsync(outputBytes, { checkCRC32: true });
  const afterHashes = await packageHashes(afterZip);
  const permittedParts = new Set<string>();
  for (const location of changedLocations) {
    const sheetName = location.split('!')[0];
    const worksheet = workbook.getWorksheet(sheetName);
    if (worksheet) permittedParts.add(`xl/worksheets/sheet${worksheet.id}.xml`);
  }
  permittedParts.add('xl/sharedStrings.xml');
  permittedParts.add('xl/styles.xml');
  permittedParts.add('[Content_Types].xml');
  const structuralDiffs = classifyPackageDiff(beforeHashes, afterHashes, permittedParts);
  const blocking = structuralDiffs.filter((diff) => diff.classification === 'blocking');
  if (blocking.length) throw new Error(`Structural validation blocked export: ${blocking.map((diff) => diff.path).join(', ')}`);
  return {
    output: outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength),
    outputSha256: hash(outputBytes),
    structuralDiffs,
    changedLocations,
    warnings: structuralDiffs.filter((diff) => diff.classification === 'benign_metadata').map((diff) => diff.reason),
  };
}

export function exportCsv(source: ArrayBuffer, request: ExportRequest): ExportResult {
  const sourceHash = hash(source);
  if (sourceHash !== request.sourceSha256) throw new Error('Export source hash mismatch.');
  const text = new TextDecoder().decode(source);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '');
  const rows = parseCsv(text, delimiter);
  const destinations = new Map(request.destinations.map((destination) => [destination.localId, destination]));
  const changedLocations: string[] = [];
  const warnings: string[] = [];
  for (const operation of request.operations) {
    if (operation.operationType === 'leave_blank') continue;
    if (operation.operationType !== 'write_csv_field') throw new Error(`Operation ${operation.operationType} is not valid for CSV export.`);
    const destination = destinations.get(operation.destinationLocalId);
    const row = destination?.location.rowIndex;
    const column = destination?.location.columnIndex;
    if (!row || !column) throw new Error('CSV destination is incomplete.');
    const value = operation.outwardValue === null ? '' : String(operation.outwardValue);
    const escaped = escapeCsvFormula(value);
    if (escaped.changed) warnings.push(`Escaped formula-triggering value at row ${row}, column ${column}.`);
    while (rows.length < row) rows.push([]);
    while ((rows[row - 1]?.length ?? 0) < column) rows[row - 1]?.push('');
    if (!rows[row - 1]) rows[row - 1] = [];
    rows[row - 1]![column - 1] = escaped.value;
    changedLocations.push(`row:${row}:column:${column}`);
  }
  const outputText = serializeCsv(rows, delimiter, newline);
  const outputBytes = new TextEncoder().encode(outputText);
  return {
    output: outputBytes.buffer,
    outputSha256: hash(outputBytes),
    structuralDiffs: [],
    changedLocations,
    warnings,
  };
}

export async function exportQuestionnaire(source: ArrayBuffer, request: ExportRequest): Promise<ExportResult> {
  if (request.format === 'xlsx') return exportXlsx(source, request);
  if (request.format === 'csv') return exportCsv(source, request);
  throw new Error('Automatic export is not enabled for this questionnaire format. Produce a manual completion package instead.');
}
