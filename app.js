// Application State
let loadedImages = []; // Array of image metadata objects
let gridSlots = Array(9).fill(null); // Individual slot state: null or {imageId, zoom, cx, cy}
let gridGroups = []; // Array of group objects: {id, indices:[], imageId, zoom, cx, cy}
let currentMode = 'arrange'; // 'arrange' (move/swap slots) or 'crop' (pan/zoom)
let selectedLibraryImageId = null; // Stored image ID for click-to-select and click-to-place fallback

// Undo Stack State
let undoStack = [];
const MAX_UNDO_STACK_SIZE = 15;

// Grouping Selection Mode State
let isGroupSelectionMode = false;
let selectedSlotIndices = [];

// DOM Elements
const imageUpload = document.getElementById('imageUpload');
const imageLibrary = document.getElementById('imageLibrary');
const libraryEmpty = document.getElementById('libraryEmpty');
const imageCount = document.getElementById('imageCount');
const gridCanvas = document.getElementById('gridCanvas');
const btnRandom = document.getElementById('btnRandom');
const btnClear = document.getElementById('btnClear');
const btnSave = document.getElementById('btnSave');
const btnUndo = document.getElementById('btnUndo');
const modeArrange = document.getElementById('modeArrange');
const modeCrop = document.getElementById('modeCrop');
const toggleFilenames = document.getElementById('toggleFilenames');
const btnGroupMode = document.getElementById('btnGroupMode');
const groupSelectionActions = document.getElementById('groupSelectionActions');
const btnCancelGroup = document.getElementById('btnCancelGroup');
const btnConfirmGroup = document.getElementById('btnConfirmGroup');

// Initialize Application
function init() {
  setupUploadListeners();
  setupGridListeners();
  setupControlListeners();
  renderGrid();
  setMode('arrange'); // Default mode on load

  // Filename switch toggle listener
  const updateFilenameVisibility = () => {
    if (toggleFilenames.checked) {
      gridCanvas.classList.add('show-filenames');
    } else {
      gridCanvas.classList.remove('show-filenames');
    }
  };
  toggleFilenames.addEventListener('change', updateFilenameVisibility);
  updateFilenameVisibility();

  // Keyboard Undo Shortcut (Cmd+Z or Ctrl+Z)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  });
}

// Undo Stack Management
function saveStateToUndoStack() {
  const stateToSave = {
    gridSlots: JSON.parse(JSON.stringify(gridSlots)),
    gridGroups: JSON.parse(JSON.stringify(gridGroups))
  };
  
  if (undoStack.length > 0) {
    const lastSaved = undoStack[undoStack.length - 1];
    if (JSON.stringify(lastSaved) === JSON.stringify(stateToSave)) {
      return; // Skip duplicate state
    }
  }

  undoStack.push(stateToSave);
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
  updateUndoButtonState();
}

function updateUndoButtonState() {
  if (btnUndo) {
    btnUndo.disabled = undoStack.length === 0;
  }
}

function undo() {
  if (undoStack.length === 0) return;
  const prevState = undoStack.pop();
  gridSlots = prevState.gridSlots;
  gridGroups = prevState.gridGroups;
  renderGrid();
  updateLibraryUI();
  updateUndoButtonState();
}

// 1. Upload Section
function setupUploadListeners() {
  imageUpload.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    imageUpload.value = ''; // Reset to allow same file uploading
  });

  // Support drag & drop files directly onto the sidebar
  const sidebar = document.querySelector('.sidebar');
  sidebar.addEventListener('dragover', (e) => {
    e.preventDefault();
    sidebar.classList.add('drag-over-sidebar');
  });

  sidebar.addEventListener('dragleave', () => {
    sidebar.classList.remove('drag-over-sidebar');
  });

  sidebar.addEventListener('drop', (e) => {
    e.preventDefault();
    sidebar.classList.remove('drag-over-sidebar');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });
}

function handleFiles(files) {
  const imageFiles = Array.from(files).filter(file => 
    file.type === 'image/jpeg' || file.type === 'image/jpg'
  );

  if (imageFiles.length === 0) {
    alert('Please load JPEG files (.jpg or .jpeg) only.');
    return;
  }

  imageFiles.forEach(file => {
    const objectURL = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const imgObj = {
        id: 'img-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        file: file,
        url: objectURL, // ObjectURL (fast pointer, not base64!)
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspectRatio: img.naturalWidth / img.naturalHeight
      };
      loadedImages.push(imgObj);
      updateLibraryUI();
    };
    img.src = objectURL;
  });
}

function updateLibraryUI() {
  if (loadedImages.length === 0) {
    libraryEmpty.classList.remove('hidden');
    imageLibrary.classList.add('hidden');
    imageCount.textContent = '0 photos';
    return;
  }

  libraryEmpty.classList.add('hidden');
  imageLibrary.classList.remove('hidden');
  imageCount.textContent = `${loadedImages.length} photo${loadedImages.length > 1 ? 's' : ''}`;

  imageLibrary.innerHTML = '';
  loadedImages.forEach(imgObj => {
    const thumb = document.createElement('div');
    thumb.className = 'library-thumb';
    thumb.setAttribute('draggable', 'true');
    thumb.dataset.imageId = imgObj.id;

    // Visual indicator if photo is used in the grid
    const isUsed = gridSlots.some(slot => slot && slot.imageId === imgObj.id) || 
                   gridGroups.some(group => group.imageId === imgObj.id);
    if (isUsed) {
      thumb.classList.add('is-placed');
    }

    // Highlight if selected for click-to-place fallback
    if (selectedLibraryImageId === imgObj.id) {
      thumb.classList.add('is-selected');
    }

    const img = document.createElement('img');
    img.src = imgObj.url;
    img.alt = imgObj.file.name;
    img.draggable = false; // Prevent Firefox from dragging image element instead of parent thumb div
    thumb.appendChild(img);

    // Native Drag start
    thumb.addEventListener('dragstart', (e) => {
      const data = { type: 'library', id: imgObj.id };
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
      thumb.style.opacity = '0.5';
      gridCanvas.classList.add('dragging-active');
      setTemporaryDraggability(false);
    });

    thumb.addEventListener('dragend', () => {
      thumb.style.opacity = '1';
      gridCanvas.classList.remove('dragging-active');
      setTemporaryDraggability(true);
    });

    // Click-to-select fallback listener
    thumb.addEventListener('click', () => {
      if (selectedLibraryImageId === imgObj.id) {
        selectedLibraryImageId = null; // Deselect
      } else {
        selectedLibraryImageId = imgObj.id; // Select
      }
      updateLibraryUI();
    });

    imageLibrary.appendChild(thumb);
  });
}

// Helper to determine if a slot index belongs to any group
function getSlotGroup(index) {
  return gridGroups.find(g => g.indices.includes(index)) || null;
}

// 2. Drag & Drop & Swap Grid Mechanism
function setupGridListeners() {
  const slots = document.querySelectorAll('.grid-slot');

  slots.forEach(slotDom => {
    const index = parseInt(slotDom.dataset.index);

    // Drag Enter / Over
    slotDom.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slotDom.classList.add('drag-over');
    });

    slotDom.addEventListener('dragleave', () => {
      slotDom.classList.remove('drag-over');
    });

    // Drop Item in Grid Slot
    slotDom.addEventListener('drop', (e) => {
      e.preventDefault();
      slotDom.classList.remove('drag-over');
      gridCanvas.classList.remove('dragging-active');
      setTemporaryDraggability(true);

      try {
        const rawData = e.dataTransfer.getData('text/plain');
        if (!rawData) return;
        const data = JSON.parse(rawData);

        if (data.type === 'library') {
          // Dropped from Sidebar
          placeImageInSlot(data.id, index);
        } else if (data.type === 'grid-slot') {
          // Dropped from another grid slot (SWAP)
          const sourceIndex = parseInt(data.id);
          if (sourceIndex !== index) {
            swapGridSlots(sourceIndex, index);
          }
        }
      } catch (err) {
        console.error('Error parsing drag-and-drop data:', err);
      }
    });

    // Native Drag Start for reordering
    slotDom.addEventListener('dragstart', (e) => {
      if (currentMode !== 'arrange') {
        e.preventDefault();
        return;
      }
      const data = { type: 'grid-slot', id: index.toString() };
      e.dataTransfer.setData('text/plain', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'move';
      slotDom.classList.add('dragging-grid-source');
      gridCanvas.classList.add('dragging-active');
      
      // Once drag has started, temporarily disable draggable on all slots
      // so they act purely as standard drop targets.
      setTimeout(() => {
        setTemporaryDraggability(false);
      }, 0);
    });

    slotDom.addEventListener('dragend', () => {
      slotDom.classList.remove('dragging-grid-source');
      gridCanvas.classList.remove('dragging-active');
      setTemporaryDraggability(true);
    });

    // Click-to-place fallback listener & Grouping selection listener
    slotDom.addEventListener('click', (e) => {
      if (isGroupSelectionMode) {
        // Toggle selection inside Grouping selection mode
        if (selectedSlotIndices.includes(index)) {
          selectedSlotIndices = selectedSlotIndices.filter(idx => idx !== index);
          slotDom.classList.remove('group-selected');
        } else {
          // Check if this slot already belongs to another group
          if (getSlotGroup(index)) {
            alert('This square is already part of another group. Please ungroup it first.');
            return;
          }
          selectedSlotIndices.push(index);
          slotDom.classList.add('group-selected');
        }
        return;
      }

      // Ignore click if it originated from controls overlay (zoom/delete/ungroup)
      if (e.target.closest('.slot-controls')) return;
      
      if (selectedLibraryImageId) {
        placeImageInSlot(selectedLibraryImageId, index);
        selectedLibraryImageId = null; // Clear selection after placing
      }
    });
  });
}

function placeImageInSlot(imageId, slotIndex) {
  saveStateToUndoStack();
  const group = getSlotGroup(slotIndex);
  if (group) {
    group.imageId = imageId;
    group.zoom = 1.0;
    group.cx = 0.5;
    group.cy = 0.5;
    group.pinned = false;
    // Rerender all cells in group
    group.indices.forEach(idx => renderGridSlot(idx));
  } else {
    gridSlots[slotIndex] = {
      imageId: imageId,
      zoom: 1.0,
      cx: 0.5,
      cy: 0.5,
      pinned: false
    };
    renderGridSlot(slotIndex);
  }
  updateLibraryUI();
}

function swapGridSlots(idxA, idxB) {
  saveStateToUndoStack();
  const groupA = getSlotGroup(idxA);
  const groupB = getSlotGroup(idxB);

  // If in the same group, do nothing
  if (groupA && groupB && groupA.id === groupB.id) {
    return;
  }

  // Get state sources
  const stateA = groupA ? groupA : gridSlots[idxA];
  const stateB = groupB ? groupB : gridSlots[idxB];

  if (!stateA || !stateB) {
    // Moving image to an empty target
    const imgId = groupA ? groupA.imageId : (gridSlots[idxA] ? gridSlots[idxA].imageId : null);
    const zoom = groupA ? groupA.zoom : (gridSlots[idxA] ? gridSlots[idxA].zoom : 1.0);
    const cx = groupA ? groupA.cx : (gridSlots[idxA] ? gridSlots[idxA].cx : 0.5);
    const cy = groupA ? groupA.cy : (gridSlots[idxA] ? gridSlots[idxA].cy : 0.5);
    const pinned = groupA ? groupA.pinned : (gridSlots[idxA] ? gridSlots[idxA].pinned : false);

    if (groupB) {
      groupB.imageId = imgId;
      groupB.zoom = zoom;
      groupB.cx = cx;
      groupB.cy = cy;
      groupB.pinned = pinned;
    } else {
      gridSlots[idxB] = imgId ? { imageId: imgId, zoom, cx, cy, pinned } : null;
    }

    if (groupA) {
      groupA.imageId = null;
      groupA.pinned = false;
    } else {
      gridSlots[idxA] = null;
    }
  } else {
    // Swapping non-empty slot values
    const tempImgId = stateA.imageId;
    const tempZoom = stateA.zoom;
    const tempCx = stateA.cx;
    const tempCy = stateA.cy;
    const tempPinned = stateA.pinned || false;

    stateA.imageId = stateB.imageId;
    stateA.zoom = stateB.zoom;
    stateA.cx = stateB.cx;
    stateA.cy = stateB.cy;
    stateA.pinned = stateB.pinned || false;

    stateB.imageId = tempImgId;
    stateB.zoom = tempZoom;
    stateB.cx = tempCx;
    stateB.cy = tempCy;
    stateB.pinned = tempPinned;
  }

  // Rerender slot viewports
  if (groupA) {
    groupA.indices.forEach(idx => renderGridSlot(idx));
  } else {
    renderGridSlot(idxA);
  }

  if (groupB) {
    groupB.indices.forEach(idx => renderGridSlot(idx));
  } else {
    renderGridSlot(idxB);
  }

  updateLibraryUI();
}

// 3. Render Grid Slots
function renderGrid() {
  for (let i = 0; i < 9; i++) {
    renderGridSlot(i);
  }
}

function renderGridSlot(index) {
  const slotDom = document.querySelector(`.grid-slot[data-index="${index}"]`);
  
  // Reset slot states
  slotDom.innerHTML = '';
  slotDom.className = 'grid-slot';
  slotDom.classList.remove('group-selected');

  // Highlight if selected during active grouping selection mode
  if (isGroupSelectionMode && selectedSlotIndices.includes(index)) {
    slotDom.classList.add('group-selected');
  }

  const group = getSlotGroup(index);
  const slotState = group ? group : gridSlots[index];
  
  slotDom.setAttribute('draggable', slotState && slotState.imageId && currentMode === 'arrange' ? 'true' : 'false');

  if (group) {
    slotDom.classList.add('is-grouped');
  }

  if (!slotState || !slotState.imageId) {
    // Render Empty View
    slotDom.innerHTML = `
      <div class="slot-empty">
        <span class="plus-icon">${group ? '🔗' : '+'}</span>
        <span class="slot-label">${group ? 'Group Frame' : 'Drag Photo'}</span>
      </div>
    `;
    return;
  }

  const imgObj = loadedImages.find(img => img.id === slotState.imageId);
  if (!imgObj) {
    if (group) {
      group.imageId = null;
    } else {
      gridSlots[index] = null;
    }
    renderGridSlot(index);
    return;
  }

  // Set up Cropper DOM Elements
  const cropperContainer = document.createElement('div');
  cropperContainer.className = 'cropper-container';

  const img = document.createElement('img');
  img.className = 'crop-image';
  img.src = imgObj.url;
  img.alt = 'Contest entry photo';
  img.draggable = false;
  cropperContainer.appendChild(img);

  // Set up Controls Overlay
  const controls = document.createElement('div');
  controls.className = 'slot-controls';
  
  const isPinned = slotState.pinned || false;
  const pinHTML = `<button class="pin-btn ${isPinned ? 'is-active' : ''}" title="${isPinned ? 'Unlock photo' : 'Lock photo in place'}">📌 ${isPinned ? 'Pinned' : 'Pin'}</button>`;
  
  // Custom HTML: Include "Split/Ungroup" button if grouped
  const ungroupHTML = group ? `<button class="ungroup-btn" title="Split group back to single squares">🔗 Split</button>` : '';

  controls.innerHTML = `
    <div class="slot-controls-left">
      ${ungroupHTML}
      ${pinHTML}
    </div>
    <div class="crop-controls-group">
      <span class="zoom-label">Zoom</span>
      <input type="range" class="zoom-slider" min="1" max="3" step="0.05" value="${slotState.zoom}">
    </div>
    <button class="remove-btn" title="Remove photo">&times;</button>
  `;

  // Set up Filename overlay element
  const filenameOverlay = document.createElement('div');
  filenameOverlay.className = 'slot-filename';
  filenameOverlay.textContent = imgObj.file.name;

  // Set up Pin Badge (visible when not hovered if pinned)
  const pinBadge = document.createElement('div');
  pinBadge.className = 'pin-badge';
  pinBadge.textContent = '📌';
  
  if (isPinned) {
    slotDom.classList.add('is-pinned');
  }

  slotDom.appendChild(cropperContainer);
  slotDom.appendChild(pinBadge);
  slotDom.appendChild(filenameOverlay);
  slotDom.appendChild(controls);

  // Math positioning projection
  requestAnimationFrame(() => {
    positionImageInSlot(index);
  });

  // Zoom Slider Interaction
  const zoomSlider = controls.querySelector('.zoom-slider');
  zoomSlider.addEventListener('pointerdown', () => {
    saveStateToUndoStack();
  });
  zoomSlider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      saveStateToUndoStack();
    }
  });
  zoomSlider.addEventListener('input', (e) => {
    slotState.zoom = parseFloat(e.target.value);
    if (group) {
      group.indices.forEach(idx => positionImageInSlot(idx));
    } else {
      positionImageInSlot(index);
    }
  });

  // Remove Photo Interaction
  const removeBtn = controls.querySelector('.remove-btn');
  removeBtn.addEventListener('click', () => {
    saveStateToUndoStack();
    if (group) {
      group.imageId = null;
      group.pinned = false; // Reset pinned
      group.indices.forEach(idx => renderGridSlot(idx));
    } else {
      gridSlots[index] = null;
      renderGridSlot(index);
    }
    updateLibraryUI();
  });

  // Pin Button Interaction
  const pinBtn = controls.querySelector('.pin-btn');
  if (pinBtn) {
    pinBtn.addEventListener('click', () => {
      saveStateToUndoStack();
      slotState.pinned = !slotState.pinned;
      if (group) {
        group.pinned = slotState.pinned;
        group.indices.forEach(idx => renderGridSlot(idx));
      } else {
        renderGridSlot(index);
      }
      updateLibraryUI();
    });
  }

  // Ungroup trigger click listener
  if (group) {
    const ungroupBtn = controls.querySelector('.ungroup-btn');
    if (ungroupBtn) {
      ungroupBtn.addEventListener('click', () => {
        ungroupSlots(group.id);
      });
    }
  }

  // Panning interaction (Pointer Events)
  setupPanning(cropperContainer, index);
}

// 4. Image Math Positioning & Pointer Panning
function getScaledDimensions(imgWidth, imgHeight, slotSize, zoom) {
  const imgAspect = imgWidth / imgHeight;
  let w, h;
  
  if (imgAspect > 1.0) {
    h = slotSize * zoom;
    w = slotSize * imgAspect * zoom;
  } else {
    w = slotSize * zoom;
    h = (slotSize / imgAspect) * zoom;
  }
  
  return { w, h };
}

function positionImageInSlot(index) {
  const slotDom = document.querySelector(`.grid-slot[data-index="${index}"]`);
  const group = getSlotGroup(index);
  const slotState = group ? group : gridSlots[index];
  if (!slotState || !slotState.imageId) return;

  const cropperContainer = slotDom.querySelector('.cropper-container');
  const img = slotDom.querySelector('.crop-image');
  const imgObj = loadedImages.find(img => img.id === slotState.imageId);
  if (!cropperContainer || !img || !imgObj) return;

  const slotSize = cropperContainer.clientWidth;
  
  if (group) {
    // 1. Get Group bounds
    let colMin = 3, colMax = 0, rowMin = 3, rowMax = 0;
    group.indices.forEach(idx => {
      const r = Math.floor(idx / 3);
      const c = idx % 3;
      if (c < colMin) colMin = c;
      if (c > colMax) colMax = c;
      if (r < rowMin) rowMin = r;
      if (r > rowMax) rowMax = r;
    });

    const colUnits = colMax - colMin + 1;
    const rowUnits = rowMax - rowMin + 1;
    const g = 4; // Gap size is 4px

    // 2. Bounding group screen box
    const W_G = colUnits * slotSize + (colUnits - 1) * g;
    const H_G = rowUnits * slotSize + (rowUnits - 1) * g;

    // 3. Scale image to fill bounding box
    const imgAspect = imgObj.width / imgObj.height;
    const groupAspect = W_G / H_G;
    let w, h;

    if (imgAspect > groupAspect) {
      h = H_G * slotState.zoom;
      w = H_G * imgAspect * slotState.zoom;
    } else {
      w = W_G * slotState.zoom;
      h = (W_G / imgAspect) * slotState.zoom;
    }

    // 4. Group overflow boundaries
    const Rx = Math.max(0, w - W_G);
    const Ry = Math.max(0, h - H_G);

    // 5. Total translation
    const T_Gx = -slotState.cx * Rx;
    const T_Gy = -slotState.cy * Ry;

    // 6. Project local slot offset
    const r_i = Math.floor(index / 3);
    const c_i = index % 3;
    const delta_x = (c_i - colMin) * (slotSize + g);
    const delta_y = (r_i - rowMin) * (slotSize + g);

    const Tx = T_Gx - delta_x;
    const Ty = T_Gy - delta_y;

    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate3d(${Tx}px, ${Ty}px, 0)`;
  } else {
    // Individual slot math
    const { w, h } = getScaledDimensions(imgObj.width, imgObj.height, slotSize, slotState.zoom);
    const Rx = Math.max(0, w - slotSize);
    const Ry = Math.max(0, h - slotSize);
    const Tx = -slotState.cx * Rx;
    const Ty = -slotState.cy * Ry;

    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate3d(${Tx}px, ${Ty}px, 0)`;
  }
}

function setupPanning(cropperContainer, index) {
  let isPanning = false;
  let startX, startY;
  let initCx, initCy;
  let Rx, Ry;

  cropperContainer.addEventListener('pointerdown', (e) => {
    if (currentMode !== 'crop') return;
    if (e.button !== 0) return;
    
    const group = getSlotGroup(index);
    const slotState = group ? group : gridSlots[index];
    const imgObj = loadedImages.find(img => img.id === slotState.imageId);
    if (!slotState || !imgObj) return;

    saveStateToUndoStack();

    e.preventDefault();
    cropperContainer.setPointerCapture(e.pointerId);
    isPanning = true;

    startX = e.clientX;
    startY = e.clientY;
    initCx = slotState.cx;
    initCy = slotState.cy;

    const slotSize = cropperContainer.clientWidth;

    if (group) {
      let colMin = 3, colMax = 0, rowMin = 3, rowMax = 0;
      group.indices.forEach(idx => {
        const r = Math.floor(idx / 3);
        const c = idx % 3;
        if (c < colMin) colMin = c;
        if (c > colMax) colMax = c;
        if (r < rowMin) rowMin = r;
        if (r > rowMax) rowMax = r;
      });

      const colUnits = colMax - colMin + 1;
      const rowUnits = rowMax - rowMin + 1;
      const g = 4;

      const W_G = colUnits * slotSize + (colUnits - 1) * g;
      const H_G = rowUnits * slotSize + (rowUnits - 1) * g;

      const imgAspect = imgObj.width / imgObj.height;
      const groupAspect = W_G / H_G;
      let w, h;

      if (imgAspect > groupAspect) {
        h = H_G * slotState.zoom;
        w = H_G * imgAspect * slotState.zoom;
      } else {
        w = W_G * slotState.zoom;
        h = (W_G / imgAspect) * slotState.zoom;
      }

      Rx = Math.max(0, w - W_G);
      Ry = Math.max(0, h - H_G);
    } else {
      const { w, h } = getScaledDimensions(imgObj.width, imgObj.height, slotSize, slotState.zoom);
      Rx = Math.max(0, w - slotSize);
      Ry = Math.max(0, h - slotSize);
    }
  });

  cropperContainer.addEventListener('pointermove', (e) => {
    if (!isPanning) return;

    const group = getSlotGroup(index);
    const slotState = group ? group : gridSlots[index];
    if (!slotState) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let Tx = -initCx * Rx + dx;
    let Ty = -initCy * Ry + dy;

    Tx = Math.min(0, Math.max(-Rx, Tx));
    Ty = Math.min(0, Math.max(-Ry, Ty));

    slotState.cx = Rx > 0 ? -Tx / Rx : 0.5;
    slotState.cy = Ry > 0 ? -Ty / Ry : 0.5;

    if (group) {
      // Reposition all cells in the group
      group.indices.forEach(idx => positionImageInSlot(idx));
    } else {
      const img = cropperContainer.querySelector('.crop-image');
      if (img) {
        img.style.transform = `translate3d(${Tx}px, ${Ty}px, 0)`;
      }
    }
  });

  const endPanning = (e) => {
    if (!isPanning) return;
    isPanning = false;
    try {
      cropperContainer.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  cropperContainer.addEventListener('pointerup', endPanning);
  cropperContainer.addEventListener('pointercancel', endPanning);
}

// 5. Control Actions
function setupControlListeners() {
  btnRandom.addEventListener('click', randomizeGrid);
  btnClear.addEventListener('click', clearGrid);
  btnSave.addEventListener('click', saveGrid);
  btnUndo.addEventListener('click', undo);

  // Edit Mode Switchers
  modeArrange.addEventListener('click', () => setMode('arrange'));
  modeCrop.addEventListener('click', () => setMode('crop'));

  // Mosaic Grouping Controllers
  btnGroupMode.addEventListener('click', toggleGroupSelectionMode);
  btnCancelGroup.addEventListener('click', cancelGroupSelection);
  btnConfirmGroup.addEventListener('click', confirmGroupSelection);

  // Window resize handler to reposition cropped images responsively
  window.addEventListener('resize', () => {
    for (let i = 0; i < 9; i++) {
      positionImageInSlot(i);
    }
  });
}

function setMode(mode) {
  currentMode = mode;
  
  if (mode === 'arrange') {
    modeArrange.classList.add('active');
    modeCrop.classList.remove('active');
    gridCanvas.className = 'grid-canvas mode-arrange';
    if (toggleFilenames.checked) {
      gridCanvas.classList.add('show-filenames');
    }
  } else {
    modeArrange.classList.remove('active');
    modeCrop.classList.add('active');
    gridCanvas.className = 'grid-canvas mode-crop';
    if (toggleFilenames.checked) {
      gridCanvas.classList.add('show-filenames');
    }
  }

  // Update all slots draggable states
  setTemporaryDraggability(true);
}

function setTemporaryDraggability(enable) {
  const slots = document.querySelectorAll('.grid-slot');
  slots.forEach(slotDom => {
    if (enable && currentMode === 'arrange') {
      const idx = parseInt(slotDom.dataset.index);
      if (gridSlots[idx] && gridSlots[idx].imageId) {
        slotDom.setAttribute('draggable', 'true');
        return;
      }
      const group = getSlotGroup(idx);
      if (group && group.imageId) {
        slotDom.setAttribute('draggable', 'true');
        return;
      }
    }
    slotDom.setAttribute('draggable', 'false');
  });
}

// Mosaic Selection Mode Management
function toggleGroupSelectionMode() {
  if (isGroupSelectionMode) {
    cancelGroupSelection();
  } else {
    isGroupSelectionMode = true;
    selectedSlotIndices = [];
    btnGroupMode.textContent = 'Selecting...';
    btnGroupMode.classList.add('btn-group-active');
    groupSelectionActions.classList.remove('hidden');
    setMode('arrange'); // Exits crop adjustments when grouping
  }
  renderGrid();
}

function cancelGroupSelection() {
  isGroupSelectionMode = false;
  selectedSlotIndices = [];
  btnGroupMode.textContent = 'Group Squares';
  btnGroupMode.classList.remove('btn-group-active');
  groupSelectionActions.classList.add('hidden');
  renderGrid();
}

function confirmGroupSelection() {
  if (selectedSlotIndices.length < 2) {
    alert('Please select at least 2 squares to create a group.');
    return;
  }

  saveStateToUndoStack();

  // Backing Image Fallback: inherit first populated slot's image details
  let groupImageId = null;
  let groupZoom = 1.0;
  let groupCx = 0.5;
  let groupCy = 0.5;

  for (let idx of selectedSlotIndices) {
    if (gridSlots[idx] && gridSlots[idx].imageId) {
      groupImageId = gridSlots[idx].imageId;
      groupZoom = gridSlots[idx].zoom;
      groupCx = gridSlots[idx].cx;
      groupCy = gridSlots[idx].cy;
      break;
    }
  }

  const newGroup = {
    id: 'group-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    indices: [...selectedSlotIndices],
    imageId: groupImageId,
    zoom: groupZoom,
    cx: groupCx,
    cy: groupCy
  };

  // Clear original slots
  selectedSlotIndices.forEach(idx => {
    gridSlots[idx] = null;
  });

  gridGroups.push(newGroup);
  cancelGroupSelection();
}

// Coordinate-Matching Ungrouping Math
function ungroupSlots(groupId) {
  const groupIdx = gridGroups.findIndex(g => g.id === groupId);
  if (groupIdx === -1) return;

  saveStateToUndoStack();

  const group = gridGroups[groupIdx];

  const imageId = group.imageId;
  if (!imageId) {
    gridGroups.splice(groupIdx, 1);
    renderGrid();
    return;
  }

  const imgObj = loadedImages.find(img => img.id === imageId);
  if (!imgObj) {
    gridGroups.splice(groupIdx, 1);
    renderGrid();
    return;
  }

  // Get boundaries in grid units
  let colMin = 3, colMax = 0, rowMin = 3, rowMax = 0;
  group.indices.forEach(idx => {
    const r = Math.floor(idx / 3);
    const c = idx % 3;
    if (c < colMin) colMin = c;
    if (c > colMax) colMax = c;
    if (r < rowMin) rowMin = r;
    if (r > rowMax) rowMax = r;
  });

  const colUnits = colMax - colMin + 1;
  const rowUnits = rowMax - rowMin + 1;
  const g = 4; // grid-gap

  // Bounding box size references
  const S = 192; // slot size reference
  const W_G = colUnits * S + (colUnits - 1) * g;
  const H_G = rowUnits * S + (rowUnits - 1) * g;

  const imgAspect = imgObj.width / imgObj.height;
  const groupAspect = W_G / H_G;

  // Group scale factors
  let w_G, h_G;
  if (imgAspect > groupAspect) {
    h_G = H_G * group.zoom;
    w_G = H_G * imgAspect * group.zoom;
  } else {
    w_G = W_G * group.zoom;
    h_G = (W_G / imgAspect) * group.zoom;
  }
  const s_G = w_G / imgObj.width;

  // Group translations
  const Rx = Math.max(0, w_G - W_G);
  const Ry = Math.max(0, h_G - H_G);
  const T_Gx = -group.cx * Rx;
  const T_Gy = -group.cy * Ry;

  group.indices.forEach(idx => {
    const r_i = Math.floor(idx / 3);
    const c_i = idx % 3;
    const delta_x = (c_i - colMin) * (S + g);
    const delta_y = (r_i - rowMin) * (S + g);

    // Center coordinates inside slot i relative to the group
    const x_c = delta_x + S / 2;
    const y_c = delta_y + S / 2;

    // Convert coordinates back to original image pixels
    const x_orig = (x_c - T_Gx) / s_G;
    const y_orig = (y_c - T_Gy) / s_G;

    // Individual slot scale factor
    let w_i, h_i;
    if (imgAspect > 1.0) {
      h_i = S * group.zoom;
      w_i = S * imgAspect * group.zoom;
    } else {
      w_i = S * group.zoom;
      h_i = (S / imgAspect) * group.zoom;
    }
    const s_i = w_i / imgObj.width;

    // Individual visible bounds in original coordinates
    const sw_i = S / s_i;
    const sh_i = S / s_i;

    // Relocate top-left crop starting boundaries
    let sx = x_orig - sw_i / 2;
    let sy = y_orig - sh_i / 2;

    // Clamp inside image
    sx = Math.max(0, Math.min(imgObj.width - sw_i, sx));
    sy = Math.max(0, Math.min(imgObj.height - sh_i, sy));

    const cx_indiv = (imgObj.width - sw_i) > 0 ? sx / (imgObj.width - sw_i) : 0.5;
    const cy_indiv = (imgObj.height - sh_i) > 0 ? sy / (imgObj.height - sh_i) : 0.5;

    gridSlots[idx] = {
      imageId: imageId,
      zoom: group.zoom,
      cx: cx_indiv,
      cy: cy_indiv,
      pinned: group.pinned || false
    };
  });

  // Splice out group
  gridGroups.splice(groupIdx, 1);
  renderGrid();
  updateLibraryUI();
}

function clearGrid() {
  if (gridSlots.every(slot => slot === null) && gridGroups.length === 0) return;
  if (confirm('Are you sure you want to clear your current grid?')) {
    saveStateToUndoStack();
    gridSlots.fill(null);
    gridGroups = [];
    renderGrid();
    updateLibraryUI();
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomizeGrid() {
  if (loadedImages.length === 0) {
    alert('Please upload some JPEGs first to randomize the grid layout!');
    return;
  }

  saveStateToUndoStack();

  // 1. Identify which image IDs are currently used in pinned slots/groups
  const pinnedImageIds = new Set();
  gridSlots.forEach(slot => {
    if (slot && slot.imageId && slot.pinned) {
      pinnedImageIds.add(slot.imageId);
    }
  });
  gridGroups.forEach(group => {
    if (group && group.imageId && group.pinned) {
      pinnedImageIds.add(group.imageId);
    }
  });

  // 2. Filter available images to exclude ones currently locked in pinned cells
  const availableImages = loadedImages.filter(img => !pinnedImageIds.has(img.id));
  const shuffledImages = shuffleArray([...availableImages]);
  let imgIndex = 0;

  // 3. Clear/Reset unpinned groups
  gridGroups.forEach(group => {
    if (!group.pinned) {
      group.imageId = null;
      group.zoom = 1.0;
      group.cx = 0.5;
      group.cy = 0.5;
    }
  });

  // 4. Clear/Reset unpinned independent slots
  for (let i = 0; i < 9; i++) {
    if (!getSlotGroup(i)) {
      if (!gridSlots[i] || !gridSlots[i].pinned) {
        gridSlots[i] = null;
      }
    }
  }

  // 5. Fill unpinned Groups first (treating each group as 1 slot)
  gridGroups.forEach(group => {
    if (!group.pinned) {
      if (imgIndex < shuffledImages.length) {
        group.imageId = shuffledImages[imgIndex].id;
        group.zoom = 1.0;
        group.cx = 0.5;
        group.cy = 0.5;
        imgIndex++;
      }
    }
  });

  // 6. Fill unpinned independent slots
  for (let i = 0; i < 9; i++) {
    if (!getSlotGroup(i)) {
      if (!gridSlots[i] || !gridSlots[i].pinned) {
        if (imgIndex < shuffledImages.length) {
          gridSlots[i] = {
            imageId: shuffledImages[imgIndex].id,
            zoom: 1.0,
            cx: 0.5,
            cy: 0.5,
            pinned: false
          };
          imgIndex++;
        }
      }
    }
  }

  renderGrid();
  updateLibraryUI();
}

// 6. High-Resolution Canvas Exporter
function saveGrid() {
  // Check if grid has at least one image (either slot or group)
  const slotsEmpty = gridSlots.every(slot => slot === null);
  const groupsEmpty = gridGroups.every(group => group.imageId === null);
  if (slotsEmpty && groupsEmpty) {
    alert('The grid is empty. Please place at least one image to save.');
    return;
  }

  // Visual feedback: disable save button during render
  btnSave.disabled = true;
  btnSave.textContent = 'Generating...';

  // Output grid dimensions (Contest high quality)
  const CANVAS_SIZE = 3000;
  const GAP_SIZE = 12; // 12px separation borders
  const CELL_SIZE = (CANVAS_SIZE - (GAP_SIZE * 2)) / 3; // 992px cells

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  // Fill Background with pure white (so borders between cells show as pure white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Array to collect image rendering promises
  const renderPromises = [];

  for (let i = 0; i < 9; i++) {
    const group = getSlotGroup(i);
    const slotState = group ? group : gridSlots[i];
    if (!slotState || !slotState.imageId) continue;

    const imgObj = loadedImages.find(img => img.id === slotState.imageId);
    if (!imgObj) continue;

    const row = Math.floor(i / 3);
    const col = i % 3;

    // Target positions on offscreen high-res canvas
    const dx = col * (CELL_SIZE + GAP_SIZE);
    const dy = row * (CELL_SIZE + GAP_SIZE);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (group) {
          // GROUP PROJECTED HIGH-RES DRAWING
          let colMin = 3, colMax = 0, rowMin = 3, rowMax = 0;
          group.indices.forEach(idx => {
            const r = Math.floor(idx / 3);
            const c = idx % 3;
            if (c < colMin) colMin = c;
            if (c > colMax) colMax = c;
            if (r < rowMin) rowMin = r;
            if (r > rowMax) rowMax = r;
          });

          const colUnits = colMax - colMin + 1;
          const rowUnits = rowMax - rowMin + 1;

          // Virtual high-res group size
          const W_G = colUnits * CELL_SIZE + (colUnits - 1) * GAP_SIZE;
          const H_G = rowUnits * CELL_SIZE + (rowUnits - 1) * GAP_SIZE;

          const imgAspect = imgObj.width / imgObj.height;
          const groupAspect = W_G / H_G;

          // Crop sizes in original image coordinates
          let sw, sh;
          if (imgAspect > groupAspect) {
            sh = imgObj.height / group.zoom;
            sw = sh * groupAspect;
          } else {
            sw = imgObj.width / group.zoom;
            sh = sw / groupAspect;
          }

          // Clamp
          sw = Math.min(sw, imgObj.width);
          sh = Math.min(sh, imgObj.height);

          // Max starts
          const maxSx = imgObj.width - sw;
          const maxSy = imgObj.height - sh;

          // Group Crop Offset starts
          const sx_overall = group.cx * maxSx;
          const sy_overall = group.cy * maxSy;

          // Sub-region projection offset for this slot index i
          const r_i = Math.floor(i / 3);
          const c_i = i % 3;
          const delta_x = (c_i - colMin) * (CELL_SIZE + GAP_SIZE);
          const delta_y = (r_i - rowMin) * (CELL_SIZE + GAP_SIZE);

          const sx_i = sx_overall + (delta_x / W_G) * sw;
          const sy_i = sy_overall + (delta_y / H_G) * sh;
          const sw_i = (CELL_SIZE / W_G) * sw;
          const sh_i = (CELL_SIZE / H_G) * sh;

          // Draw the segment
          ctx.drawImage(img, sx_i, sy_i, sw_i, sh_i, dx, dy, CELL_SIZE, CELL_SIZE);
        } else {
          // INDIVIDUAL SLOT DRAWING
          const imgAspect = imgObj.width / imgObj.height;
          let sw, sh;

          if (imgAspect > 1.0) {
            sw = imgObj.height / slotState.zoom;
            sh = imgObj.height / slotState.zoom;
          } else {
            sw = imgObj.width / slotState.zoom;
            sh = imgObj.width / slotState.zoom;
          }

          sw = Math.min(sw, imgObj.width);
          sh = Math.min(sh, imgObj.height);

          const maxSx = imgObj.width - sw;
          const maxSy = imgObj.height - sh;

          const sx = slotState.cx * maxSx;
          const sy = slotState.cy * maxSy;

          ctx.drawImage(img, sx, sy, sw, sh, dx, dy, CELL_SIZE, CELL_SIZE);
        }

        // Draw filename overlay on canvas if enabled
        if (toggleFilenames.checked) {
          const bannerHeight = 70;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.fillRect(dx, dy + CELL_SIZE - bannerHeight, CELL_SIZE, bannerHeight);

          ctx.fillStyle = '#ffffff';
          ctx.font = '600 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Truncate filename if it exceeds slot width (with padding)
          let displayName = imgObj.file.name;
          const maxTextWidth = CELL_SIZE - 40;
          if (ctx.measureText(displayName).width > maxTextWidth) {
            while (displayName.length > 0 && ctx.measureText(displayName + '...').width > maxTextWidth) {
              displayName = displayName.slice(0, -1);
            }
            displayName += '...';
          }

          ctx.fillText(displayName, dx + CELL_SIZE / 2, dy + CELL_SIZE - (bannerHeight / 2));
        }

        resolve();
      };
      img.src = imgObj.url;
    });

    renderPromises.push(promise);
  }

  // Wait for all canvas layers to render, then export
  Promise.all(renderPromises).then(() => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `photogrid_contest_${Date.now()}.jpg`;
        link.href = url;
        link.click();
        
        // Clean up Object URL
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);
      }
      
      // Reset save button UI
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Save Grid
      `;
    }, 'image/jpeg', 0.95);
  }).catch((err) => {
    console.error('Error rendering high-res grid:', err);
    alert('Could not export grid image. Check console for details.');
    btnSave.disabled = false;
    btnSave.textContent = 'Save Grid';
  });
}

// Start app on DOM load
document.addEventListener('DOMContentLoaded', init);
