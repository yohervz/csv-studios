const vscode = acquireVsCodeApi();
const thead = document.getElementById('thead');
const tbody = document.getElementById('tbody');
const actionBar = document.getElementById('actionBar');
const selectionCount = document.getElementById('selectionCount');
const contextMenu = document.getElementById('contextMenu');

let activeRow = null;
let originalValue = '';

window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'updateData') {
        renderTable(msg.rows, msg.focusTarget);
    }
});

function escapeHtml(text) {
    return (text || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTable(rows, focusTarget) {
    const active = document.activeElement;
    let activeState = null;

    if (active && active.classList.contains('editable')) {
        activeState = {
            row: parseInt(active.dataset.row, 10),
            col: parseInt(active.dataset.col, 10),
            text: active.textContent
        };
    }

    const [header = [], ...body] = rows;

    thead.innerHTML = '<tr><th class="checkbox-col"><input type="checkbox" id="selectAll" /></th>' +
        header.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';

    tbody.innerHTML = body.map((r, rowIndex) => `
        <tr data-row="${rowIndex}">
            <td class="checkbox-col"><input type="checkbox" class="row-check" data-row="${rowIndex}" /></td>
            ${r.map((c, i) => `<td class="${i === 0 ? 'primary' : ''} editable" contenteditable="true" data-row="${rowIndex}" data-col="${i}">${escapeHtml(c)}</td>`).join('')}
        </tr>
    `).join('');

    if (focusTarget) {
        focusCell(focusTarget.row, focusTarget.col);
    } else if (activeState) {
        const cell = document.querySelector(`td.editable[data-row="${activeState.row}"][data-col="${activeState.col}"]`);
        if (cell) {
            cell.textContent = activeState.text;
            focusCell(activeState.row, activeState.col);
            originalValue = activeState.text;
        }
    }

    updateBar();
}

function focusCell(r, c) {
    const cell = document.querySelector(`td.editable[data-row="${r}"][data-col="${c}"]`);
    if (cell) {
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

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

    switch (action) {
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