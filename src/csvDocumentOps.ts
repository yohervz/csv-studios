import * as vscode from 'vscode';
import * as Papa from 'papaparse';

const DEFAULT_COLUMN_COUNT = 1;

function createDefaultHeader(columnCount: number): string[] {
    return Array.from({ length: columnCount }, (_, i) => `Column${i + 1}`);
}

export function getParsedData(document: vscode.TextDocument): string[][] {
    const text = document.getText();
    if (!text.trim()) return [];

    const cleanText = text.replace(/\r?\n$/, '');
    const parsed = Papa.parse(cleanText, { header: false });

    return parsed.data as string[][];
}

export async function applyCsvEdit(document: vscode.TextDocument, rows: string[][]) {
    const forceQuotes = rows.length > 0 && rows[0].length === 1;
    const newText = Papa.unparse(rows, { quotes: forceQuotes });

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, newText);
    await vscode.workspace.applyEdit(edit);
}

export async function insertRow(document: vscode.TextDocument, afterRowIndex: number) {
    const rows = getParsedData(document);

    if (rows.length === 0) {
        rows.push(createDefaultHeader(DEFAULT_COLUMN_COUNT));
    }

    const columnCount = rows[0].length;
    const emptyRow = new Array(columnCount).fill('');

    rows.splice(afterRowIndex + 2, 0, emptyRow);
    await applyCsvEdit(document, rows);
}

export async function deleteRows(document: vscode.TextDocument, rowIndices: number[]) {
    const rows = getParsedData(document);
    const toDelete = new Set(rowIndices.map(i => i + 1));

    const newRows = rows.filter((_, idx) => !toDelete.has(idx));
    await applyCsvEdit(document, newRows);
}

export async function updateCell(document: vscode.TextDocument, rowIndex: number, colIndex: number, value: string) {
    const rows = getParsedData(document);
    const fullRowIndex = rowIndex + 1;

    if (rows[fullRowIndex] && colIndex < rows[fullRowIndex].length) {
        rows[fullRowIndex][colIndex] = value;
        await applyCsvEdit(document, rows);
    }
}

export async function updateHeader(document: vscode.TextDocument, colIndex: number, value: string) {
    const rows = getParsedData(document);

    if (rows.length === 0) {
        rows.push(createDefaultHeader(DEFAULT_COLUMN_COUNT));
    }

    if (colIndex < rows[0].length) {
        rows[0][colIndex] = value;
        await applyCsvEdit(document, rows);
    }
}

export async function addColumn(document: vscode.TextDocument, afterColIndex: number) {
    const rows = getParsedData(document);

    if (rows.length === 0) {
        rows.push([]);
    }

    const columnCount = rows[0].length;
    const insertIndex = Math.min(Math.max(afterColIndex + 1, 0), columnCount);
    const newColumnName = `Column${columnCount + 1}`;

    rows.forEach((row, idx) => {
        const value = idx === 0 ? newColumnName : '';
        row.splice(insertIndex, 0, value);
    });

    await applyCsvEdit(document, rows);
}

export async function deleteColumn(document: vscode.TextDocument, colIndex: number) {
    const rows = getParsedData(document);
    if (rows.length === 0 || rows[0].length <= 1) return; 

    rows.forEach(row => {
        if (colIndex < row.length) row.splice(colIndex, 1);
    });

    await applyCsvEdit(document, rows);
}