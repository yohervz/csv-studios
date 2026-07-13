export type WebviewMessage =
    | { type: 'deleteRows'; rowIndices: number[] }
    | { type: 'insertRow'; afterRowIndex: number }
    | { type: 'updateCell'; rowIndex: number; colIndex: number; value: string };

export interface FocusTarget {
    row: number;
    col: number;
}