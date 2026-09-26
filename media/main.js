const vscode = acquireVsCodeApi();
const thead = document.getElementById('thead');
const tbody = document.getElementById('tbody');
const actionBar = document.getElementById('actionBar');
const selectionCount = document.getElementById('selectionCount');
const contextMenu = document.getElementById('contextMenu');
const columnContextMenu = document.getElementById('columnContextMenu');

let activeRow = null;
let activeCol = null;
let originalValue = '';
let originalHeaderValue = '';

function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'updateData') {
        const warning = document.getElementById('unsavedWarning');
        if (warning) {
            if (msg.isDirty) warning.classList.remove('hidden');
            else warning.classList.add('hidden');
        }

        const rowCount = Math.max(0, msg.rows.length - 1);
        const colCount = msg.rows.length > 0 ? msg.rows[0].length : 0;
        
        const rowCountInfo = document.getElementById('rowCountInfo');
        const colCountInfo = document.getElementById('colCountInfo');
        const fileSizeInfo = document.getElementById('fileSizeInfo');
        
        if (rowCountInfo) rowCountInfo.textContent = `Rows: ${rowCount}`;
        if (colCountInfo) colCountInfo.textContent = `Cols: ${colCount}`;
        if (fileSizeInfo && msg.fileSize !== undefined) fileSizeInfo.textContent = `Size: ${formatBytes(msg.fileSize)}`;

        renderTable(msg.rows, msg.focusTarget, msg.headerFocusTarget);
    }
});

function escapeHtml(text) {
    return (text || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function detectCellType(value) {
    const v = (value ?? '').toString().trim();
    
    // 1. Common empty or null values in CSVs (Supports uppercase 'NULL')
    if (v === '' || /^(null|n\/a|nan|-)$/i.test(v)) return null;

    // 2. Booleans
    if (/^(true|false|yes|no)$/i.test(v)) return 'Bool';

    // 3. JSON
    if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
        try {
            JSON.parse(v);
            return 'JSON';
        } catch (e) { /* Ignore */ }
    }

    // 4. Identifiers: Standard UUID with dashes OR Alphanumeric UID (e.g., Firebase 20-40 chars)
    // Reverted return value to 'UUID' to maintain compatibility with your system
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) || 
        /^[a-zA-Z0-9_\-]{20,40}$/.test(v)) {
        return 'UUID';
    }

    // 5. Email address
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Email';

    // 6. URL
    if (/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(v)) return 'URL';

    // 7. Percentage
    if (/^-?\d+(\.\d+)?%$/.test(v)) return 'Percentage';

    // 8. Currency
    if (/^[\$\€\£\¥]\s?-?[\d,]+(\.\d+)?$/.test(v) || /^-?[\d,]+(\.\d+)?\s?[\$\€\£\¥]$/.test(v)) {
        return 'Currency';
    }

    // Remove commas to evaluate pure numbers
    const cleanNum = v.replace(/,/g, '');

    // 9. Integers
    if (/^-?[\d,]+$/.test(v) && !isNaN(cleanNum)) {
        return 'Int';
    }

    // 10. Floats
    if (/^-?[\d,]*\.\d+(e[-+]?\d+)?$/i.test(v) || /^-?[\d,]+e[-+]?\d+$/i.test(v)) {
        if (!isNaN(cleanNum)) return 'Float';
    }

    // 11. Time
    if (/^\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM|am|pm))?$/.test(v)) return 'Time';

    // 12. Date and Date-Time (DateTime)
    const dateRegex = /^\d{4}[\/\-]\d{2}[\/\-]\d{2}([T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
    const slashDateRegex = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}(\s\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM|am|pm))?)?$/;
    
    if (dateRegex.test(v) || slashDateRegex.test(v)) {
        if (!isNaN(Date.parse(v.replace(' ', 'T')))) {
            return (v.includes('T') || v.includes(' ') || v.includes(':')) ? 'DateTime' : 'Date';
        }
    }

    // 13. Default
    return 'Text';
}

function inferColumnType(colIndex, body) {
    const counts = {};
    for (const row of body) {
        const t = detectCellType(row[colIndex]);
        if (t) counts[t] = (counts[t] || 0) + 1;
    }

    // Type promotion logic
    if (counts['Float'] > 0 && counts['Int'] > 0) {
        counts['Float'] += counts['Int'];
        delete counts['Int'];
    }
    
    if (counts['DateTime'] > 0 && counts['Date'] > 0) {
        counts['DateTime'] += counts['Date'];
        delete counts['Date'];
    }

    let best = 'Text';
    let bestCount = -1;
    for (const [type, count] of Object.entries(counts)) {
        if (count > bestCount) {
            best = type;
            bestCount = count;
        }
    }
    return best;
}

const TYPE_ICONS = {
    Text: 'Text',
    Int: 'Int',
    Float: 'Float',
    Date: 'Date',
    DateTime: 'DateTime',
    Time: 'Time',
    Bool: 'Bool',
    JSON: 'JSON',
    Email: 'Email',
    URL: 'URL',
    Percentage: 'Percent',
    Currency: 'Currency',
    UUID: 'UUID'
};

function renderTable(rows, focusTarget, headerFocusTarget) {
    const active = document.activeElement;
    let activeState = null;
    let activeHeaderState = null;

    if (active && active.classList.contains('header-editable')) {
        activeHeaderState = {
            col: parseInt(active.dataset.col, 10),
            text: active.textContent
        };
    } else if (active && active.classList.contains('editable')) {
        activeState = {
            row: parseInt(active.dataset.row, 10),
            col: parseInt(active.dataset.col, 10),
            text: active.textContent
        };
    }

    let header = rows[0] || [];
    const body = rows.slice(1);

    thead.innerHTML = '<tr><th class="row-num-col">#</th><th class="checkbox-col"><input type="checkbox" id="selectAll" /></th>' +
        header.map((c, i) => {
            const colType = inferColumnType(i, body);
            const icon = TYPE_ICONS[colType] || '';
            return `<th data-col="${i}"><span class="header-editable editable" contenteditable="true" data-col="${i}">${escapeHtml(c)}</span> <span class="col-type-icon" title="${colType}">${icon}</span></th>`;
        }).join('') + '</tr>';

    tbody.innerHTML = body.map((r, rowIndex) => `
        <tr data-row="${rowIndex}">
            <td class="row-num-col">${rowIndex + 1}</td>
            <td class="checkbox-col"><input type="checkbox" class="row-check" data-row="${rowIndex}" /></td>
            ${header.map((_, i) => `<td class="${i === 0 ? 'primary' : ''} editable" contenteditable="true" data-row="${rowIndex}" data-col="${i}">${escapeHtml(r[i])}</td>`).join('')}
        </tr>
    `).join('');

    if (focusTarget) {
        focusCell(focusTarget.row, focusTarget.col);
    } else if (typeof headerFocusTarget === 'number') {
        focusHeaderCell(headerFocusTarget);
    } else if (activeState) {
        const cell = document.querySelector(`td.editable[data-row="${activeState.row}"][data-col="${activeState.col}"]`);
        if (cell) {
            cell.textContent = activeState.text;
            focusCell(activeState.row, activeState.col);
            originalValue = activeState.text;
        }
    } else if (activeHeaderState) {
        const headerCell = document.querySelector(`.header-editable[data-col="${activeHeaderState.col}"]`);
        if (headerCell) {
            headerCell.textContent = activeHeaderState.text;
            headerCell.focus();
            originalHeaderValue = activeHeaderState.text;
        }
    }

    updateBar();
    markOverflowingCells();
    applySearchFilter();
}

function markOverflowingCells() {
    document.querySelectorAll('tbody td.editable').forEach(cell => {
        cell.classList.remove('overflowing');
        cell.removeAttribute('data-full');
        if (cell.scrollWidth > cell.clientWidth) {
            cell.classList.add('overflowing');
            cell.setAttribute('data-full', cell.textContent);
        }
    });
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

function focusHeaderCell(col) {
    const cell = document.querySelector(`.header-editable[data-col="${col}"]`);
    if (cell) {
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
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
        selectionCount.textContent = selected.length + ' selected';
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

function applySearchFilter() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('tbody tr[data-row]');
    
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('.editable'));
        const rowText = cells.map(cell => cell.textContent.toLowerCase()).join(' ');
        
        if (rowText.includes(query)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', applySearchFilter);
}

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

document.getElementById('addColumnBtn').addEventListener('click', () => {
    const headerCells = document.querySelectorAll('thead th[data-col]');
    const lastColIndex = headerCells.length ? headerCells.length - 1 : -1;
    vscode.postMessage({ type: 'addColumn', afterColIndex: lastColIndex });
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

thead.addEventListener('contextmenu', (e) => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    e.preventDefault();
    activeCol = parseInt(th.dataset.col, 10);
    columnContextMenu.style.top = e.pageY + 'px';
    columnContextMenu.style.left = e.pageX + 'px';
    columnContextMenu.classList.remove('hidden');
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

thead.addEventListener('focusin', (e) => {
    if (!e.target.classList.contains('header-editable')) return;
    originalHeaderValue = e.target.textContent;
});

thead.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('header-editable')) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    }
    if (e.key === 'Escape') {
        e.target.textContent = originalHeaderValue;
        e.target.blur();
    }
});

thead.addEventListener('focusout', (e) => {
    if (!e.target.classList.contains('header-editable')) return;
    const newValue = e.target.textContent.trim();
    if (newValue === originalHeaderValue) return;

    vscode.postMessage({
        type: 'updateHeader',
        colIndex: parseInt(e.target.dataset.col, 10),
        value: newValue
    });
});

document.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
    columnContextMenu.classList.add('hidden');
});

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

columnContextMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action || activeCol === null) return;

    switch (action) {
        case 'insertColBefore':
            vscode.postMessage({ type: 'addColumn', afterColIndex: activeCol - 1 });
            break;
        case 'insertColAfter':
            vscode.postMessage({ type: 'addColumn', afterColIndex: activeCol });
            break;
        case 'deleteCol':
            vscode.postMessage({ type: 'deleteColumn', colIndex: activeCol });
            break;
    }
});