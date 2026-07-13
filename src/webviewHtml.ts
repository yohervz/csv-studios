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
                <button id="addRowBtn">+ Nueva fila</button>
            </div>

            <div id="actionBar" class="action-bar hidden">
                <span id="selectionCount">0 seleccionadas</span>
                <button id="deleteBtn">Eliminar</button>
            </div>

            <div id="contextMenu" class="context-menu hidden">
                <div class="menu-item" data-action="insertAbove">Insertar fila arriba</div>
                <div class="menu-item" data-action="insertBelow">Insertar fila abajo</div>
                <div class="menu-item danger" data-action="delete">Eliminar fila</div>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
}