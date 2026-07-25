import * as vscode from 'vscode';
import { getNonce } from './getNonce';

export function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'style.css')
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="
                default-src 'none';
                style-src ${webview.cspSource};
                script-src 'nonce-${nonce}';
                img-src ${webview.cspSource} https:;
            ">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
        </head>
        <body>
            <div class="table-wrapper">
                <table>
                    <thead id="thead"></thead>
                    <tbody id="tbody"></tbody>
                </table>
                <div class="toolbar-row">
                    <button id="addRowBtn">+ New row</button>
                    <button id="addColumnBtn">+ New column</button>
                </div>
            </div>

            <div id="actionBar" class="action-bar hidden">
                <span id="selectionCount">0 selected</span>
                <button id="deleteBtn">Delete</button>
            </div>

            <div id="contextMenu" class="context-menu hidden">
                <div class="menu-item" data-action="insertAbove">Insert row above</div>
                <div class="menu-item" data-action="insertBelow">Insert row below</div>
                <div class="menu-item danger" data-action="delete">Delete row</div>
            </div>

            <div id="columnContextMenu" class="context-menu hidden">
                <div class="menu-item" data-action="insertColBefore">Insert column before</div>
                <div class="menu-item" data-action="insertColAfter">Insert column after</div>
                <div class="menu-item danger" data-action="deleteCol">Delete column</div>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
}