/* ==========================================================================
   SONIC POCKET ADVENTURE: PIECE TRACKER - DEFINITIVE ENGINE (v20.0)
   ========================================================================== */

const STAGES = [
    "Neo South Island Act 1", "Neo South Island Act 2", "Secret Plant Act 1", "Secret Plant Act 2",
    "Cosmic Casino Act 1", "Cosmic Casino Act 2", "Aquatic Relix Act 1", "Aquatic Relix Act 2",
    "Sky Chase", "Aerobase", "Gigantic Angel Act 1", "Gigantic Angel Act 2", "Last Utopia"
];

const MAP_FILES = {
    "Neo South Island Act 1": "neo-south-island-act-1.png",
    "Neo South Island Act 2": "neo-south-island-act-2.png",
    "Secret Plant Act 1":     "secret-plant-act-1.png",
    "Secret Plant Act 2":     "secret-plant-act-2.png",
    "Cosmic Casino Act 1":    "cosmic-casino-act-1.png",
    "Cosmic Casino Act 2":    "cosmic-casino-act-2.png",
    "Aquatic Relix Act 1":    "aquatic-relix-act-1.png",
    "Aquatic Relix Act 2":    "aquatic-relix-act-2.png",
    "Sky Chase":              "sky-chase.png",
    "Aerobase":               "aerobase.png",
    "Gigantic Angel Act 1":   "gigantic-angel-act-1.png",
    "Gigantic Angel Act 2":   "gigantic-angel-act-2.png",
    "Last Utopia":            "last-utopia.png"
};

const getBasePath = () => {
    const loc = window.location;
    if (loc.hostname.includes("github.io")) {
        const pathSegments = loc.pathname.split('/').filter(segment => segment.length > 0);
        const repoName = pathSegments[0]; 
        return `${loc.origin}/${repoName}/`;
    }
    return "./"; 
};
const BASE_PATH = getBasePath();

// Engine Core Context Variables
let db = null, currentStage = STAGES[0], stageMarkers = [], collectedStates = {};
let zoom = 0.5, offsetX = 20, offsetY = 20, isDragging = false, startX = 0, startY = 0, initialPinchDist = 0;
let isAdminMode = new URLSearchParams(window.location.search).get('mode') === 'admin';
let globalActiveMapImage = null;

// Global Handle Declarations
let canvas, ctx, viewport, levelMenu, checklistGrid;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    if (canvas) ctx = canvas.getContext('2d');
    viewport = document.getElementById('viewport');
    levelMenu = document.getElementById('levelMenu');
    checklistGrid = document.getElementById('pieceChecklist');

    document.querySelectorAll('.admin-ui').forEach(el => el.style.display = isAdminMode ? 'flex' : 'none');
    
    const dbRequest = indexedDB.open("SPA_Community_Tracker_DB", 2);
    dbRequest.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains("user_progress")) d.createObjectStore("user_progress");
    };
    dbRequest.onsuccess = (e) => { db = e.target.result; buildInterface(); };
    dbRequest.onerror = () => { buildInterface(); };
});

function buildInterface() {
    if (!levelMenu) return;
    levelMenu.innerHTML = '';
    STAGES.forEach(stg => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.innerText = stg;
        btn.onclick = () => loadStageData(stg);
        levelMenu.appendChild(btn);
    });
    setupGestureListeners();
    setupGamepadPolling();
    loadStageData(currentStage);
}

async function loadStageData(stageName) {
    currentStage = stageName;
    document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.innerText === stageName));

    try {
        const res = await fetch(`${BASE_PATH}assets/puzzlepieces_data.json`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        stageMarkers = data[stageName] || [];
    } catch (e) { 
        console.warn("JSON Database file not created/found yet. Starting with blank puzzle coordinates.");
        stageMarkers = []; 
    }
    stageMarkers.sort((a, b) => a.x - b.x);

    collectedStates = await new Promise(r => {
        if (!db) return r({});
        const req = db.transaction("user_progress", "readonly").objectStore("user_progress").get(stageName);
        req.onsuccess = () => r(req.result || {});
        req.onerror = () => r({});
    });

    const fileName = MAP_FILES[stageName];
    // FIX: Ensure clean subdirectory lookup parsing 
    const targetSrcURL = `${BASE_PATH}maps/${fileName}?t=${new Date().getTime()}`;
    
    const imgWorker = new Image();
    imgWorker.crossOrigin = "anonymous";
    
    imgWorker.onload = () => {
        globalActiveMapImage = imgWorker;
        
        let targetWidth = imgWorker.width || imgWorker.naturalWidth || 2048;
        let targetHeight = imgWorker.height || imgWorker.naturalHeight || 512;
        
        console.log(`Asset Engine Initialized: Size Dimension Metrics -> ${targetWidth}x${targetHeight}`);
        
        if (canvas) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = targetWidth + "px";
            canvas.style.height = targetHeight + "px";
        }
        
        zoom = window.innerHeight > window.innerWidth ? 0.35 : 0.6;
        offsetX = 20; 
        offsetY = 20;
        
        applyTransform();
        renderMap();
    };
    
    imgWorker.onerror = (err) => {
        console.error("Image loader error caught: ", err);
        if (ctx && canvas) {
            canvas.width = 600; canvas.height = 340;
            canvas.style.width = "100%"; canvas.style.height = "auto";
            ctx.fillStyle = "#000c22"; ctx.fillRect(0, 0, 600, 340);
            ctx.fillStyle = "#ff3333"; ctx.font = "10px 'Press Start 2P'";
            ctx.fillText("CRITICAL CANVAS RENDER PIPELINE FAILURE", 20, 50);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(targetSrcURL, 20, 100);
        }
        buildChecklistUI();
    };

    imgWorker.src = targetSrcURL;
}

function renderMap() {
    if (!globalActiveMapImage || !ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let dW = globalActiveMapImage.width || globalActiveMapImage.naturalWidth || canvas.width;
    let dH = globalActiveMapImage.height || globalActiveMapImage.naturalHeight || canvas.height;
    
    ctx.drawImage(globalActiveMapImage, 0, 0, dW, dH);

    stageMarkers.forEach((m, idx) => {
        const checked = !!collectedStates[idx];
        ctx.lineWidth = 3;
        ctx.strokeStyle = checked ? '#444' : '#00ff41';
        ctx.strokeRect(m.x, m.y, 15, 22);
        if (checked) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(m.x, m.y, 15, 22);
        }
        if (isAdminMode) {
            ctx.fillStyle = '#ffe700'; ctx.font = "7px 'Press Start 2P'";
            ctx.fillText(idx + 1, m.x, m.y - 4);
        }
    });
    buildChecklistUI();
}

function buildChecklistUI() {
    if (!checklistGrid) return;
    checklistGrid.innerHTML = '';
    stageMarkers.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = `check-item ${collectedStates[idx] ? 'collected' : ''}`;
        item.innerText = `#${idx + 1}`;
        item.onclick = (e) => {
            e.stopPropagation();
            zoom = 2.5;
            offsetX = (viewport.offsetWidth / 2) - ((m.x + 7.5) * zoom);
            offsetY = (viewport.offsetHeight / 2) - ((m.y + 11) * zoom);
            applyTransform();
        };
        item.ondblclick = () => togglePiece(idx);
        
        let t;
        item.addEventListener('touchstart', () => { t = setTimeout(() => togglePiece(idx), 500); }, {passive:true});
        item.addEventListener('touchend', () => clearTimeout(t));
        checklistGrid.appendChild(item);
    });
    
    const currentCollected = stageMarkers.filter((_, i) => collectedStates[i]).length;
    const stagePerc = stageMarkers.length ? Math.round((currentCollected / stageMarkers.length) * 100) : 0;
    
    const stagePercEl = document.getElementById('stagePerc');
    const stageFillEl = document.getElementById('stageFill');
    if (stagePercEl) stagePercEl.innerText = `${stagePerc}%`;
    if (stageFillEl) stageFillEl.style.width = `${stagePerc}%`;
    
    let total = 0, done = 0;
    STAGES.forEach(async s => {
        if(s === currentStage) { total += stageMarkers.length; done += currentCollected; }
        const totalStatsEl = document.getElementById('totalStats');
        if (totalStatsEl) totalStatsEl.innerText = `${done}/${total}`;
    });
}

function togglePiece(idx) {
    if (idx < 0 || idx >= stageMarkers.length) return;
    collectedStates[idx] = !collectedStates[idx];
    if (db) db.transaction("user_progress", "readwrite").objectStore("user_progress").put(collectedStates, currentStage);
    renderMap();
}

function applyTransform() { 
    if(canvas) canvas.style.transform = `translate3d(${offsetX}px,${offsetY}px,0) scale(${zoom})`; 
}

function setupGestureListeners() {
    if (!viewport) return;
    viewport.onmousedown = (e) => { isDragging = true; startX = e.clientX - offsetX; startY = e.clientY - offsetY; };
    window.onmouseup = () => isDragging = false;
    window.onmousemove = (e) => { if (isDragging) { offsetX = e.clientX - startX; offsetY = e.clientY - startY; applyTransform(); } };
    viewport.onwheel = (e) => { e.preventDefault(); zoomCalc(e.deltaY > 0 ? 0.85 : 1.15, e.clientX, e.clientY); };

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { isDragging = true; startX = e.touches[0].clientX - offsetX; startY = e.touches[0].clientY - offsetY; }
        else if (e.touches.length === 2) { isDragging = false; initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, {passive:true});

    // FIX: Changed {false:false} to valid configuration syntax behavior {passive:false}
    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) { offsetX = e.touches[0].clientX - startX; offsetY = e.touches[0].clientY - startY; applyTransform(); }
        else if (e.touches.length === 2) {
            e.preventDefault();
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            zoomCalc(Math.min(Math.max(d / initialPinchDist, 0.9), 1.1), (e.touches[0].clientX + e.touches[1].clientX)/2, (e.touches[0].clientY + e.touches[1].clientY)/2);
            initialPinchDist = d;
        }
    }, {passive:false});

    if (canvas) {
        canvas.onclick = (e) => {
            if (isDragging) return;
            const b = canvas.getBoundingClientRect();
            const cx = (e.clientX - b.left) / zoom, cy = (e.clientY - b.top) / zoom;
            const hit = stageMarkers.findIndex(m => cx >= m.x && cx <= (m.x + 15) && cy >= m.y && cy <= (m.y + 22));
            if (hit !== -1) togglePiece(hit);
        };
    }
}

function zoomCalc(m, fx, fy) {
    if (!viewport) return;
    const nz = Math.min(Math.max(0.1, zoom * m), 10.0);
    const vb = viewport.getBoundingClientRect();
    const rx = fx - vb.left - offsetX, ry = fy - vb.top - offsetY;
    offsetX -= (rx * (nz / zoom) - rx); offsetY -= (ry * (nz / zoom) - ry);
    zoom = nz; applyTransform();
}

function setupGamepadPolling() {
    window.addEventListener("gamepadconnected", () => {
        const loop = () => {
            const p = navigator.getGamepads ? navigator.getGamepads()[0] : null;
            if (p) {
                if (Math.abs(p.axes[0]) > 0.15) offsetX -= p.axes[0] * 6;
                if (Math.abs(p.axes[1]) > 0.15) offsetY -= p.axes[1] * 6;
                if (p.buttons[7]?.value > 0.1) zoom *= 1.02; if (p.buttons[6]?.value > 0.1) zoom *= 0.98;
                applyTransform();
            }
            requestAnimationFrame(loop);
        };
        loop();
    });
}

function adminManualAdd() {
    if (!isAdminMode || !viewport) return;
    const viewCenterCanvasX = ((viewport.offsetWidth / 2) - offsetX) / zoom;
    const viewCenterCanvasY = ((viewport.offsetHeight / 2) - offsetY) / zoom;
    stageMarkers.push({ x: Math.round(viewCenterCanvasX - 7.5), y: Math.round(viewCenterCanvasY - 11) });
    stageMarkers.sort((a, b) => a.x - b.x);
    renderMap();
}

function adminManualDelete() {
    if (!isAdminMode || !stageMarkers.length) return;
    const targetIdx = prompt(`Enter piece number to delete (1 - ${stageMarkers.length}):`);
    if (targetIdx && targetIdx > 0 && targetIdx <= stageMarkers.length) {
        stageMarkers.splice(targetIdx - 1, 1);
        renderMap();
    }
}

async function runMobileScanner() {
    const input = document.getElementById('adminTemplateFileInput');
    if (!input || !input.files.length) return alert("Please select your template PNG image first.");
    
    const tImg = await new Promise(r => { const img = new Image(); img.onload = () => r(img); img.src = URL.createObjectURL(input.files[0]); });
    const bCanvas = document.createElement('canvas'); bCanvas.width = tImg.width; bCanvas.height = tImg.height;
    const bCtx = bCanvas.getContext('2d'); bCtx.drawImage(tImg, 0, 0);
    const rData = bCtx.getImageData(0, 0, tImg.width, tImg.height).data;
    
    const pts = [];
    for (let i = 0; i < rData.length; i += 4) {
        if (rData[i + 3] > 220) {
            const idx = i / 4;
            pts.push({ x: idx % tImg.width, y: Math.floor(idx / tImg.width), r: rData[i], g: rData[i+1], b: rData[i+2] });
        }
    }

    if(!canvas || !ctx) return;
    const mBuffer = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height - 22; y++) {
        for (let x = 0; x < canvas.width - 15; x++) {
            let match = true;
            for (let p of pts) {
                const tIdx = ((y + p.y) * canvas.width + (x + p.x)) * 4;
                if (mBuffer[tIdx] !== p.r || mBuffer[tIdx+1] !== p.g || mBuffer[tIdx+2] !== p.b) { match = false; break; }
            }
            if (match && !stageMarkers.some(m => Math.abs(m.x - x) < 6 && Math.abs(m.y - y) < 6)) {
                stageMarkers.push({ x: x, y: y });
            }
        }
    }
    stageMarkers.sort((a, b) => a.x - b.x);
    renderMap();
    alert("Scanning arrays completed.");
}

function exportMasterJSON() {
    const out = {}; out[currentStage] = stageMarkers.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
    const blob = new Blob([JSON.stringify(out, null, 4)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'puzzlepieces_data.json'; a.click();
}
