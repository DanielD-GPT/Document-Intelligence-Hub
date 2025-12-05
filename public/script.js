// Global variables
let currentFileId = null;
let uploadedFiles = {};
let uploadQueue = [];
let isUploading = false;

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileList = document.getElementById('fileList');
const transcriptionPlaceholder = document.getElementById('transcriptionPlaceholder');
const transcriptionText = document.getElementById('transcriptionText');
const fileSelect = document.getElementById('fileSelect');
const loadingOverlay = document.getElementById('loadingOverlay');

// File search input
const fileSearchInput = document.getElementById('fileSearchInput');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadExistingTranscriptions();
});

// Setup event listeners
function setupEventListeners() {
    // Drag and drop functionality
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // File selection for PDF viewer
    fileSelect.addEventListener('change', handleFileSelectForPDF);
    
    // Search input for clear button toggle and real-time search
    if (fileSearchInput) {
        fileSearchInput.addEventListener('input', handleSearchInput);
        console.log('Search input event listener added');
    } else {
        console.error('fileSearchInput element not found');
    }
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

// File selection handler
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

// Handle multiple files
function handleFiles(files) {
    for (let file of files) {
        if (validateFile(file)) {
            uploadQueue.push(file);
        }
    }
    
    // Show queue info if multiple files
    if (uploadQueue.length > 1 && !isUploading) {
        showSuccess(`Added ${uploadQueue.length} files to upload queue. Processing one at a time to avoid rate limits.`);
    }
    
    // Process the queue
    processUploadQueue();
}

// Process upload queue one file at a time
async function processUploadQueue() {
    if (isUploading || uploadQueue.length === 0) {
        return;
    }
    
    isUploading = true;
    
    while (uploadQueue.length > 0) {
        const file = uploadQueue.shift();
        try {
            await uploadFile(file);
            
            // Add delay between uploads to avoid rate limits
            if (uploadQueue.length > 0) {
                showSuccess(`Upload complete. Processing next file in 2 seconds... (${uploadQueue.length} remaining)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            console.error('Upload failed:', error);
            // Continue with next file even if current one fails
        }
    }
    
    isUploading = false;
    
    if (uploadQueue.length === 0) {
        showSuccess('All files processed successfully!');
    }
}

// Validate file type and size
function validateFile(file) {
    const allowedTypes = ['application/pdf'];
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (!allowedTypes.includes(file.type) && 
        !file.name.toLowerCase().endsWith('.pdf')) {
        showError('Please select only .pdf files');
        return false;
    }
    
    if (file.size > maxSize) {
        showError('File size must be less than 50MB');
        return false;
    }
    
    return true;
}

// Upload file to server
async function uploadFile(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('pdfFile', file);
        
        showLoading(true, `Uploading and analyzing ${file.name}...`);
        showUploadProgress(true);
        
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(percentComplete);
            }
        });
        
        xhr.onload = function() {
            showLoading(false);
            showUploadProgress(false);
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    handleUploadSuccess(response);
                    resolve(response);
                } catch (e) {
                    reject(new Error('Invalid response from server'));
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText);
                    if (error.error && error.error.includes('Rate limit exceeded')) {
                        showRateLimitError(error.error);
                    } else {
                        showError('Upload/Analysis failed: ' + error.error);
                    }
                    reject(new Error(error.error || 'Upload failed'));
                } catch (e) {
                    showError('Upload/Analysis failed: ' + xhr.statusText);
                    reject(new Error(xhr.statusText));
                }
            }
        };
        
        xhr.onerror = function() {
            showLoading(false);
            showUploadProgress(false);
            showError('Upload failed: Network error');
            reject(new Error('Network error'));
        };
        
        xhr.open('POST', '/upload');
        xhr.send(formData);
    });
}

// Handle successful upload
function handleUploadSuccess(response) {
    const { fileId, filename, content } = response;
    
    // Store file info
    uploadedFiles[fileId] = {
        filename: filename,
        content: content,
        fileId: fileId
    };
    
    // Add to file list
    addFileToList(fileId, filename);
    
    // Update content data for searching
    updateFileTranscriptionData(fileId, content);
    
    // Add to chat file selector
    addFileToSelector(fileId, filename);
    
    // Show content
    showTranscription(content);
    
    // Set as current file
    currentFileId = fileId;
    fileSelect.value = fileId;
    
    // Automatically show the PDF viewer for the uploaded file
    showPDFViewer(fileId, filename);

    showSuccess('File uploaded and analyzed successfully!');
}

// PDF file selection handler
function handleFileSelectForPDF() {
    console.log('handleFileSelectForPDF called');
    const selectedFileId = fileSelect.value;
    console.log('Selected file ID:', selectedFileId);
    console.log('Available files:', Object.keys(uploadedFiles));
    
    if (selectedFileId && uploadedFiles[selectedFileId]) {
        currentFileId = selectedFileId;
        
        // Get current search term for highlighting
        const searchTerm = fileSearchInput ? fileSearchInput.value.trim() : '';
        
        console.log('Showing PDF for file:', selectedFileId);
        // Show PDF viewer with search highlighting
        showPDFViewer(selectedFileId, uploadedFiles[selectedFileId].filename, searchTerm);
        
        // Show content analysis with search highlighting
        showTranscription(uploadedFiles[selectedFileId].content, searchTerm);
    } else {
        console.log('No valid file selected, hiding PDF viewer');
        currentFileId = null;
        hidePDFViewer();
    }
}

// PDF Viewer Functions
function showPDFViewer(fileId, filename, searchTerm = '') {
    console.log('showPDFViewer called with:', { fileId, filename, searchTerm });
    
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');
    
    if (!pdfViewer) {
        console.error('PDF viewer element not found');
        return;
    }
    
    if (!pdfPlaceholder) {
        console.error('PDF placeholder element not found');
        return;
    }
    
    // Build PDF URL with search parameter if provided
    let pdfUrl = `/pdf/${fileId}`;
    if (searchTerm) {
        pdfUrl += `#search=${encodeURIComponent(searchTerm)}`;
    }
    
    console.log('Loading PDF from URL:', pdfUrl);
    
    // Set PDF source and show viewer
    pdfViewer.src = pdfUrl;
    pdfViewer.style.display = 'block';
    pdfPlaceholder.style.display = 'none';
    
    // Add error handling for PDF loading
    pdfViewer.onerror = function() {
        console.error('Failed to load PDF from:', pdfUrl);
        showError('Failed to load PDF file');
        hidePDFViewer();
    };
    
    pdfViewer.onload = function() {
        console.log('PDF loaded successfully');
    };
    
    // If there's a search term, also try to use PDF.js search API
    if (searchTerm && pdfViewer.contentWindow) {
        pdfViewer.onload = function() {
            try {
                // Try to access PDF.js search functionality
                const pdfWindow = pdfViewer.contentWindow;
                if (pdfWindow && pdfWindow.PDFViewerApplication) {
                    setTimeout(() => {
                        pdfWindow.PDFViewerApplication.findController.executeCommand('find', {
                            query: searchTerm,
                            highlightAll: true,
                            caseSensitive: false
                        });
                    }, 1000); // Wait for PDF to fully load
                }
            } catch (e) {
                console.log('PDF.js search not available, using URL fragment:', e);
            }
        };
    }
}

function hidePDFViewer() {
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');
    
    // Hide PDF viewer and show placeholder
    pdfViewer.src = '';
    pdfViewer.style.display = 'none';
    pdfPlaceholder.style.display = 'flex';
}

// Load existing transcriptions
async function loadExistingTranscriptions() {
    try {
        const response = await fetch('/transcriptions');
        const documentAnalysis = await response.json();
        
        Object.entries(documentAnalysis).forEach(([fileId, data]) => {
            uploadedFiles[fileId] = {
                filename: data.filename,
                content: data.content,
                fileId: fileId,
                hasPdfContent: data.hasPdfContent || false
            };
            
            addFileToList(fileId, data.filename, data.hasPdfContent || false);
            // Update content data for searching
            updateFileTranscriptionData(fileId, data.content);
            addFileToSelector(fileId, data.filename);
        });
        
    } catch (error) {
        console.error('Error loading existing document analysis:', error);
    }
}

// UI Helper Functions
function showSuccess(message) {
    console.log('Success:', message);
    // You can add visual feedback here if needed
}

function showError(message) {
    console.error('Error:', message);
    alert('Error: ' + message);
}

function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        if (show) {
            overlay.style.display = 'flex';
            const text = overlay.querySelector('p');
            if (text) text.textContent = message;
        } else {
            overlay.style.display = 'none';
        }
    }
}

function showUploadProgress(show) {
    const progress = document.getElementById('uploadProgress');
    if (progress) {
        progress.style.display = show ? 'block' : 'none';
    }
}

function updateProgress(percent) {
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (fill) fill.style.width = percent + '%';
    if (text) text.textContent = Math.round(percent) + '%';
}

function showRateLimitError(message) {
    showError('Rate limit exceeded: ' + message);
}

function addFileToList(fileId, filename, hasPdfContent = false) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.setAttribute('data-filename', filename.toLowerCase());
    fileItem.setAttribute('data-file-id', fileId);
    
    fileItem.innerHTML = `
        <div class="file-info" onclick="selectFile('${fileId}')" style="cursor: pointer;">
            <div class="file-name-container">
                <span class="file-name">${filename}</span>
                <button class="delete-btn inline-delete-btn" onclick="event.stopPropagation(); deleteFile('${fileId}')" title="Delete file">× Delete</button>
            </div>
        </div>
        <div class="file-actions">
            ${hasPdfContent ? '<button class="download-pdf-btn" onclick="downloadPDF(\'' + fileId + '\')" title="Download from Cloud">📥</button>' : ''}
        </div>
    `;
    
    fileList.appendChild(fileItem);
}

function addFileToSelector(fileId, filename) {
    const fileSelect = document.getElementById('fileSelect');
    if (!fileSelect) return;
    
    const option = document.createElement('option');
    option.value = fileId;
    option.textContent = filename;
    fileSelect.appendChild(option);
}

function updateFileTranscriptionData(fileId, content) {
    // Update search data for the file
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (fileItem) {
        fileItem.setAttribute('data-transcription', content.toLowerCase());
    }
}

function showTranscription(content, searchTerm = '') {
    const placeholder = document.getElementById('transcriptionPlaceholder');
    const text = document.getElementById('transcriptionText');
    
    if (!text || !placeholder) return;
    
    if (content && content.trim()) {
        placeholder.style.display = 'none';
        text.style.display = 'block';
        
        // Highlight search terms if provided
        let displayContent = content;
        if (searchTerm && searchTerm.length > 0) {
            console.log('Highlighting search term:', searchTerm);
            console.log('Content length:', content.length);
            const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
            displayContent = content.replace(regex, '<span class="search-highlight">$1</span>');
            console.log('Matches found:', (content.match(regex) || []).length);
            text.innerHTML = displayContent;
        } else {
            text.textContent = content;
        }
    } else {
        placeholder.style.display = 'block';
        text.style.display = 'none';
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectFile(fileId) {
    const fileSelect = document.getElementById('fileSelect');
    if (fileSelect) {
        fileSelect.value = fileId;
        fileSelect.dispatchEvent(new Event('change'));
    }
}

function downloadPDF(fileId) {
    const filename = uploadedFiles[fileId]?.filename || 'document.pdf';
    
    // Create a temporary link to download the PDF from local storage
    const downloadUrl = `/pdf/${fileId}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showSuccess('Downloading PDF from local storage...');
}

async function deleteFile(fileId) {
    const filename = uploadedFiles[fileId]?.filename || 'this file';
    if (confirm(`Are you sure you want to delete "${filename}"? This will permanently remove it from local storage.`)) {
        try {
            showLoading(true, `Deleting "${filename}"...`);
            
            // Add loading class to the file item
            const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
            if (fileItem) {
                fileItem.classList.add('deleting');
            }
            
            const response = await fetch(`/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Remove from local uploadedFiles object
                delete uploadedFiles[fileId];
                
                // Remove from file list UI
                const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
                if (fileItem) {
                    fileItem.remove();
                }
                
                // Remove from file selector dropdown
                const fileOption = document.querySelector(`#fileSelect option[value="${fileId}"]`);
                if (fileOption) {
                    fileOption.remove();
                }
                
                // Clear current selection if this was the selected file
                if (currentFileId === fileId) {
                    currentFileId = null;
                    hidePDFViewer();
                    const transcriptionText = document.getElementById('transcriptionText');
                    const transcriptionPlaceholder = document.getElementById('transcriptionPlaceholder');
                    if (transcriptionText) transcriptionText.style.display = 'none';
                    if (transcriptionPlaceholder) transcriptionPlaceholder.style.display = 'block';
                    
                    // Reset file selector to default
                    const fileSelect = document.getElementById('fileSelect');
                    if (fileSelect) {
                        fileSelect.value = '';
                    }
                }
                
                // Clear any search results if this file was being searched
                const searchValue = fileSearchInput ? fileSearchInput.value.trim() : '';
                if (searchValue) {
                    updateSearchNavigation(searchValue);
                }
                
                showSuccess(`"${filename}" deleted successfully from both local storage and cloud database`);
            } else {
                throw new Error(result.error || 'Delete operation failed');
            }
            
        } catch (error) {
            console.error('Delete error:', error);
            showError('Failed to delete file: ' + error.message);
        } finally {
            showLoading(false);
        }
    }
}

function handleSearchInput() {
    try {
        const searchValue = fileSearchInput ? fileSearchInput.value.trim() : '';
        console.log('Search input:', searchValue);
        
        // Toggle clear button visibility
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) {
            clearBtn.style.display = searchValue ? 'block' : 'none';
        }
        
        // Perform search in content analysis output
        if (currentFileId && uploadedFiles[currentFileId] && uploadedFiles[currentFileId].content) {
            showTranscription(uploadedFiles[currentFileId].content, searchValue);
            // Also update PDF viewer with search highlighting
            if (searchValue) {
                showPDFViewer(currentFileId, uploadedFiles[currentFileId].filename, searchValue);
            }
        }
        
        // Filter file list based on search
        filterFileList(searchValue);
        
        // Update search navigation
        updateSearchNavigation(searchValue);
    } catch (error) {
        console.error('Error in handleSearchInput:', error);
    }
}

function clearSearch() {
    fileSearchInput.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    // Clear search results
    if (currentFileId && uploadedFiles[currentFileId] && uploadedFiles[currentFileId].content) {
        showTranscription(uploadedFiles[currentFileId].content, '');
        // Also refresh PDF viewer without search highlighting
        showPDFViewer(currentFileId, uploadedFiles[currentFileId].filename);
    }
    
    // Reset file list
    filterFileList('');
    
    // Hide search navigation
    updateSearchNavigation('');
}

// Global variables for search navigation
let currentHighlightIndex = 0;
let totalHighlights = 0;

function updateSearchNavigation(searchTerm) {
    const searchNavigation = document.getElementById('searchNavigation');
    const searchCounter = document.getElementById('searchCounter');
    const prevBtn = document.getElementById('prevSearchBtn');
    const nextBtn = document.getElementById('nextSearchBtn');
    
    if (!searchTerm || searchTerm.length === 0) {
        if (searchNavigation) searchNavigation.style.display = 'none';
        totalHighlights = 0;
        currentHighlightIndex = 0;
        return;
    }
    
    // Count highlights in the current content
    const transcriptionText = document.getElementById('transcriptionText');
    if (transcriptionText) {
        const highlights = transcriptionText.querySelectorAll('.search-highlight');
        totalHighlights = highlights.length;
        
        if (totalHighlights > 0) {
            if (searchNavigation) searchNavigation.style.display = 'flex';
            currentHighlightIndex = 1; // Start with first result
            updateHighlightIndicator();
            updateSearchCounter();
            
            // Enable/disable buttons
            if (prevBtn) prevBtn.disabled = currentHighlightIndex <= 1;
            if (nextBtn) nextBtn.disabled = currentHighlightIndex >= totalHighlights;
        } else {
            if (searchNavigation) searchNavigation.style.display = 'none';
        }
    }
}

function scrollToPrevHighlight() {
    if (currentHighlightIndex > 1) {
        currentHighlightIndex--;
        scrollToCurrentHighlight();
        updateSearchCounter();
        
        const prevBtn = document.getElementById('prevSearchBtn');
        const nextBtn = document.getElementById('nextSearchBtn');
        if (prevBtn) prevBtn.disabled = currentHighlightIndex <= 1;
        if (nextBtn) nextBtn.disabled = false;
    }
}

function scrollToNextHighlight() {
    if (currentHighlightIndex < totalHighlights) {
        currentHighlightIndex++;
        scrollToCurrentHighlight();
        updateSearchCounter();
        
        const prevBtn = document.getElementById('prevSearchBtn');
        const nextBtn = document.getElementById('nextSearchBtn');
        if (prevBtn) prevBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = currentHighlightIndex >= totalHighlights;
    }
}

function scrollToCurrentHighlight() {
    const transcriptionText = document.getElementById('transcriptionText');
    if (transcriptionText) {
        const highlights = transcriptionText.querySelectorAll('.search-highlight');
        
        // Remove current class from all highlights
        highlights.forEach(highlight => highlight.classList.remove('current'));
        
        if (highlights.length > 0 && currentHighlightIndex > 0 && currentHighlightIndex <= highlights.length) {
            const targetHighlight = highlights[currentHighlightIndex - 1];
            targetHighlight.classList.add('current');
            
            // Scroll to the highlight
            targetHighlight.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    }
}

function updateSearchCounter() {
    const searchCounter = document.getElementById('searchCounter');
    if (searchCounter && totalHighlights > 0) {
        searchCounter.textContent = `${currentHighlightIndex}/${totalHighlights}`;
    }
}

function updateHighlightIndicator() {
    // Highlight the first result initially
    if (totalHighlights > 0) {
        scrollToCurrentHighlight();
    }
}

function filterFileList(searchTerm) {
    const fileItems = document.querySelectorAll('.file-item');
    
    fileItems.forEach(item => {
        const filename = item.getAttribute('data-filename') || '';
        const fileId = item.getAttribute('data-file-id');
        const fileContent = uploadedFiles[fileId]?.content || '';
        
        // Check if search term matches filename or content
        const matchesFilename = filename.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesContent = fileContent.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!searchTerm || matchesFilename || matchesContent) {
            item.style.display = 'block';
            // Add search match indicator if content matches but filename doesn't
            if (searchTerm && matchesContent && !matchesFilename) {
                item.classList.add('content-match');
            } else {
                item.classList.remove('content-match');
            }
        } else {
            item.style.display = 'none';
            item.classList.remove('content-match');
        }
    });
}

function copyTranscription() {
    const text = document.getElementById('transcriptionText');
    if (text && text.textContent) {
        navigator.clipboard.writeText(text.textContent).then(() => {
            showSuccess('Content copied to clipboard!');
        }).catch(() => {
            showError('Failed to copy content');
        });
    }
}

function downloadTranscription() {
    const text = document.getElementById('transcriptionText');
    if (text && text.textContent && currentFileId) {
        const filename = uploadedFiles[currentFileId]?.filename || 'document';
        const blob = new Blob([text.textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename.replace(/\.[^/.]+$/, '')}_content.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}