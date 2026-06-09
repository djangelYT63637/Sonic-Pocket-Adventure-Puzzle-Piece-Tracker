/* ==========================================================================
   SONIC POCKET ADVENTURE: PIECE TRACKER - DEFINITIVE ENGINE (v9.0)
   ========================================================================== */

// --- Configuration Constants ---
const REPO_NAME = 'Sonic-Pocket-Adventure-Puzzle-Piece-Tracker';
const STAGES = [
    "Neo South Island Act 1", "Neo South Island Act 2", "Secret Plant Act 1", "Secret Plant Act 2",
    "Cosmic Casino Act 1", "Cosmic Casino Act 2", "Aquatic Relix Act 1", "Aquatic Relix Act 2",
    "Sky Chase", "Aerobase", "Gigantic Angel Act 1", "Gigantic Angel Act 2", "Last Utopia"
];

// --- Engine State Management ---
let db = null;
let currentStage = STAGES[0];
let stageMarkers = [];     // Vector markers layout configuration
let collectedStates = {};  // User checkbox states tracked locally
let activeMapImage = new Image();

// Viewport Vector Coordinates
let zoom = 0.5;
let offsetX = 20;
let offsetY = 20;
let isDragging = false;
let startX = 0, startY = 0;
let initialPinchDistance = 0;

// Security Protocol Mode Status
let isAdminMode = false;

// DOM Cache Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const viewport = document.getElementById('viewport');
const levelMenu = document.getElementById('levelMenu');
const checklistGrid = document.getElementById('pieceChecklist');

/* ==========================================================================
   1. CORE INITIALIZATION & DATABASE STORAGE ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    evaluateSecurityAccessMode();
    initDatabase();
});

function evaluateSecurityAccessMode() {
    const urlParams = new URLSearchParams(window.location.search);
    isAdminMode = (urlParams.get('mode') === 'admin');
    
    // Toggle administration pipeline interface layouts dynamically
    const adminUIPanels = document.querySelectorAll('.admin-ui');
    adminUIPanels.forEach(panel => {
        panel.style.display = isAdminMode ? 'flex' : 'none';
    });
}

function initDatabase() {
    const dbRequest = indexedDB.open("SPA_Community_Tracker_DB", 2);

    dbRequest.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains("user_progress")) {
            database.createObjectStore("user_progress");
        }
        // Admin workspace cache parameters storage
        if (!database.objectStoreNames.contains("admin_assets")) {
            database.createObjectStore("admin_assets");
        }
    };

    dbRequest.onsuccess = (event) => {
        db = event.target.result;
        buildInterface();
    };

    dbRequest.onerror = () => {
        console.error("Database layer fault. Operating inside standard secure volatile memory.");
        buildInterface();
    };
}

/* ==========================================================================
   2. USER INTERACTIVE LAYER & NAVIGATION BUILDER
   ========================================================================== */

async function buildInterface() {
    levelMenu.innerHTML = '';
    STAGES.forEach(stageName => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.innerText = stageName;
        btn.setAttribute('data-stage', stageName);
        btn.onclick = () => loadStageData(stageName);
        levelMenu.appendChild(btn);
    });

    setupGestureListeners();
    setupGamepadPolling();
    await loadStageData(currentStage);
    updateGlobalCompletionBar();
}

async function loadStageData(stageName) {
    currentStage = stageName;

    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-stage') === stageName);
    });

    // Reset current transient coordinate map state arrays
    stageMarkers = [];

    // 1. Fetch system reference layouts dynamically out of GitHub Master JSON
    stageMarkers = await fetchStageMarkersFromJSON(stageName);
    stageMarkers.sort((a, b) => a.x - b.x);

    // 2. Load checked checkboxes context array indicators
    collectedStates = await fetchUserProgressFromDB(stageName);

    // 3. Normalized sanitized lower-case asset filename structures mapping
    const sanitizedStageName = stageName.toLowerCase().replace(/ /g, '-');
    const mapAssetPath = `./Maps/${sanitizedStageName}.png`;
    
    activeMapImage = new Image();
    activeMapImage.src = mapAssetPath;
    
    activeMapImage.onload = () => {
        canvas.width = activeMapImage.width;
        canvas.height = activeMapImage.height;
        resetViewCoordinates();
        renderMapMatrix();
    };

    activeMapImage.onerror = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 800;
        canvas.height = 400;
        ctx.fillStyle = "#000c22";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px 'Press Start 2P'";
        ctx.fillText(`MISSING ASSET: /Maps/${sanitizedStageName}.png`, 40, 200);
        buildChecklistUI();
    };
}

/* ==========================================================================
   3. MASTER STORAGE RETRIEVAL & WRITERS
   ========================================================================== */

async function fetchStageMarkersFromJSON(stageName) {
    try {
        const response = await fetch('./Assets/PuzzlePieces_Data.json');
        if (!response.ok) throw new Error("JSON file target offline");
        const globalData = await response.json();
        return globalData[stageName] || [];
    } catch (error) {
        console.warn("Public configuration JSON missing or running inside fresh admin context layout initializing arrays.");
        return []; 
    }
}

function fetchUserProgressFromDB(stageName) {
    return new Promise((resolve) => {
        if (!db) return resolve({});
        try {
            const transaction = db.transaction("user_progress", "readonly");
            const store = transaction.objectStore("user_progress");
            const request = store.get(stageName);
            request.onsuccess = () => resolve(request.result || {});
            request.onerror = () => resolve({});
        } catch (e) {
            resolve({});
        }
    });
}

function saveUserProgressToDB() {
    if (!db) return;
    const transaction = db.transaction("user_progress", "readwrite");
    const store = transaction.objectStore("user_progress");
    store.put(collectedStates, currentStage);
    updateGlobalCompletionBar();
}

function saveAdminAsset(key, fileBlob) {
    if (!db) return;
    const transaction = db.transaction("admin_assets", "readwrite");
    transaction.objectStore("admin_assets").put(fileBlob, key);
}

function getAdminAsset(key) {
    return new Promise((resolve) => {
        if (!db) return resolve(null);
        const transaction = db.transaction("admin_assets", "readonly");
        const request = transaction.objectStore("admin_assets").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

/* ==========================================================================
   4. INPUT MANAGEMENT MATRIX (TOUCH, MOUSE & GAMEPAD CONTROLLER)
   ========================================================================== */

function setupGestureListeners() {
    // --- Mouse Desktop Control Mapping Matrix ---
    viewport.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
    };

    window.onmouseup = () => { isDragging = false; };

    window.onmousemove = (e) => {
        if (!isDragging) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        applyViewportTransform();
    };

    viewport.onwheel = (e) => {
        e.preventDefault();
        const intensity = 0.15;
        const delta = e.deltaY > 0 ? (1 - intensity) : (1 + intensity);
        executeCalculatedZoom(delta, e.clientX, e.clientY);
    };

    // --- Smartphone Touch Panning & Multi-Touch Scaling Engine ---
    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - offsetX;
            startY = e.touches[0].clientY - offsetY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            initialPinchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isDragging) {
            offsetX = e.touches[0].clientX - startX;
            offsetY = e.touches[0].clientY - startY;
            applyViewportTransform();
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            const scaleFactor = currentDistance / initialPinchDistance;
            const boundedFactor = Math.min(Math.max(scaleFactor, 0.90), 1.10);
            
            executeCalculatedZoom(boundedFactor, midX, midY);
            initialPinchDistance = currentDistance;
        }
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
        isDragging = false;
        initialPinchDistance = 0;
    });

    // --- Core Canvas Pointer Tap Processing Systems ---
    canvas.onclick = (e) => {
        if (isDragging) return;
        const bounds = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - bounds.left) / zoom;
        const canvasY = (e.clientY - bounds.top) / zoom;

        const hitIndex = stageMarkers.findIndex(marker => {
            return canvasX >= marker.x && canvasX <= (marker.x + 15) &&
                   canvasY >= marker.y && canvasY <= (marker.y + 22);
        });

        if (hitIndex !== -1) {
            if (isAdminMode && e.shiftKey) {
                // Erase feature payload if shift-clicked inside developer admin console environment
                stageMarkers.splice(hitIndex, 1);
                renderMapMatrix();
            } else {
                togglePieceState(hitIndex);
            }
        } else if (isAdminMode) {
            // Drop manual marker pinpoint node seamlessly if blank space is clicked
            stageMarkers.push({ x: Math.round(canvasX - 7.5), y: Math.round(canvasY - 11) });
            stageMarkers.sort((a, b) => a.x - b.x);
            renderMapMatrix();
        }
    };
}

function executeCalculatedZoom(multiplier, focalX, focalY) {
    const targetZoom = Math.min(Math.max(0.1, zoom * multiplier), 10.0);
    const viewBounds = viewport.getBoundingClientRect();
    
    const relativeX = focalX - viewBounds.left - offsetX;
    const relativeY = focalY - viewBounds.top - offsetY;
    
    offsetX -= (relativeX * (targetZoom / zoom) - relativeX);
    offsetY -= (relativeY * (targetZoom / zoom) - relativeY);
    zoom = targetZoom;
    
    applyViewportTransform();
}

function applyViewportTransform() {
    canvas.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0px) scale(${zoom})`;
}

function resetViewCoordinates() {
    zoom = window.innerHeight > window.innerWidth ? 0.35 : 0.6;
    offsetX = 30;
    offsetY = 30;
    applyViewportTransform();
}

// --- Console Control Mapping Architecture (Gamepad Navigation API) ---
function setupGamepadPolling() {
    window.addEventListener("gamepadconnected", () => {
        console.log("Controller mapping recognized successfully.");
        tickGamepadStateLoop();
    });
}

function tickGamepadStateLoop() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gamepads[0];
    
    if (pad) {
        // Left Analog Stick Controls Viewport Pan Translation Logic Directionals
        const deadzone = 0.15;
        const speed = 8;
        
        if (Math.abs(pad.axes[0]) > deadzone) offsetX -= pad.axes[0] * speed;
        if (Math.abs(pad.axes[1]) > deadzone) offsetY -= pad.axes[1] * speed;
        
        // Triggers Manage Dynamic Zoom Modifiers (Right/Left Trigger Action)
        if (pad.buttons[7] && pad.buttons[7].value > 0.1) zoom *= 1.03; // RT Zoom In
        if (pad.buttons[6] && pad.buttons[6].value > 0.1) zoom *= 0.97; // LT Zoom Out

        applyViewportTransform();
    }
    requestAnimationFrame(tickGamepadStateLoop);
}

/* ==========================================================================
   5. GRAPHICS LAYER & PIXEL DRAW ENGINE
   ========================================================================== */

function renderMapMatrix() {
    if (!activeMapImage.complete || activeMapImage.width === 0) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(activeMapImage, 0, 0);

    stageMarkers.forEach((marker, index) => {
        const isCollected = !!collectedStates[index];
        
        ctx.lineWidth = 3;
        ctx.strokeStyle = isCollected ? '#444444' : '#00ff41';
        ctx.strokeRect(marker.x, marker.y, 15, 22);

        if (isCollected) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillRect(marker.x, marker.y, 15, 22);
        }
        
        if (isAdminMode) {
            // Render index numbering elements context to streamline master evaluation checkouts
            ctx.fillStyle = '#ffe700';
            ctx.font = "7px 'Press Start 2P'";
            ctx.fillText(index + 1, marker.x, marker.y - 4);
        }
    });

    buildChecklistUI();
}

/* ==========================================================================
   6. CHECKLIST PROCESSING & METRIC SYNCHRONIZERS
   ========================================================================== */

function buildChecklistUI() {
    checklistGrid.innerHTML = '';
    
    stageMarkers.forEach((marker, index) => {
        const isCollected = !!collectedStates[index];
        const item = document.createElement('div');
        item.className = `check-item ${isCollected ? 'collected' : ''}`;
        item.innerText = `#${index + 1}`;

        item.onclick = (e) => {
            e.stopPropagation();
            teleportToPieceVector(marker);
        };

        item.oncontextmenu = (e) => {
            e.preventDefault();
            if (isAdminMode && e.shiftKey) {
                stageMarkers.splice(index, 1);
                renderMapMatrix();
            } else {
                togglePieceState(index);
            }
        };
        
        item.addEventListener('dblclick', () => togglePieceState(index));

        // Touch long-press simulation proxy framework mapping
        let pressTimer;
        item.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => { togglePieceState(index); }, 600);
        }, { passive: true });
        item.addEventListener('touchend', () => clearTimeout(pressTimer));

        checklistGrid.appendChild(item);
    });

    updateStageProgressBars();
}

function togglePieceState(index) {
    collectedStates[index] = !collectedStates[index];
    saveUserProgressToDB();
    renderMapMatrix();
}

function teleportToPieceVector(marker) {
    zoom = 2.5;
    offsetX = (viewport.offsetWidth / 2) - ((marker.x + 7.5) * zoom);
    offsetY = (viewport.offsetHeight / 2) - ((marker.y + 11) * zoom);
    applyViewportTransform();
}

/* ==========================================================================
   7. REAL-TIME STATISTICAL ANALYTICS
   ========================================================================== */

function updateStageProgressBars() {
    const totalStageCount = stageMarkers.length;
    let collectedStageCount = 0;
    
    stageMarkers.forEach((_, index) => {
        if (!!collectedStates[index]) collectedStageCount++;
    });

    const percentage = totalStageCount ? Math.round((collectedStageCount / totalStageCount) * 100) : 0;
    document.getElementById('stagePerc').innerText = `${percentage}%`;
    document.getElementById('stageFill').style.width = `${percentage}%`;
}

async function updateGlobalCompletionBar() {
    let globalTotalPieces = 0;
    let globalCollectedPieces = 0;

    for (const stage of STAGES) {
        const markersList = await fetchStageMarkersFromJSON(stage);
        const progressMap = await fetchUserProgressFromDB(stage);

        globalTotalPieces += markersList.length;
        markersList.forEach((_, index) => {
            if (!!progressMap[index]) globalCollectedPieces++;
        });
    }

    const globalPercentage = globalTotalPieces ? Math.round((globalCollectedPieces / globalTotalPieces) * 100) : 0;
    document.getElementById('totalStats').innerText = `${globalCollectedPieces}/${globalTotalPieces} (${globalPercentage}%)`;
    document.getElementById('totalFill').style.width = `${globalPercentage}%`;
}

/* ==========================================================================
   8. ADMIN EXCLUSIVE SUITE PIPELINES (AUTOMATIC 100% MATCH SCANNER)
   ========================================================================== */

async function executionTemplateAutomatedScan() {
    const templateInput = document.getElementById('adminTemplateFileInput');
    if (!templateInput.files.length) return alert("Upload template piece (.png) sequence marker element first!");
    
    const templateImg = await resolveImageAsyncLoader(URL.createObjectURL(templateInput.files[0]));
    const templatePixels = extractPixelColorGridBuffer(templateImg);
    
    // Scan direct context off image data dimensions
    const mapWidth = canvas.width;
    const mapHeight = canvas.height;
    const mapDataBuffer = ctx.getImageData(0, 0, mapWidth, mapHeight).data;

    // Execute standard mathematical scanning convolution arrays
    for (let y = 0; y < mapHeight - 22; y += 1) {
        for (let x = 0; x < mapWidth - 15; x += 1) {
            let isExactMatch = true;
            
            for (let p of templatePixels) {
                const targetPixelIdx = ((y + p.y) * mapWidth + (x + p.x)) * 4;
                if (mapDataBuffer[targetPixelIdx] !== p.r || 
                    mapDataBuffer[targetPixelIdx + 1] !== p.g || 
                    mapDataBuffer[targetPixelIdx + 2] !== p.b) {
                    isExactMatch = false;
                    break;
                }
            }

            if (isExactMatch) {
                const isDuplicate = stageMarkers.some(m => Math.abs(m.x - x) < 6 && Math.abs(m.y - y) < 6);
                if (!isDuplicate) {
                    stageMarkers.push({ x: x, y: y });
                }
            }
        }
    }

    stageMarkers.sort((a, b) => a.x - b.x);
    renderMapMatrix();
    alert("Scan matrix operation concluded successfully. Check matching arrays.");
}

async function exportSystemMasterJSON() {
    const compiledOutput = {};
    for (const stage of STAGES) {
        if (stage === currentStage) {
            compiledOutput[stage] = stageMarkers.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
        } else {
            const saved = await fetchStageMarkersFromJSON(stage);
            compiledOutput[stage] = saved.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) }));
        }
    }
    
    const dataBlob = new Blob([JSON.stringify(compiledOutput, null, 4)], { type: 'application/json' });
    const temporaryLink = document.createElement('a');
    temporaryLink.href = URL.createObjectURL(dataBlob);
    temporaryLink.download = 'PuzzlePieces_Data.json';
    temporaryLink.click();
}

function extractPixelColorGridBuffer(imgElement) {
    const bufferCanvas = document.createElement('canvas');
    bufferCanvas.width = imgElement.width;
    bufferCanvas.height = imgElement.height;
    const bufferCtx = bufferCanvas.getContext('2d');
    bufferCtx.drawImage(imgElement, 0, 0);
    
    const rawData = bufferCtx.getImageData(0, 0, imgElement.width, imgElement.height).data;
    const pointArray = [];
    
    for (let i = 0; i < rawData.length; i += 4) {
        if (rawData[i + 3] > 220) { // Discard alpha-transparent backgrounds logic
            const idx = i / 4;
            pointArray.push({
                x: idx % imgElement.width,
                y: Math.floor(idx / imgElement.width),
                r: rawData[i],
                g: rawData[i + 1],
                b: rawData[i + 2]
            });
        }
    }
    return pointArray;
}

function resolveImageAsyncLoader(sourceString) {
    return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = sourceString; });
}

// --- Dynamic Utility Linkage ---
window.triggerAdminInput = (id) => document.getElementById(id).click();
window.zoomToPiece = (idx) => { if (idx === -1) resetViewCoordinates(); };
