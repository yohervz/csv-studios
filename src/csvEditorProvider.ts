import * as vscode from 'vscode';
import { WebviewMessage, FocusTarget } from './types';
import { getHtml } from './webviewHtml';
import { getParsedData, insertRow, deleteRows, updateCell } from './csvDocumentOps';

export class CsvEditorProvider implements vscode.CustomTextEditorProvider {

    public static readonly viewType = 'csvStudios.editor';

    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };

        webviewPanel.webview.html = getHtml(webviewPanel.webview, this.extensionUri);

        let pendingFocus: FocusTarget | null = null;

        const updateWebview = () => {
            const rows = getParsedData(document);
            webviewPanel.webview.postMessage({
                type: 'updateData',
                rows,
                focusTarget: pendingFocus
            });
            pendingFocus = null;
        };

        updateWebview();

        const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            switch (message.type) {
                case 'deleteRows':
                    await deleteRows(document, message.rowIndices);
                    break;
                case 'insertRow':
                    pendingFocus = { row: message.afterRowIndex + 1, col: 0 };
                    await insertRow(document, message.afterRowIndex);
                    break;
                case 'updateCell':
                    await updateCell(document, message.rowIndex, message.colIndex, message.value);
                    break;
            }
        });

        webviewPanel.onDidDispose(() => changeSub.dispose());
    }
}