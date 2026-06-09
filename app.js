/* ==========================================================================
   SONIC POCKET ADVENTURE: PIECE TRACKER - ENTERPRISE CORE ENGINE (v21.0)
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
        const pathSegments = loc.pathname.split('/').filter(s => s.length > 0);
        return `${loc.origin}/${pathSegments[0]}/`;
    }
    return "./"; 
};
const BASE_PATH = getBasePath();

// Global State Properties Engine Space
let db = null, currentStage = STAGES[0], stageMarkers = [], collectedStates = {};
let zoom = 0.5, offsetX = 0, offsetY = 0, isDragging = false, startX = 0, startY = 0, initialPinchDist = 0;
let isAdminMode = new URLSearchParams(window.location.search).get('mode') === 'admin';
let globalActiveMapImage = null;

let canvas, ctx, viewport, levelMenu, checklistGrid;
let lastButtonState = {}; // Used to handle clean gamepad button clicks without rapid-firing

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    if (canvas) ctx = canvas.getContext('2d');
    viewport = document.getElementById('viewport');
    levelMenu = document.getElementById('levelMenu');
    checklistGrid = document.getElementById('pieceChecklist');

    document.querySelectorAll('.admin-ui').forEach(el => el.style.display = isAdminMode ? 'flex' : 'none');
    
    // Persistent Storage System Initializer Matrix
    const dbRequest = indexedDB.open("SPA_Community_Tracker_DB", 3);
    dbRequest.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains("user_progress")) d.createObjectStore("user_progress");
        if (!d.objectStoreNames.contains("admin_coordinates")) d.createObjectStore("admin_coordinates");
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
    setupGamepadEngine();
    loadStageData(currentStage);
}

async function loadStageData(stageName) {
    currentStage = stageName;
    document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.innerText === stageName));

    // 1. Coordinates Database Matrix Loading Core
    let customCoords = null;
    if (db) {
        customCoords = await new Promise(r => {
            const req = db.transaction("admin_coordinates", "readonly").objectStore("admin_coordinates").get(stageName);
            req.onsuccess = () => r(req.result);
            req.onerror = () => r(null);
        });
    }

    if (customCoords) {
        stageMarkers = customCoords;
    } else {
        try {
            const res = await fetch(`${BASE_PATH}assets/puzzlepieces_data.json`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            stageMarkers = data[stageName] || [];
        } catch (e) { 
            stageMarkers = []; 
        }
    }
    stageMarkers.sort((a, b) => a.x - b.x);

    // 2. Collection Progress Metrics Load Block
    collectedStates = await new Promise(r => {
        if (!db) return r({});
        const req = db.transaction("user_progress", "readonly").objectStore("user_progress").get(stageName);
        req.onsuccess = () => r(req.result || {});
        req.onerror = () => r({});
    });

    const fileName = MAP_FILES[stageName];
    const targetSrcURL = `${BASE_PATH}maps/${fileName}?t=${new Date().getTime()}`;
    
    const imgWorker = new Image();
    imgWorker.crossOrigin = "anonymous";
    
    imgWorker.onload = () => {
        globalActiveMapImage = imgWorker;
        
        let targetWidth = imgWorker.width || imgWorker.naturalWidth || 2048;
        let targetHeight = imgWorker.height || imgWorker.naturalHeight || 512;
        
        if (canvas) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            canvas.style.width = targetWidth + "px";
            canvas.style.height = targetHeight + "px";
        }
        
        centerMapInViewport();
    };
    
    imgWorker.onerror = () => {
        if (ctx && canvas) {
            canvas.width = 600; canvas.height = 340;
            canvas.style.width = "100%"; canvas.style.height = "auto";
            ctx.fillStyle = "#000c22"; ctx.fillRect(0, 0, 600, 340);
            ctx.fillStyle = "#ff3333"; ctx.font = "8px 'Press Start 2P'";
            ctx.fillText("RENDER PIPELINE CRITICAL DISCONNECTED ERR", 20, 50);
        }
        buildChecklistUI();
    };

    imgWorker.src = targetSrcURL;
}

function centerMapInViewport() {
    if (!canvas || !viewport) return;
    zoom = window.innerHeight > window.innerWidth ? 0.35 : 0.65;
    offsetX = (viewport.offsetWidth / 2) - ((canvas.width * zoom) / 2);
    offsetY = (viewport.offsetHeight / 2) - ((canvas.height * zoom) / 2);
    applyTransform();
    renderMap();
}

function renderMap() {
    if (!globalActiveMapImage || !ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(globalActiveMapImage, 0, 0, canvas.width, canvas.height);

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

async function buildChecklistUI() {
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
    
    // UI Label Calculations Injector Matrix Optimization
    const stagePercEl = document.getElementById('stagePerc');
    const stageFillEl = document.getElementById('stageFill');
    if (stagePercEl) stagePercEl.innerText = `${stagePerc}% [${currentCollected}/${stageMarkers.length}]`;
    if (stageFillEl) stageFillEl.style.width = `${stagePerc}%`;
    
    // Global Matrix Verification Execution Sync
    calculateGlobalTotals(currentCollected);
}

function calculateGlobalTotals(activeCollectedCount) {
    if (!db) return;
    let totalPieces = 0;
    let totalCollected = 0;

    const tx = db.transaction(["user_progress", "admin_coordinates"], "readonly");
    const progressStore = tx.objectStore("user_progress");
    const coordsStore = tx.objectStore("admin_coordinates");

    let processedCount = 0;

    STAGES.forEach(stg => {
        let stgTotal = 0;
        let stgCollected = 0;

        // Fetch piece total counts safely
        const coordReq = coordsStore.get(stg);
        coordReq.onsuccess = () => {
            if (coordReq.result) {
                stgTotal = coordReq.result.length;
            } else {
                stgTotal = stg === currentStage ? stageMarkers.length : 0; // Temporary fallback if data doesn't exist yet
            }
            
            const progReq = progressStore.get(stg);
            progReq.onsuccess = () => {
                const prog = progReq.result || {};
                if (stg === currentStage) {
                    stgCollected = activeCollectedCount;
                } else {
                    for(let k in prog) { if(prog[k]) stgCollected++; }
                }

                totalPieces += stgTotal;
                totalCollected += stgCollected;
                processedCount++;

                if (processedCount === STAGES.length) {
                    const globalPerc = totalPieces ? Math.round((totalCollected / totalPieces) * 100) : 0;
                    const totalStatsEl = document.getElementById('totalStats');
                    const totalFillEl = document.getElementById('totalFill');
                    if (totalStatsEl) totalStatsEl.innerText = `${globalPerc}% [${totalCollected}/${totalPieces}]`;
                    if (totalFillEl) totalFillEl.style.width = `${globalPerc}%`;
                }
            };
        };
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

/* ==========================================================================
   CROSS-PLATFORM ADVANCED HARDWARE CONTROLLER INTEGRATION ENGINE
   ========================================================================== */
function setupGamepadEngine() {
    window.addEventListener("gamepadconnected", () => {
        const loop = () => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[0];
            if (!gp) return requestAnimationFrame(loop);

            // Left Joystick / D-Pad: Handle Navigation Panning
            if (Math.abs(gp.axes[0]) > 0.18) offsetX -= gp.axes[0] * 8;
            if (Math.abs(gp.axes[1]) > 0.18) offsetY -= gp.axes[1] * 8;

            // Right Joystick: Handle Infinite Scaling Magnification Zoom
            if (Math.abs(gp.axes[3]) > 0.18) {
                const centerViewportX = viewport ? viewport.offsetWidth / 2 : window.innerWidth / 2;
                const centerViewportY = viewport ? viewport.offsetHeight / 2 : window.innerHeight / 2;
                zoomCalc(gp.axes[3] > 0 ? 0.97 : 1.03, centerViewportX, centerViewportY);
            }

            // Button A (South Interface Node): Toggle Selection Under Screen Center
            const buttonSouth = gp.buttons[0]; 
            if (buttonSouth.pressed && !lastButtonState[0]) {
                if (viewport && canvas) {
                    const cX = ((viewport.offsetWidth / 2) - offsetX) / zoom;
                    const cY = ((viewport.offsetHeight / 2) - offsetY) / zoom;
                    const hit = stageMarkers.findIndex(m => cX >= m.x && cX <= (m.x + 15) && cY >= m.y && cY <= (m.y + 22));
                    if (hit !== -1) togglePiece(hit);
                }
            }
            lastButtonState[0] = buttonSouth.pressed;

            applyTransform();
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
    
    if (db) db.transaction("admin_coordinates", "readwrite").objectStore("admin_coordinates").put(stageMarkers, currentStage);
    renderMap();
}

function adminManualDelete() {
    if (!isAdminMode || !stageMarkers.length) return;
    const targetIdx = prompt(`Enter piece number to delete (1 - ${stageMarkers.length}):`);
    if (targetIdx && targetIdx > 0 && targetIdx <= stageMarkers.length) {
        stageMarkers.splice(targetIdx - 1, 1);
        if (db) db.transaction("admin_coordinates", "readwrite").objectStore("admin_coordinates").put(stageMarkers, currentStage);
        renderMap();
    }
}

/* ==========================================================================
   AUTOMATIC ZERO-TOUCH TEMPLATE LOOKUP SCANNER ENGINE
   ========================================================================== */
async function runAutoScanner() {
    if (!isAdminMode) return;
    try {
        // Direct automated asset fetch layer injection path mapping lookup
        const templateURL = `${BASE_PATH}assets/puzzlepiece_template.png`;
        const res = await fetch(templateURL);
        if(!res.ok) throw new Error("Template image file puzzlepiece_template.png could not be found inside the assets folder.");

        const blob = await res.blob();
        const tImg = await new Promise((resolve, reject) => { 
            const img = new Image(); 
            img.onload = () => resolve(img); 
            img.onerror = () => reject();
            img.src = URL.createObjectURL(blob); 
        });

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
        if (db) db.transaction("admin_coordinates", "readwrite").objectStore("admin_coordinates").put(stageMarkers, currentStage);
        renderMap();
        alert("Automated scan profile parsing processing matrix complete.");
    } catch(err) {
        alert(err.message || "Auto Scanner couldn't find 'assets/puzzlepiece_template.png'. Please ensure it's in the repo.");
    }
}

function exportMasterJSON() {
    const out = {}; out[currentStage] = stageMarkers.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
    const blob = new Blob([JSON.stringify(out, null, 4)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'puzzlepieces_data.json'; a.click();
}
