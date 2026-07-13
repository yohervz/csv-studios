import * as vscode from 'vscode';
import * as Papa from 'papaparse';

export function getParsedData(document: vscode.TextDocument): string[][] {
    const parsed = Papa.parse(document.getText(), { header: false });
    let rows = parsed.data as string[][];
    if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
        rows.pop();
    }
    return rows;
}

export async function applyCsvEdit(document: vscode.TextDocument, rows: string[][]) {
    const newText = Papa.unparse(rows);
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
    const columnCount = rows.length > 0 ? rows[0].length : 1;
    const emptyRow = new Array(columnCount).fill('');

    // afterRowIndex viene indexado desde el cuerpo (sin contar header).
    // Le sumamos 2 para posicionarlo correctamente en la matriz completa.
    rows.splice(afterRowIndex + 2, 0, emptyRow);
    await applyCsvEdit(document, rows);
}

export async function deleteRows(document: vscode.TextDocument, rowIndices: number[]) {
    const rows = getParsedData(document);
    const toDelete = new Set(rowIndices.map(i => i + 1)); // +1 por la fila del header

    const newRows = rows.filter((_, idx) => !toDelete.has(idx));
    await applyCsvEdit(document, newRows);
}

export async function updateCell(document: vscode.TextDocument, rowIndex: number, colIndex: number, value: string) {
    const rows = getParsedData(document);
    const fullRowIndex = rowIndex + 1; // +1 por la fila del header

    if (rows[fullRowIndex] && colIndex < rows[fullRowIndex].length) {
        rows[fullRowIndex][colIndex] = value;
        await applyCsvEdit(document, rows);
    }
}