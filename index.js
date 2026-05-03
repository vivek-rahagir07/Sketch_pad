// Initialize Lucide Icons
lucide.createIcons();

// HIDE PRELOADER ON LOAD
window.addEventListener('load', () => {
    setTimeout(() => {
        const preloader = document.getElementById('preloader');
        preloader.classList.add('hidden-loader');
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 800);
    }, 2100); 
});

/**
 * Constants & Config
 */
const CONFIG = {
    canvasWidth: 800,
    canvasHeight: 1100,
    colors: {
        pen: ['#0f172a', '#1e3a8a', '#991b1b', '#064e3b', '#6d28d9'], 
        pencil: ['#475569', '#1e40af', '#dc2626', '#166534', '#7c3aed'], 
        highlighter: ['#fef08a', '#bbf7d0', '#fbcfe8', '#bae6fd', '#ddd6fe'],
        shapes: ['#0f172a', '#e11d48', '#2563eb', '#16a34a', '#d97706'],
        text: ['#0f172a', '#dc2626', '#2563eb', '#059669']
    }
};

/**
 * Application State
 */
const state = {
    currentTool: 'pen',
    currentColor: CONFIG.colors.pen[0], 
    isDrawing: false,
    startX: 0,
    startY: 0,
    snapshot: null,
    notebooks: [],
    activeNotebookId: null,
    activePageId: null,
    history: [],
    historyStep: -1,
    scale: 1.0,
    isDarkMode: false
};

/**
 * DOM Elements
 */
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const paletteContainer = document.getElementById('color-palette');
const notebookListEl = document.getElementById('notebook-list');
const pageIndicator = document.getElementById('page-indicator');
const patternSelect = document.getElementById('pattern-select');
const zoomDisplay = document.getElementById('zoom-level');
const canvasWrapper = document.getElementById('canvas-wrapper');
const brushSizeInput = document.getElementById('brush-size');
const toastContainer = document.getElementById('toast-container');
const brushCursor = document.getElementById('brush-cursor');

/**
 * Initialization
 */
function init() {
    canvas.width = CONFIG.canvasWidth;
    canvas.height = CONFIG.canvasHeight;
    
    setupToolbar();
    setupCanvasEvents();
    setupKeyboardShortcuts();
    setupTheme();
    setupShareModal();
    
    setTool('pen');
    
    if (window.innerWidth < 800) {
        fitToScreen();
    } else {
        setZoom(1.0);
    }

    if (window.innerWidth <= 768) {
        document.getElementById('menu-toggle').style.display = 'block';
    }

    // Handle incoming shared link
    if (window.location.hash.startsWith('#data=')) {
        handleSharedLink();
    } else {
        loadData();
        renderNotebookList();
    }
}

function handleSharedLink() {
    const dataStr = decodeURIComponent(window.location.hash.substring(6));
    const sharedNb = {
        id: 'nb_shared',
        title: 'Shared Sketchbook',
        pages: [{ id: 'pg_shared', imageData: dataStr, pattern: 'none' }]
    };
    state.notebooks = [sharedNb]; // Temp state
    state.activeNotebookId = sharedNb.id;
    state.activePageId = sharedNb.pages[0].id;
    
    renderNotebookList();
    loadPage(sharedNb.pages[0].id);
    showToast("Loaded Shared Sketch!");
}

/**
 * Share & Collaborate Modal Logic
 */
function setupShareModal() {
    const modal = document.getElementById('share-modal-overlay');
    const shareBtn = document.getElementById('action-share');
    const closeBtn = document.getElementById('close-share-modal');
    const copyBtn = document.getElementById('copy-link-btn');
    const linkInput = document.getElementById('share-link-input');

    let currentShareLink = '';

    shareBtn.addEventListener('click', () => {
        // Generate a compressed collaboration link using URL fragments
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(canvas, 0, 0);
        
        // High compression JPEG to fit in URL
        const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.25);
        currentShareLink = window.location.href.split('#')[0] + '#data=' + encodeURIComponent(dataUrl);
        linkInput.value = currentShareLink;

        modal.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(linkInput.value);
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i data-lucide="check"></i> Copied';
            lucide.createIcons();
            showToast("Collaboration link copied to clipboard!");
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                lucide.createIcons();
            }, 2000);
        } catch (err) {
            showToast("Failed to copy link");
        }
    });

    // Social Media Links (Dynamic Actions)
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const platform = e.currentTarget.classList[1]; // e.g., 'whatsapp'
            const text = encodeURIComponent("Join my collaborative sketchbook on Infinity Note! " + currentShareLink);
            let url = '';

            switch(platform) {
                case 'whatsapp': url = `https://api.whatsapp.com/send?text=${text}`; break;
                case 'twitter': url = `https://twitter.com/intent/tweet?text=${text}`; break;
                case 'facebook': url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentShareLink)}`; break;
                case 'linkedin': url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentShareLink)}`; break;
            }

            if(url) {
                window.open(url, '_blank');
            }
        });
    });
}

/**
 * Drawing Engine
 */
function setupCanvasEvents() {
    const startDraw = (e) => {
        if (e.target.tagName === 'TEXTAREA') return; 
        if (e.buttons !== 1) return;

        e.preventDefault(); 
        canvas.setPointerCapture(e.pointerId);
        
        if (state.currentTool === 'text') {
            const pos = getPos(e);
            createTextInput(pos.x, pos.y);
            return;
        }

        state.isDrawing = true;
        saveStateToHistory(); 
        
        const pos = getPos(e);
        state.startX = pos.x;
        state.startY = pos.y;
        
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        state.points = [pos];
        
        if (['rect', 'circle', 'line'].includes(state.currentTool)) {
            state.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    };

    const moveDraw = (e) => {
        updateCursor(e);

        if (!state.isDrawing) return;
        e.preventDefault();
        
        const pos = getPos(e);

        if (['rect', 'circle', 'line'].includes(state.currentTool)) {
            ctx.putImageData(state.snapshot, 0, 0);
            setupShapeStyle(); 
            drawShapePreview(pos);
        } else {
            let pressure = e.pressure;
            if (e.pointerType === 'mouse' && pressure === 0) pressure = 0.5;
            if (e.pointerType === 'touch') pressure = 0.5; 

            state.points.push({ x: pos.x, y: pos.y, pressure: pressure });

            if (state.points.length > 2) {
                const lastPt = state.points[state.points.length - 1];
                const prevPt = state.points[state.points.length - 2];
                const prevPrevPt = state.points[state.points.length - 3];

                const midPoint = {
                    x: (prevPrevPt.x + prevPt.x) / 2,
                    y: (prevPrevPt.y + prevPt.y) / 2
                };
                
                const endPoint = {
                    x: (prevPt.x + lastPt.x) / 2,
                    y: (prevPt.y + lastPt.y) / 2
                };

                setupBrushStyle(prevPt.pressure); 

                if(state.currentTool === 'eraser') {
                     ctx.lineTo(pos.x, pos.y);
                     ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(midPoint.x, midPoint.y);
                    ctx.quadraticCurveTo(prevPt.x, prevPt.y, endPoint.x, endPoint.y);
                    ctx.stroke();
                }
            }
        }
    };

    const endDraw = (e) => {
        if (!state.isDrawing) return;
        
        canvas.releasePointerCapture(e.pointerId);
        state.isDrawing = false;
        
        if (['rect', 'circle', 'line'].includes(state.currentTool)) {
            const pos = getPos(e);
            ctx.putImageData(state.snapshot, 0, 0); 
            setupShapeStyle(); 
            drawShapePreview(pos);
        } else {
            ctx.closePath();
        }
        
        saveToCurrentPage();
    };

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', moveDraw);
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointerleave', (e) => {
         brushCursor.style.display = 'none';
         endDraw(e);
    });
    
    canvasWrapper.addEventListener('mouseenter', () => brushCursor.style.display = 'block');
    canvasWrapper.addEventListener('mouseleave', () => brushCursor.style.display = 'none');
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function updateCursor(e) {
    if(state.currentTool === 'text') {
        brushCursor.style.display = 'none';
        canvas.style.cursor = 'text';
        return;
    }
    
    const baseSize = parseInt(brushSizeInput.value, 10);
    let visualSize = baseSize;
    
    if(state.currentTool === 'highlighter') visualSize *= 6;
    if(state.currentTool === 'eraser') visualSize *= 5;
    
    visualSize = visualSize * state.scale;

    brushCursor.style.width = visualSize + 'px';
    brushCursor.style.height = visualSize + 'px';
    brushCursor.style.left = e.clientX + 'px';
    brushCursor.style.top = e.clientY + 'px';
    brushCursor.style.display = 'block';
    canvas.style.cursor = 'none';
}

function setupBrushStyle(pressure = 0.5) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    
    const baseSize = parseInt(brushSizeInput.value, 10);
    const dynamicWidth = baseSize * (0.5 + pressure); 

    switch (state.currentTool) {
        case 'pen':
            ctx.strokeStyle = state.currentColor;
            ctx.lineWidth = dynamicWidth;
            ctx.globalAlpha = 1;
            break;
        case 'pencil':
            ctx.strokeStyle = state.currentColor;
            ctx.lineWidth = dynamicWidth * 0.8; 
            ctx.globalAlpha = 0.8;
            break;
        case 'highlighter':
            ctx.globalCompositeOperation = 'multiply'; 
            ctx.strokeStyle = state.currentColor;
            ctx.lineWidth = baseSize * 6; 
            ctx.globalAlpha = 0.4;
            ctx.lineCap = 'square';
            break;
        case 'eraser':
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = baseSize * 5;
            ctx.globalAlpha = 1;
            break;
    }
}

function setupShapeStyle() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = parseInt(brushSizeInput.value, 10);
    ctx.globalAlpha = 1;
}

function drawShapePreview(currentPos) {
    ctx.beginPath();
    const w = currentPos.x - state.startX;
    const h = currentPos.y - state.startY;

    if (state.currentTool === 'rect') {
        ctx.rect(state.startX, state.startY, w, h);
    } else if (state.currentTool === 'circle') {
        const radius = Math.sqrt(w*w + h*h);
        ctx.arc(state.startX, state.startY, radius, 0, 2 * Math.PI);
    } else if (state.currentTool === 'line') {
        ctx.moveTo(state.startX, state.startY);
        ctx.lineTo(currentPos.x, currentPos.y);
    }
    ctx.stroke();
}

/**
 * Text Tool
 */
function createTextInput(x, y) {
    const input = document.createElement('textarea');
    input.className = 'text-tool-input';
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    
    input.style.left = (rect.left + x * scaleX) + 'px';
    input.style.top = (rect.top + y * scaleX) + 'px'; 
    input.style.color = state.currentColor;
    
    const baseSize = parseInt(brushSizeInput.value, 10);
    const fontSize = Math.max(16, baseSize * 6) * state.scale; 
    input.style.fontSize = `${fontSize}px`;
    
    document.body.appendChild(input);
    input.focus();
    
    const saveText = () => {
        if (input.value.trim()) {
            saveStateToHistory();
            const drawSize = Math.max(16, baseSize * 6);
            ctx.font = `${drawSize}px Inter, sans-serif`; 
            ctx.fillStyle = state.currentColor;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            
            const lines = input.value.split('\n');
            lines.forEach((line, i) => {
                ctx.fillText(line, x, y + drawSize + (i * (drawSize + 5)));
            });
            saveToCurrentPage();
        }
        if(document.body.contains(input)) document.body.removeChild(input);
    };

    input.addEventListener('blur', saveText);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.blur();
        }
    });
}

/**
 * UI Logic & Themes
 */
function setupToolbar() {
    const tools = ['pen', 'pencil', 'highlighter', 'eraser', 'text', 'rect', 'circle', 'line'];
    tools.forEach(tool => {
        document.getElementById(`tool-${tool}`).addEventListener('click', () => setTool(tool));
    });

    document.getElementById('action-undo').addEventListener('click', undo);
    document.getElementById('action-download').addEventListener('click', downloadCanvas);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    patternSelect.addEventListener('change', (e) => {
        canvas.setAttribute('data-pattern', e.target.value);
        const nb = getCurrentNotebook();
        if(nb) {
            const page = nb.pages.find(p => p.id === state.activePageId);
            if(page) {
                page.pattern = e.target.value;
                saveData();
            }
        }
    });

    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('add-page').addEventListener('click', addNewPage);
    document.getElementById('clear-page').addEventListener('click', clearPage);

    document.getElementById('zoom-in').addEventListener('click', () => updateZoom(0.1));
    document.getElementById('zoom-out').addEventListener('click', () => updateZoom(-0.1));
    document.getElementById('zoom-fit').addEventListener('click', fitToScreen);
}

function setupTheme() {
    const savedTheme = localStorage.getItem('infinityNoteTheme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        state.isDarkMode = true;
    }
}

function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('infinityNoteTheme', state.isDarkMode ? 'dark' : 'light');
    showToast(state.isDarkMode ? "Dark Mode Enabled" : "Light Mode Enabled");
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if(e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        if(e.key.toLowerCase() === 'p') setTool('pen');
        if(e.key.toLowerCase() === 'b') setTool('pencil');
        if(e.key.toLowerCase() === 'h') setTool('highlighter');
        if(e.key.toLowerCase() === 'e') setTool('eraser');
        if(e.key.toLowerCase() === 't') setTool('text');
        if(e.key.toLowerCase() === 's') setTool('rect'); 
        if(e.key.toLowerCase() === 'c') setTool('circle');
        if(e.key.toLowerCase() === 'l') setTool('line');

        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        }

        if(e.key === '[') {
            brushSizeInput.value = Math.max(parseInt(brushSizeInput.min), parseInt(brushSizeInput.value) - 1);
            showToast(`Brush Size: ${brushSizeInput.value}`);
        }
        if(e.key === ']') {
            brushSizeInput.value = Math.min(parseInt(brushSizeInput.max), parseInt(brushSizeInput.value) + 1);
            showToast(`Brush Size: ${brushSizeInput.value}`);
        }
    });
}

function setTool(toolName) {
    state.currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${toolName}`).classList.add('active');
    updatePalette();
    
    let label = toolName.charAt(0).toUpperCase() + toolName.slice(1);
    if(toolName === 'rect') label = 'Rectangle';
    showToast(`Tool: ${label}`);
}

function updatePalette() {
    paletteContainer.innerHTML = '';
    if (state.currentTool === 'eraser') return;

    let toolType = state.currentTool;
    if(['rect', 'circle', 'line'].includes(toolType)) toolType = 'shapes';

    const colors = CONFIG.colors[toolType] || CONFIG.colors.pen;
    if (!colors.includes(state.currentColor)) state.currentColor = colors[0];

    colors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = `color-swatch ${state.currentColor === color ? 'active' : ''}`;
        swatch.style.backgroundColor = color;
        swatch.onclick = () => {
            state.currentColor = color;
            updatePalette();
            const activeBtn = document.querySelector('.tool-btn.active');
            if(activeBtn) activeBtn.style.color = color;
        };
        paletteContainer.appendChild(swatch);
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i data-lucide="info" size="16"></i> ${message}`;
    toastContainer.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => {
        if(toastContainer.contains(toast)) toastContainer.removeChild(toast);
    }, 2500);
}

/**
 * Zoom Logic
 */
function updateZoom(delta) {
    let newScale = state.scale + delta;
    newScale = Math.min(Math.max(newScale, 0.1), 3.0);
    setZoom(newScale);
}

function setZoom(scaleLevel) {
    state.scale = scaleLevel;
    canvas.style.width = `${CONFIG.canvasWidth * state.scale}px`;
    canvas.style.height = `${CONFIG.canvasHeight * state.scale}px`;
    zoomDisplay.innerText = `${Math.round(state.scale * 100)}%`;
}

function fitToScreen() {
    const availableWidth = canvasWrapper.clientWidth - 80; 
    const availableHeight = canvasWrapper.clientHeight - 80;
    
    const scaleW = availableWidth / CONFIG.canvasWidth;
    const scaleH = availableHeight / CONFIG.canvasHeight;
    
    let fitScale = Math.min(scaleW, scaleH);
    setZoom(fitScale);
    showToast("Fit to Screen");
}

/**
 * Notebook & Page Logic
 */
function getCurrentNotebook() {
    return state.notebooks.find(n => n.id === state.activeNotebookId);
}

function renderNotebookList() {
    notebookListEl.innerHTML = '';
    state.notebooks.forEach(nb => {
        const li = document.createElement('li');
        li.className = `notebook-item ${nb.id === state.activeNotebookId ? 'active' : ''}`;
        
        const pageCount = nb.pages ? nb.pages.length : 1;
        
        li.innerHTML = `
            <i data-lucide="book" size="18"></i>
            <div class="notebook-info">
                <div class="notebook-title">${nb.title}</div>
                <div class="notebook-meta">${pageCount} Page${pageCount > 1 ? 's' : ''}</div>
            </div>
            <i data-lucide="chevron-right" size="14" style="opacity:0.5"></i>
        `;
        li.onclick = () => switchNotebook(nb.id);
        notebookListEl.appendChild(li);
    });
    lucide.createIcons();
}

function createNotebook() {
    const title = prompt("Notebook Name:", `Notebook ${state.notebooks.length + 1}`);
    if (!title) return;

    const newNb = {
        id: 'nb_' + Date.now(),
        title: title,
        pages: [{ id: 'pg_' + Date.now(), imageData: null, pattern: 'ruled' }]
    };
    
    state.notebooks.push(newNb);
    saveData();
    switchNotebook(newNb.id);
    showToast("Notebook Created");
}

function switchNotebook(id) {
    if (state.activeNotebookId) saveToCurrentPage();
    state.activeNotebookId = id;
    
    const nb = getCurrentNotebook();
    loadPage(nb.pages[0].id);
    renderNotebookList();
    
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}

function addNewPage() {
    const nb = getCurrentNotebook();
    if(!nb) return;
    
    saveToCurrentPage();
    
    const newPage = {
        id: 'pg_' + Date.now(),
        imageData: null,
        pattern: 'ruled'
    };
    
    nb.pages.push(newPage);
    saveData();
    loadPage(newPage.id);
    renderNotebookList(); 
    showToast("New Page Added");
}

function clearPage() {
    if(confirm("Are you sure you want to clear this page?")) {
        saveStateToHistory();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveToCurrentPage();
        showToast("Page Cleared");
    }
}

function changePage(delta) {
    const nb = getCurrentNotebook();
    if(!nb) return;
    
    const currentIndex = nb.pages.findIndex(p => p.id === state.activePageId);
    const newIndex = currentIndex + delta;
    
    if (newIndex >= 0 && newIndex < nb.pages.length) {
        saveToCurrentPage();
        loadPage(nb.pages[newIndex].id);
    }
}

function loadPage(pageId) {
    const nb = getCurrentNotebook();
    const page = nb.pages.find(p => p.id === pageId);
    const index = nb.pages.findIndex(p => p.id === pageId);
    
    state.activePageId = pageId;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.history = [];
    state.historyStep = -1;

    canvas.setAttribute('data-pattern', page.pattern || 'ruled');
    patternSelect.value = page.pattern || 'ruled';

    if (page.imageData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = page.imageData;
    }

    pageIndicator.innerText = `${index + 1} / ${nb.pages.length}`;
    document.getElementById('prev-page').disabled = index === 0;
    document.getElementById('next-page').disabled = index === nb.pages.length - 1;
}

function saveToCurrentPage() {
    const nb = getCurrentNotebook();
    if(!nb) return;
    const page = nb.pages.find(p => p.id === state.activePageId);
    if (page) {
        page.imageData = canvas.toDataURL();
        saveData();
    }
}

/* --- History & Data --- */
function saveStateToHistory() {
    state.historyStep++;
    if (state.historyStep < state.history.length) state.history.length = state.historyStep;
    state.history.push(canvas.toDataURL());
    if (state.history.length > 10) { state.history.shift(); state.historyStep--; }
}

function undo() {
    if (state.historyStep >= 0) {
        const prevUrl = state.history[state.historyStep];
        state.historyStep--;
        const img = new Image();
        img.src = prevUrl;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        showToast("Undo");
    } else {
         ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

function saveData() {
    localStorage.setItem('infinityNoteDataV2', JSON.stringify({
        notebooks: state.notebooks,
        activeNbId: state.activeNotebookId
    }));
}

function loadData() {
    const data = localStorage.getItem('infinityNoteDataV2');
    if (data) {
        const parsed = JSON.parse(data);
        state.notebooks = parsed.notebooks;
        if (state.notebooks.length > 0) {
             const idToLoad = parsed.activeNbId || state.notebooks[0].id;
             state.activeNotebookId = idToLoad;
             setTimeout(() => switchNotebook(idToLoad), 10);
        } else {
            createDefaultNotebook();
        }
    } else {
        createDefaultNotebook();
    }
}

function createDefaultNotebook() {
    const defaultNb = {
        id: 'nb_default',
        title: 'My First Notebook',
        pages: [{ id: 'pg_default', imageData: null, pattern: 'ruled' }]
    };
    state.notebooks = [defaultNb];
    state.activeNotebookId = defaultNb.id;
    state.activePageId = defaultNb.pages[0].id;
    renderNotebookList();
    loadPage(defaultNb.pages[0].id);
}

function downloadCanvas() {
    const link = document.createElement('a');
    link.download = `page_${state.activePageId}.png`;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0,0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    link.href = tempCanvas.toDataURL();
    link.click();
    showToast("Image Saved");
}

/* --- Event Listeners --- */
document.getElementById('new-notebook-btn').addEventListener('click', createNotebook);
document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});
document.getElementById('clear-all-data').addEventListener('click', () => {
    if(confirm("Delete all notebooks?")) {
        localStorage.removeItem('infinityNoteDataV2');
        location.reload();
    }
});

// Start
init();
