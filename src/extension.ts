import * as vscode from 'vscode';
import * as Papa from 'papaparse';

// --- Tipos e Interfaces ---
type WebviewMessage =
    | { type: 'deleteRows'; rowIndices: number[] }
    | { type: 'insertRow'; afterRowIndex: number }
    | { type: 'updateCell'; rowIndex: number; colIndex: number; value: string };

interface FocusTarget {
    row: number;
    col: number;
}

// --- Activación ---
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'csvViewer.editor',
            new CsvEditorProvider(),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

// --- Proveedor del Editor ---
class CsvEditorProvider implements vscode.CustomTextEditorProvider {
    
    resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ) {
        webviewPanel.webview.options = { enableScripts: true };

        // 1. Inyectamos el HTML estático UNA SOLA VEZ
        webviewPanel.webview.html = WebviewTemplate.getHtml(webviewPanel.webview);

        let pendingFocus: FocusTarget | null = null;

        // 2. Función dedicada a enviar datos, no a recargar el iframe
        const updateWebview = () => {
            const rows = this.getParsedData(document);
            webviewPanel.webview.postMessage({ 
                type: 'updateData', 
                rows, 
                focusTarget: pendingFocus 
            });
            pendingFocus = null; 
        };
        
        // 3. Render inicial
        updateWebview();

        const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview(); // El documento cambió, enviamos la data actualizada
            }
        });

        webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
            switch (message.type) {
                case 'deleteRows':
                    await this.deleteRows(document, message.rowIndices);
                    break;
                case 'insertRow':
                    pendingFocus = { row: message.afterRowIndex + 1, col: 0 };
                    await this.insertRow(document, message.afterRowIndex);
                    break;
                case 'updateCell':
                    await this.updateCell(document, message.rowIndex, message.colIndex, message.value);
                    break;
            }
        });

        webviewPanel.onDidDispose(() => changeSub.dispose());
    }

    private getParsedData(document: vscode.TextDocument): string[][] {
        const parsed = Papa.parse(document.getText(), { header: false });
        let rows = parsed.data as string[][];
        if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
            rows.pop();
        }
        return rows;
    }

    private async applyCsvEdit(document: vscode.TextDocument, rows: string[][]) {
        const newText = Papa.unparse(rows);
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(document.uri, fullRange, newText);
        await vscode.workspace.applyEdit(edit);
    }

    private async insertRow(document: vscode.TextDocument, afterRowIndex: number) {
        const rows = this.getParsedData(document);
        const columnCount = rows.length > 0 ? rows[0].length : 1;
        const emptyRow = new Array(columnCount).fill('');

        // afterRowIndex viene indexado desde el cuerpo (sin contar header).
        // Le sumamos 2 para posicionarlo correctamente en la matriz completa.
        rows.splice(afterRowIndex + 2, 0, emptyRow);
        await this.applyCsvEdit(document, rows);
    }

    private async deleteRows(document: vscode.TextDocument, rowIndices: number[]) {
        const rows = this.getParsedData(document);
        const toDelete = new Set(rowIndices.map(i => i + 1)); // +1 por la fila del header

        const newRows = rows.filter((_, idx) => !toDelete.has(idx));
        await this.applyCsvEdit(document, newRows);
    }

    private async updateCell(document: vscode.TextDocument, rowIndex: number, colIndex: number, value: string) {
        const rows = this.getParsedData(document);
        const fullRowIndex = rowIndex + 1; // +1 por la fila del header
        
        if (rows[fullRowIndex] && colIndex < rows[fullRowIndex].length) {
            rows[fullRowIndex][colIndex] = value;
            await this.applyCsvEdit(document, rows);
        }
    }
}

// --- Plantillas del Webview ---
class WebviewTemplate {
    
    static getHtml(webview: vscode.Webview): string {
        const cspSource = webview.cspSource;

        // Fíjate que el thead y tbody ahora nacen vacíos y tienen ID
        return /* html */ `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${this.getStyles()}</style>
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

                <script>
                    ${this.getScripts()}
                </script>
            </body>
            </html>`;
    }

    private static getScripts(): string {
        return /* javascript */ `
            const vscode = acquireVsCodeApi();
            const thead = document.getElementById('thead');
            const tbody = document.getElementById('tbody');
            const actionBar = document.getElementById('actionBar');
            const selectionCount = document.getElementById('selectionCount');
            const contextMenu = document.getElementById('contextMenu');
            
            let activeRow = null;
            let originalValue = '';

            // ---------- Escucha los datos enviados desde la extensión ----------
            window.addEventListener('message', event => {
                const msg = event.data;
                if (msg.type === 'updateData') {
                    renderTable(msg.rows, msg.focusTarget);
                }
            });

            function escapeHtml(text) {
                return (text || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            // ---------- Renderizado y Memoria de Focus ----------
            function renderTable(rows, focusTarget) {
                // 1. Interceptar y guardar lo que el usuario está escribiendo ahora mismo
                const active = document.activeElement;
                let activeState = null;
                
                if (active && active.classList.contains('editable')) {
                    activeState = {
                        row: parseInt(active.dataset.row, 10),
                        col: parseInt(active.dataset.col, 10),
                        text: active.textContent // Salvamos la información tipeada
                    };
                }

                const [header = [], ...body] = rows;
                
                // 2. Construir la cabecera
                thead.innerHTML = '<tr><th class="checkbox-col"><input type="checkbox" id="selectAll" /></th>' +
                    header.map(c => \`<th>\${escapeHtml(c)}</th>\`).join('') + '</tr>';

                // 3. Construir el cuerpo
                tbody.innerHTML = body.map((r, rowIndex) => \`
                    <tr data-row="\${rowIndex}">
                        <td class="checkbox-col"><input type="checkbox" class="row-check" data-row="\${rowIndex}" /></td>
                        \${r.map((c, i) => \`<td class="\${i === 0 ? 'primary' : ''} editable" contenteditable="true" data-row="\${rowIndex}" data-col="\${i}">\${escapeHtml(c)}</td>\`).join('')}
                    </tr>
                \`).join('');

                // 4. Restaurar el focus inteligentemente
                if (focusTarget) {
                    focusCell(focusTarget.row, focusTarget.col);
                } else if (activeState) {
                    const cell = document.querySelector(\`td.editable[data-row="\${activeState.row}"][data-col="\${activeState.col}"]\`);
                    if (cell) {
                        cell.textContent = activeState.text; // Sobreescribimos con lo que estabas tipeando
                        focusCell(activeState.row, activeState.col);
                        originalValue = activeState.text; // Previene falsos positivos al cambiar de celda
                    }
                }
                
                updateBar();
            }

            function focusCell(r, c) {
                const cell = document.querySelector(\`td.editable[data-row="\${r}"][data-col="\${c}"]\`);
                if (cell) {
                    cell.focus();
                    // Coloca el cursor al final de la celda
                    const range = document.createRange();
                    range.selectNodeContents(cell);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }

            // ---------- Eventos y Lógica UI ----------
            const checkboxes = () => Array.from(document.querySelectorAll('.row-check'));

            function updateBar() {
                const selected = checkboxes().filter(c => c.checked);
                if (selected.length > 0) {
                    actionBar.classList.remove('hidden');
                    selectionCount.textContent = selected.length + ' seleccionada' + (selected.length > 1 ? 's' : '');
                } else {
                    actionBar.classList.add('hidden');
                }
            }

            // Se movió la delegación de eventos al thead porque se re-renderiza dinámicamente
            thead.addEventListener('change', (e) => {
                if (e.target.id === 'selectAll') {
                    checkboxes().forEach(c => c.checked = e.target.checked);
                    updateBar();
                }
            });

            tbody.addEventListener('change', (e) => {
                if (e.target.classList.contains('row-check')) updateBar();
            });

            document.getElementById('deleteBtn').addEventListener('click', () => {
                const rowIndices = checkboxes()
                    .filter(c => c.checked)
                    .map(c => parseInt(c.dataset.row, 10));
                vscode.postMessage({ type: 'deleteRows', rowIndices });
            });

            document.getElementById('addRowBtn').addEventListener('click', () => {
                const lastRow = document.querySelectorAll('tbody tr[data-row]');
                const lastIndex = lastRow.length ? lastRow.length - 1 : -1;
                vscode.postMessage({ type: 'insertRow', afterRowIndex: lastIndex });
            });

            tbody.addEventListener('contextmenu', (e) => {
                const tr = e.target.closest('tr[data-row]');
                if (!tr) return;
                e.preventDefault();
                activeRow = parseInt(tr.dataset.row, 10);
                contextMenu.style.top = e.pageY + 'px';
                contextMenu.style.left = e.pageX + 'px';
                contextMenu.classList.remove('hidden');
            });

            tbody.addEventListener('focusin', (e) => {
                if (!e.target.classList.contains('editable')) return;
                originalValue = e.target.textContent;
            });

            tbody.addEventListener('keydown', (e) => {
                if (!e.target.classList.contains('editable')) return;
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur(); 
                }
                if (e.key === 'Escape') {
                    e.target.textContent = originalValue;
                    e.target.blur();
                }
            });

            tbody.addEventListener('focusout', (e) => {
                if (!e.target.classList.contains('editable')) return;
                const newValue = e.target.textContent.trim();
                if (newValue === originalValue) return; 

                vscode.postMessage({
                    type: 'updateCell',
                    rowIndex: parseInt(e.target.dataset.row, 10),
                    colIndex: parseInt(e.target.dataset.col, 10),
                    value: newValue
                });
            });

            document.addEventListener('click', () => contextMenu.classList.add('hidden'));

            contextMenu.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (!action || activeRow === null) return;
                
                switch(action) {
                    case 'insertAbove':
                        vscode.postMessage({ type: 'insertRow', afterRowIndex: activeRow - 1 });
                        break;
                    case 'insertBelow':
                        vscode.postMessage({ type: 'insertRow', afterRowIndex: activeRow });
                        break;
                    case 'delete':
                        vscode.postMessage({ type: 'deleteRows', rowIndices: [activeRow] });
                        break;
                }
            });
        `;
    }

    private static getStyles(): string {
        return /* css */ `
            :root { --row-height: 38px; }
            * { box-sizing: border-box; }
            body {
                margin: 0;
                font-family: var(--vscode-font-family, -apple-system, "Segoe UI", sans-serif);
                font-size: 13px;
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
            }
            .table-wrapper { overflow: auto; max-height: 100vh; }
            table { border-collapse: collapse; width: 100%; }
            thead th {
                position: sticky; top: 0;
                background: var(--vscode-editor-background);
                text-align: left; font-size: 11px; font-weight: 600;
                text-transform: uppercase; letter-spacing: 0.03em;
                color: var(--vscode-descriptionForeground);
                padding: 8px 16px; border-bottom: 1px solid var(--vscode-panel-border);
                white-space: nowrap; z-index: 1;
            }
            tbody td {
                padding: 0 16px; height: var(--row-height);
                border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
                white-space: nowrap; overflow: hidden;
                text-overflow: ellipsis; max-width: 320px;
            }
            tbody td.primary { font-weight: 500; }
            tbody tr:hover td { background: var(--vscode-list-hoverBackground); }
            tbody tr:last-child td { border-bottom: none; }
            .checkbox-col { width: 32px; padding: 0 8px !important; }
            .row-check { opacity: 0; cursor: pointer; }
            tr:hover .row-check, .row-check:checked { opacity: 1; }

            .action-bar {
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: var(--vscode-editorWidget-background);
                border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
                border-radius: 8px; padding: 8px 12px; display: flex; align-items: center;
                gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); font-size: 13px;
            }
            .action-bar.hidden { display: none; }
            #deleteBtn {
                background: var(--vscode-errorForeground, #f14c4c); color: white;
                border: none; border-radius: 4px; padding: 4px 12px;
                cursor: pointer; font-size: 12px;
            }
            #deleteBtn:hover { opacity: 0.85; }
            #addRowBtn {
                display: block; width: 100%; text-align: left; padding: 8px 16px;
                border: none; background: transparent; color: var(--vscode-descriptionForeground);
                font-size: 13px; cursor: pointer;
            }
            #addRowBtn:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }

            .context-menu {
                position: fixed; background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
                border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
                border-radius: 6px; padding: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10; min-width: 160px;
            }
            .context-menu.hidden { display: none; }
            .menu-item { padding: 6px 10px; font-size: 13px; border-radius: 4px; cursor: pointer; }
            .menu-item:hover { background: var(--vscode-list-hoverBackground); }
            .menu-item.danger { color: var(--vscode-errorForeground, #f14c4c); }

            .editable { cursor: text; outline: none; }
            .editable:focus {
                background: var(--vscode-editor-background);
                box-shadow: inset 0 0 0 2px var(--vscode-focusBorder, #007acc);
                border-radius: 2px;
            }
            .editable:hover:not(:focus) { background: var(--vscode-list-hoverBackground); }
        `;
    }
}