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
    
    // Search input for clear button toggle
    fileSearchInput.addEventListener('input', toggleClearButton);
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

    showSuccess('File uploaded and analyzed successfully!');
}

// PDF file selection handler
function handleFileSelectForPDF() {
    const selectedFileId = fileSelect.value;
    if (selectedFileId && uploadedFiles[selectedFileId]) {
        currentFileId = selectedFileId;
        
        // Show PDF viewer
        showPDFViewer(selectedFileId, uploadedFiles[selectedFileId].filename);
        
        // Get current search term for highlighting
        const searchTerm = fileSearchInput.value.toLowerCase().trim();
        showTranscription(uploadedFiles[selectedFileId].content, searchTerm);
    } else {
        currentFileId = null;
        hidePDFViewer();
    }
}

// PDF Viewer Functions
function showPDFViewer(fileId, filename) {
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');
    
    // Set PDF source and show viewer
    pdfViewer.src = `/pdf/${fileId}`;
    pdfViewer.style.display = 'block';
    pdfPlaceholder.style.display = 'none';
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
                fileId: fileId
            };
            
            addFileToList(fileId, data.filename);
            // Update content data for searching
            updateFileTranscriptionData(fileId, data.content);
            addFileToSelector(fileId, data.filename);
        });
        
    } catch (error) {
        console.error('Error loading existing document analysis:', error);
    }
}

// UI Helper Functions (keeping all existing UI helper functions from the original)
// Note: These functions remain the same as in the original file for file management,
// transcription display, search functionality, etc.