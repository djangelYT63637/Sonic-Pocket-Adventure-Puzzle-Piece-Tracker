/* ==========================================================================
   SONIC POCKET ADVENTURE: PIECE TRACKER - UNIVERSAL CONFORMITY ENGINE v1.0
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

// Engine Core Context Properties Matrix
let db = null, currentStage = STAGES[0], stageMarkers = [], collectedStates = {};
let zoom = 0.5, offsetX = 0, offsetY = 0, isDragging = false, startX = 0, startY = 0, initialPinchDist = 0;
let isAdminMode = new URLSearchParams(window.location.search).get('mode') === 'admin';
let globalActiveMapImage = null;

// Hardware Controller Matrix
let controllerFocusTarget = "stages";
let focusedStageIndex = 0;
let focusedChecklistIndex = 0;
let lastButtonState = {};
let gamepadDebounceTimeout = 0;

let canvas, ctx, viewport, levelMenu, checklistGrid;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('canvas');
    if (canvas) ctx = canvas.getContext('2d');
    viewport = document.getElementById('viewport');
    levelMenu = document.getElementById('levelMenu');
    checklistGrid = document.getElementById('pieceChecklist');

    document.querySelectorAll('.admin-ui').forEach(el => el.style.display = isAdminMode ? 'flex' : 'none');
    
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
    STAGES.forEach((stg, idx) => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.id = `stage-btn-${idx}`;
        btn.innerText = stg;
        btn.onclick = () => { focusedStageIndex = idx; loadStageData(stg); };
        levelMenu.appendChild(btn);
    });
    setupGestureListeners();
    setupGamepadSystem();
    loadStageData(currentStage);
}

async function loadStageData(stageName) {
    currentStage = stageName;
    document.querySelectorAll('.level-btn').forEach(b => b.classList.toggle('active', b.innerText === stageName));

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
            // 🔄 PATHWAY ROUTING UPDATE: Points directly into assets/data/ folder
            const res = await fetch(`${BASE_PATH}assets/data/puzzlepieces_data.json`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            stageMarkers = data[stageName] || [];
        } catch (e) { 
            stageMarkers = []; 
        }
    }
    stageMarkers.sort((a, b) => a.x - b.x);

    collectedStates = await new Promise(r => {
        if (!db) return r({});
        const req = db.transaction("user_progress", "readonly").objectStore("user_progress").get(stageName);
        req.onsuccess = () => r(req.result || {});
        req.onerror = () => r({});
    });

    const fileName = MAP_FILES[stageName];
    // 🔄 PATHWAY ROUTING UPDATE: Points directly into assets/maps/ folder
    const targetSrcURL = `${BASE_PATH}assets/maps/${fileName}?t=${new Date().getTime()}`;
    
    const imgWorker = new Image();
    
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
            ctx.fillText("IMAGE ASSET OFFLINE RETRIEVAL ENGINE BLOCK TRAVELED", 20, 50);
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
        item.id = `check-item-${idx}`;
        item.innerText = `#${idx + 1}`;
        item.onclick = (e) => {
            e.stopPropagation();
            focusedChecklistIndex = idx;
            controllerFocusTarget = "checklist";
            focusTargetItem();
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
    if (stagePercEl) stagePercEl.innerText = `${stagePerc}% [${currentCollected}/${stageMarkers.length}]`;
    if (stageFillEl) stageFillEl.style.width = `${stagePerc}%`;
    
    await calculateGlobalTotals(currentCollected);
    focusTargetItem();
}

async function calculateGlobalTotals(activeCollectedCount) {
    if (!db) return;

    let totalPieces = 0;
    let totalCollected = 0;

    let fallbackBlueprintData = {};
    try {
        // 🔄 PATHWAY ROUTING UPDATE: Points directly into assets/data/ folder
        const res = await fetch(`${BASE_PATH}assets/data/puzzlepieces_data.json`);
        if (res.ok) {
            fallbackBlueprintData = await res.json();
        }
    } catch (e) {
        fallbackBlueprintData = {};
    }

    const tx = db.transaction(["user_progress", "admin_coordinates"], "readonly");
    const progressStore = tx.objectStore("user_progress");
    const coordsStore = tx.objectStore("admin_coordinates");

    for (const stg of STAGES) {
        let stgTotal = 0;
        let stgCollected = 0;

        const coordResult = await new Promise(resolve => {
            const req = coordsStore.get(stg);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });

        if (coordResult) {
            stgTotal = coordResult.length;
        } else if (stg === currentStage) {
            stgTotal = stageMarkers.length;
        } else if (fallbackBlueprintData[stg]) {
            stgTotal = fallbackBlueprintData[stg].length;
        }

        const progressResult = await new Promise(resolve => {
            const req = progressStore.get(stg);
            req.onsuccess = () => resolve(req.result || {});
            req.onerror = () => resolve({});
        });

        if (stg === currentStage) {
            stgCollected = activeCollectedCount;
        } else {
            for (let k in progressResult) {
                if (progressResult[k]) stgCollected++;
            }
        }

        totalPieces += stgTotal;
        totalCollected += stgCollected;
    }

    const globalPerc = totalPieces ? Math.round((totalCollected / totalPieces) * 100) : 0;
    const totalStatsEl = document.getElementById('totalStats');
    const totalFillEl = document.getElementById('totalFill');
    
    if (totalStatsEl) totalStatsEl.innerText = `${globalPerc}% [${totalCollected}/${totalPieces}]`;
    if (totalFillEl) totalFillEl.style.width = `${globalPerc}%`;
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
            
            if (isAdminMode) {
                const clickedExistingPiece = stageMarkers.findIndex(m => cx >= m.x && cx <= (m.x + 15) && cy >= m.y && cy <= (m.y + 22));
                if (clickedExistingPiece === -1) {
                    stageMarkers.push({ x: Math.round(cx - 7.5), y: Math.round(cy - 11) });
                    stageMarkers.sort((a, b) => a.x - b.x);
                    if (db) db.transaction("admin_coordinates", "readwrite").objectStore("admin_coordinates").put(stageMarkers, currentStage);
                    renderMap();
                    return;
                }
            }

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

function setupGamepadSystem() {
    window.addEventListener("gamepadconnected", (event) => {
        const loop = () => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const gp = gamepads[0];
            if (!gp) return requestAnimationFrame(loop);

            if (Math.abs(gp.axes[0]) > 0.18) offsetX -= gp.axes[0] * 8;
            if (Math.abs(gp.axes[1]) > 0.18) offsetY -= gp.axes[1] * 8;
            if (Math.abs(gp.axes[3]) > 0.18) {
                const cX = viewport ? viewport.offsetWidth / 2 : window.innerWidth / 2;
                const cY = viewport ? viewport.offsetHeight / 2 : window.innerHeight / 2;
                zoomCalc(gp.axes[3] > 0 ? 0.96 : 1.04, cX, cY);
            }

            let standardMappingSOUTH = 0; 
            let standardMappingEAST = 1;

            if (gp.id.includes("ic-Con") || gp.id.includes("Nintendo") || gp.id.includes("Switch")) {
                standardMappingSOUTH = 1; 
                standardMappingEAST = 0;
            }

            const now = Date.now();
            if (now > gamepadDebounceTimeout) {
                if (gp.buttons[12]?.pressed) { 
                    controllerFocusTarget = "stages";
                    focusedStageIndex = (focusedStageIndex - 1 + STAGES.length) % STAGES.length;
                    focusTargetItem(); gamepadDebounceTimeout = now + 130;
                } else if (gp.buttons[13]?.pressed) { 
                    controllerFocusTarget = "stages";
                    focusedStageIndex = (focusedStageIndex + 1) % STAGES.length;
                    focusTargetItem(); gamepadDebounceTimeout = now + 130;
                } else if (gp.buttons[14]?.pressed) { 
                    if (stageMarkers.length) {
                        controllerFocusTarget = "checklist";
                        focusedChecklistIndex = (focusedChecklistIndex - 1 + stageMarkers.length) % stageMarkers.length;
                        focusTargetItem(); triggerChecklistTeleport();
                    }
                    gamepadDebounceTimeout = now + 130;
                } else if (gp.buttons[15]?.pressed) { 
                    if (stageMarkers.length) {
                        controllerFocusTarget = "checklist";
                        focusedChecklistIndex = (focusedChecklistIndex + 1) % stageMarkers.length;
                        focusTargetItem(); triggerChecklistTeleport();
                    }
                    gamepadDebounceTimeout = now + 130;
                }
            }

            if (gp.buttons[standardMappingSOUTH].pressed && !lastButtonState[standardMappingSOUTH]) {
                if (controllerFocusTarget === "stages") {
                    loadStageData(STAGES[focusedStageIndex]);
                } else if (controllerFocusTarget === "checklist" && stageMarkers.length) {
                    togglePiece(focusedChecklistIndex);
                }
            }
            
            if (gp.buttons[3].pressed && !lastButtonState[3]) { 
                centerMapInViewport();
            }

            lastButtonState[standardMappingSOUTH] = gp.buttons[standardMappingSOUTH].pressed;
            lastButtonState[3] = gp.buttons[3].pressed;

            applyTransform();
            requestAnimationFrame(loop);
        };
        loop();
    });
}

function focusTargetItem() {
    document.querySelectorAll('.level-btn, .check-item').forEach(el => el.classList.remove('gamepad-focused'));
    if (controllerFocusTarget === "stages") {
        const target = document.getElementById(`stage-btn-${focusedStageIndex}`);
        if (target) { target.classList.add('gamepad-focused'); target.scrollIntoView({ block: 'nearest' }); }
    } else {
        const target = document.getElementById(`check-item-${focusedChecklistIndex}`);
        if (target) { target.classList.add('gamepad-focused'); target.scrollIntoView({ block: 'nearest' }); }
    }
}

function triggerChecklistTeleport() {
    if (focusedChecklistIndex < 0 || focusedChecklistIndex >= stageMarkers.length || !viewport) return;
    const m = stageMarkers[focusedChecklistIndex];
    zoom = 2.5;
    offsetX = (viewport.offsetWidth / 2) - ((m.x + 7.5) * zoom);
    offsetY = (viewport.offsetHeight / 2) - ((m.y + 11) * zoom);
    applyTransform();
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

async function runAutoScanner() {
    if (!isAdminMode) return;
    try {
        // 🔄 PATHWAY ROUTING UPDATE: Points directly into assets/images/ folder
        const templateURL = `${BASE_PATH}assets/images/puzzle-piece.png`;
        const res = await fetch(templateURL);
        if(!res.ok) throw new Error("Template image 'assets/images/puzzle-piece.png' not found.");

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
        alert("Automated scan parsing matrix complete.");
    } catch(err) {
        alert(err.message);
    }
}

async function exportMasterJSON() {
    if (!db) return alert("Storage engine not fully mounted yet.");
    
    const masterExportObject = {};
    let fallbackCounter = 0;
    
    const tx = db.transaction("admin_coordinates", "readonly");
    const coordsStore = tx.objectStore("admin_coordinates");

    STAGES.forEach(stg => {
        const req = coordsStore.get(stg);
        req.onsuccess = () => {
            if (req.result && req.result.length > 0) {
                masterExportObject[stg] = req.result.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
            } else if (stg === currentStage && stageMarkers.length > 0) {
                masterExportObject[stg] = stageMarkers.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
            } else {
                masterExportObject[stg] = [];
            }
            
            fallbackCounter++;
            if (fallbackCounter === STAGES.length) {
                const blob = new Blob([JSON.stringify(masterExportObject, null, 4)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'puzzlepieces_data.json';
                a.click();
            }
        };
        
        req.onerror = () => {
            fallbackCounter++;
            if (fallbackCounter === STAGES.length) {
                alert("An error occurred trying to extract deep tracking datasets.");
            }
        };
    });
}