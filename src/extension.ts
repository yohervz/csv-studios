import * as vscode from 'vscode';
import { CsvEditorProvider } from './csvEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            CsvEditorProvider.viewType,
            new CsvEditorProvider(context.extensionUri),
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function deactivate() {}