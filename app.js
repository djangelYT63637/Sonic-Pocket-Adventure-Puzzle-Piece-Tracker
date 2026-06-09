/* ==========================================================================
   SONIC POCKET ADVENTURE: PIECE TRACKER - DEFINITIVE ENGINE (v8.0)
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
let stageMarkers = [];     // Raw static positions from master JSON data
let collectedStates = {};  // User checkmarks stored locally: { "index": true/false }
let activeMapImage = new Image();

// Viewport Zoom & Translation Vectors
let zoom = 0.5;
let offsetX = 20;
let offsetY = 20;
let isDragging = false;
let startX = 0, startY = 0;
let initialPinchDistance = 0;

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
    initDatabase();
});

function initDatabase() {
    // Open specialized IndexedDB instance matching the GitHub project architecture
    const dbRequest = indexedDB.open("SPA_Community_Tracker_DB", 1);

    dbRequest.onupgradeneeded = (event) => {
        const database = event.target.result;
        // Store personal checklist flags per level
        if (!database.objectStoreNames.contains("user_progress")) {
            database.createObjectStore("user_progress");
        }
    };

    dbRequest.onsuccess = (event) => {
        db = event.target.result;
        buildInterface();
    };

    dbRequest.onerror = () => {
        console.error("Local database initialization crashed. Progress will run in-memory fallback mode.");
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
    // Default boot setup loading the initial zone layout
    await loadStageData(currentStage);
    updateGlobalCompletionBar();
}

async function loadStageData(stageName) {
    currentStage = stageName;

    // Toggle CSS Active states elegantly across the grid UI elements
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-stage') === stageName);
    });

    // 1. Fetch fixed piece vector locations from master JSON and sort Left-To-Right
    stageMarkers = await fetchStageMarkersFromJSON(stageName);
    stageMarkers.sort((a, b) => a.x - b.x);

    // 2. Load personal checked storage map metrics out of local IndexedDB memory
    collectedStates = await fetchUserProgressFromDB(stageName);

    // 3. Request background asset dynamically map routing path from repository system
    const mapAssetPath = `./Maps/${encodeURIComponent(stageName)}.png`;
    
    activeMapImage = new Image();
    activeMapImage.src = mapAssetPath;
    
    activeMapImage.onload = () => {
        canvas.width = activeMapImage.width;
        canvas.height = activeMapImage.height;
        resetViewCoordinates();
        renderMapMatrix();
    };

    activeMapImage.onerror = () => {
        // Fallback placeholder rendering frame logic if map resource yields 404 tracking links
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 400;
        canvas.height = 300;
        ctx.fillStyle = "#000c22";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "8px 'Press Start 2P'";
        ctx.fillText("MAP NOT DETECTED IN /Maps/", 20, 150);
        buildChecklistUI();
    };
}

/* ==========================================================================
   3. MASTER REPOSITORY DATA LOADERS
   ========================================================================== */

async function fetchStageMarkersFromJSON(stageName) {
    try {
        // Grabs master vector coordinates sheet template configuration dynamically out of Assets tree
        const response = await fetch('./Assets/PuzzlePieces_Data.json');
        if (!response.ok) throw new Error("JSON asset fetch mismatch context");
        const globalData = await response.json();
        return globalData[stageName] || [];
    } catch (error) {
        console.warn(`Master compilation database read error. Reverting structural arrays...`);
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

/* ==========================================================================
   4. HARDWARE-ACCELERATED INPUT GESTURE STREAM ENGINE
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
        const zoomIntensity = 0.12;
        const delta = e.deltaY > 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);
        executeCalculatedZoom(delta, e.clientX, e.clientY);
    };

    // --- Smartphone Touch Gesture Tracking Array ---
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
            e.preventDefault(); // Prevents modern elastic frame bouncing issues while pinch scaling
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            const scaleFactor = currentDistance / initialPinchDistance;
            // Dampen scale velocity multiplier limits dynamically
            const boundedFactor = Math.min(Math.max(scaleFactor, 0.92), 1.08);
            
            executeCalculatedZoom(boundedFactor, midX, midY);
            initialPinchDistance = currentDistance;
        }
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
        isDragging = false;
        initialPinchDistance = 0;
    });

    // --- Core Canvas Pointer Tap Context Selection ---
    canvas.onclick = (e) => {
        const bounds = canvas.getBoundingClientRect();
        // Convert screen pixel elements space backward past modern linear translation calculations
        const canvasX = (e.clientX - bounds.left) / zoom;
        const canvasY = (e.clientY - bounds.top) / zoom;

        // Trace bounding-box interactions across custom standard template measurements (15x22 pixels)
        const hitIndex = stageMarkers.findIndex(marker => {
            return canvasX >= marker.x && canvasX <= (marker.x + 15) &&
                   canvasY >= marker.y && canvasY <= (marker.y + 22);
        });

        if (hitIndex !== -1) {
            togglePieceState(hitIndex);
        }
    };
}

function executeCalculatedZoom(multiplier, focalX, focalY) {
    const targetZoom = Math.min(Math.max(0.15, zoom * multiplier), 8.0);
    const viewBounds = viewport.getBoundingClientRect();
    
    // Scale tracking shifts smoothly into mouse focal origin targets
    const relativeX = focalX - viewBounds.left - offsetX;
    const relativeY = focalY - viewBounds.top - offsetY;
    
    offsetX -= (relativeX * (targetZoom / zoom) - relativeX);
    offsetY -= (relativeY * (targetZoom / zoom) - relativeY);
    zoom = targetZoom;
    
    applyViewportTransform();
}

function applyViewportTransform() {
    // Utilize lightning fast GPU composite acceleration metrics
    canvas.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0px) scale(${zoom})`;
}

function resetViewCoordinates() {
    zoom = window.innerHeight > window.innerWidth ? 0.35 : 0.6;
    offsetX = 25;
    offsetY = 20;
    applyViewportTransform();
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
        ctx.strokeStyle = isCollected ? '#444444' : '#00ff41'; // Color coded dark gray vs vibrant emerald green
        ctx.strokeRect(marker.x, marker.y, 15, 22);

        if (isCollected) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; // Pixel dimming overlay layer
            ctx.fillRect(marker.x, marker.y, 15, 22);
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

        // Standard Click Handler: Automatically pans camera directly to selected target piece bounds
        item.onclick = (e) => {
            e.stopPropagation();
            teleportToPieceVector(marker);
        };

        // Right-Click (Desktop) or Long Press/Double Tap (Mobile Platform) Toggles State
        item.oncontextmenu = (e) => {
            e.preventDefault();
            togglePieceState(index);
        };
        
        // Secondary standard alternate activation mapping triggers for streamlined convenience
        item.addEventListener('dblclick', () => togglePieceState(index));

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
    zoom = 2.5; // Precise targeted tracking zoom factor
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

// --- GLOBAL EXPOSED INTERACTION PIPELINES (HTML LINKED UI OPERATIONS) ---
window.zoomToPiece = (idx) => { if (idx === -1) resetViewCoordinates(); };

