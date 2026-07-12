import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  exportCsv,
  inspectCsv,
  inspectXlsx,
  parseCsv,
  serializeCsv,
  type ExportRequest,
} from './processor';

function sha256(bytes: ArrayBuffer | Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))).digest('hex');
}

describe('CSV adapter', () => {
  it('parses quoted commas and preserves rows', () => {
    expect(parseCsv('Question,Answer\n"Is data, encrypted?",Yes')).toEqual([
      ['Question', 'Answer'],
      ['Is data, encrypted?', 'Yes'],
    ]);
    expect(serializeCsv([['Question', 'Answer'], ['Is data, encrypted?', 'Yes']], ',', '\n')).toContain('"Is data, encrypted?"');
  });

  it('detects questions and answer fields', async () => {
    const bytes = new TextEncoder().encode('ID,Question,Vendor Response\nQ1,Is MFA required?,\nQ2,Describe encryption,');
    const manifest = await inspectCsv(bytes.buffer, sha256(bytes));
    expect(manifest.questions).toHaveLength(2);
    expect(manifest.destinations[0]?.location.columnIndex).toBe(3);
    expect(manifest.compatibilityStatus).toBe('compatible');
  });

  it('exports only mapped fields and escapes formula injection', () => {
    const bytes = new TextEncoder().encode('ID,Question,Vendor Response\nQ1,Provide a value,');
    const request: ExportRequest = {
      format: 'csv',
      sourceSha256: sha256(bytes),
      operations: [
        {
          localId: 'op-1',
          questionLocalId: 'q1',
          destinationLocalId: 'd1',
          operationType: 'write_csv_field',
          outwardValue: '=1+1',
          expectedFormulaState: false,
          conditionActivation: 'active',
        },
      ],
      destinations: [
        {
          localId: 'd1',
          type: 'csv_field',
          location: { format: 'csv', rowIndex: 2, columnIndex: 3, sectionPath: [], neighbouringLabels: [] },
          expectedValueType: 'text',
          allowedValues: [],
          storedValues: {},
          formulaPresent: false,
          protected: false,
          writeStrategy: 'replace_value',
        },
      ],
    };
    const result = exportCsv(bytes.buffer, request);
    expect(new TextDecoder().decode(result.output)).toContain("'=1+1");
    expect(result.changedLocations).toEqual(['row:2:column:3']);
  });
});

describe('XLSX adapter', () => {
  it('detects a conventional question and answer table', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Security');
    sheet.addRow(['Control ID', 'Question', 'Vendor Response']);
    sheet.addRow(['AC-1', 'Is MFA required for all production administrators?', '']);
    sheet.getCell('C2').dataValidation = { type: 'list', formulae: ['"Yes,No,N/A"'] };
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    const manifest = await inspectXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), sha256(bytes));
    expect(manifest.questions).toHaveLength(1);
    expect(manifest.questions[0]?.answerFormat.allowedValues).toEqual(['Yes', 'No', 'N/A']);
    expect(manifest.destinations[0]?.location.cellRange).toBe('C2');
    expect(manifest.inventory.sheetNames).toEqual(['Security']);
  });

  it('blocks formula answer destinations', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Security');
    sheet.addRow(['Question', 'Answer']);
    sheet.addRow(['Is MFA required?', { formula: '1+1', result: 2 }]);
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    const manifest = await inspectXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), sha256(bytes));
    expect(manifest.warnings.some((warning) => warning.code === 'formula_in_answer_destination')).toBe(true);
    expect(manifest.compatibilityStatus).toBe('manual_mapping_required');
  });
});
