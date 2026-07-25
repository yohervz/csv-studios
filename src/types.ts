export type WebviewMessage =
    | { type: 'deleteRows'; rowIndices: number[] }
    | { type: 'insertRow'; afterRowIndex: number }
    | { type: 'updateCell'; rowIndex: number; colIndex: number; value: string }
    | { type: 'updateHeader'; colIndex: number; value: string }
    | { type: 'addColumn'; afterColIndex: number }
    | { type: 'deleteColumn'; colIndex: number };

export interface FocusTarget {
    row: number;
    col: number;
}