// Global variables
let currentFileId = null;
let uploadedFiles = {};
let uploadQueue = [];
let isUploading = false;

let currentExcelId = null;
let currentExcelFilename = null;

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileList = document.getElementById('fileList');
const chatMessages = document.getElementById('chatMessages');
const chatPlaceholder = document.getElementById('chatPlaceholder');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

// Excel elements
const excelDropZone = document.getElementById('excelDropZone');
const excelFileInput = document.getElementById('excelFileInput');
const excelTemplateName = document.getElementById('excelTemplateName');
const excelSelectedPdf = document.getElementById('excelSelectedPdf');
const fillExcelBtn = document.getElementById('fillExcelBtn');

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

    // Excel drag/drop + browse
    if (excelDropZone && excelFileInput) {
        excelDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            excelDropZone.classList.add('dragover');
        });
        excelDropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            excelDropZone.classList.remove('dragover');
        });
        excelDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            excelDropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleExcelFile(files[0]);
            }
        });
        excelDropZone.addEventListener('click', () => excelFileInput.click());
        excelFileInput.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleExcelFile(f);
            // Clear the input so the same file can be selected again
            e.target.value = '';
        });
    }
    
    // Search input for clear button toggle and real-time search
    if (fileSearchInput) {
        fileSearchInput.addEventListener('input', handleSearchInput);
        console.log('Search input event listener added');
    } else {
        console.error('fileSearchInput element not found');
    }

    // Chat input - send on Enter key
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !sendChatBtn.disabled) {
                e.preventDefault();
                sendMessage();
            }
        });
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
    // Clear the input so the same file can be selected again
    e.target.value = '';
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
    
    // No dropdown selector to update
    
    // Show content
    showTranscription(content);
    
    // Set as current file
    currentFileId = fileId;

    setExcelStatus();

    showSuccess('File uploaded and analyzed successfully!');
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
    
    // Check if file already exists in the list
    const existingItem = fileList.querySelector(`[data-file-id="${fileId}"]`);
    if (existingItem) {
        // Update existing item instead of adding duplicate
        existingItem.setAttribute('data-filename', filename.toLowerCase());
        existingItem.innerHTML = `
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
        return;
    }
    
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
    if (!fileId || !uploadedFiles[fileId]) return;
    currentFileId = fileId;

    // Enable chat input when a file is selected
    if (chatInput && sendChatBtn) {
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.placeholder = `Ask a question about ${uploadedFiles[fileId].filename}...`;
    }

    // Hide placeholder, show empty chat ready state
    if (chatPlaceholder) {
        chatPlaceholder.style.display = 'none';
    }

    setExcelStatus();
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
                
                // Clear current selection if this was the selected file
                if (currentFileId === fileId) {
                    currentFileId = null;
                    
                    // Reset chat interface
                    if (chatPlaceholder) chatPlaceholder.style.display = 'block';
                    if (chatInput) {
                        chatInput.disabled = true;
                        chatInput.placeholder = 'Ask a question about the selected PDF...';
                    }
                    if (sendChatBtn) sendChatBtn.disabled = true;
                    clearChat();

                    setExcelStatus();
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

function setExcelStatus() {
    if (excelTemplateName) {
        excelTemplateName.textContent = currentExcelFilename || 'None';
    }
    if (excelSelectedPdf) {
        const pdfName = currentFileId && uploadedFiles[currentFileId]?.filename
            ? uploadedFiles[currentFileId].filename
            : 'None';
        excelSelectedPdf.textContent = pdfName;
    }
    if (fillExcelBtn) {
        fillExcelBtn.disabled = !(currentExcelId && currentFileId);
    }
    const exportTablesBtn = document.getElementById('exportTablesBtn');
    if (exportTablesBtn) {
        exportTablesBtn.disabled = !currentFileId;
    }
    const exportSingleTabBtn = document.getElementById('exportSingleTabBtn');
    if (exportSingleTabBtn) {
        exportSingleTabBtn.disabled = !currentFileId;
    }
}

function validateExcelFile(file) {
    const maxSize = 25 * 1024 * 1024;
    const isXlsx = file && file.name && file.name.toLowerCase().endsWith('.xlsx');
    if (!isXlsx) {
        showError('Please select only .xlsx files');
        return false;
    }
    if (file.size > maxSize) {
        showError('Excel file size must be less than 25MB');
        return false;
    }
    return true;
}

async function handleExcelFile(file) {
    if (!validateExcelFile(file)) return;

    try {
        showLoading(true, `Uploading ${file.name}...`);

        const formData = new FormData();
        formData.append('excelFile', file);

        const res = await fetch('/upload-excel', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Excel upload failed');
        }

        currentExcelId = data.excelId;
        currentExcelFilename = data.filename;
        setExcelStatus();
        showSuccess('Excel workbook uploaded successfully!');
    } catch (e) {
        console.error('Excel upload failed:', e);
        showError('Excel upload failed: ' + e.message);
    } finally {
        showLoading(false);
    }
}

async function exportTablesToExcel() {
    if (!currentFileId) {
        showError('Select an uploaded PDF first');
        return;
    }

    try {
        showLoading(true, 'Exporting tables to Excel...');

        const res = await fetch('/export-tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: currentFileId })
        });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Failed to export tables');
        }

        showLoading(false);
        showSuccess(`Exported ${data.tableCount} table(s) to Excel`);

        // Trigger download
        const downloadUrl = `/download-filled-excel/${data.exportId}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (error) {
        console.error('Export tables error:', error);
        showLoading(false);
        showError('Failed to export tables: ' + error.message);
    }
}

async function exportSingleTab() {
    if (!currentFileId) {
        showError('Select an uploaded PDF first');
        return;
    }

    try {
        showLoading(true, 'Exporting tables to single tab...');

        const res = await fetch('/export-single-tab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: currentFileId })
        });
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.error || 'Failed to export tables');
        }

        showLoading(false);
        showSuccess(`Exported ${data.tableCount} table(s) to single worksheet`);

        // Trigger download
        const downloadUrl = `/download-filled-excel/${data.exportId}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (error) {
        console.error('Export single tab error:', error);
        showLoading(false);
        showError('Failed to export tables: ' + error.message);
    }
}

async function fillExcelWorkbook() {
    if (!currentExcelId) {
        showError('Upload an Excel workbook first');
        return;
    }
    if (!currentFileId) {
        showError('Select an uploaded PDF first');
        return;
    }

    try {
        showLoading(true, 'Starting workbook fill...');

        const res = await fetch('/fill-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excelId: currentExcelId, fileId: currentFileId })
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to start fill workbook');
        }

        const { jobId, total } = data;
        
        // Poll for progress
        const pollInterval = setInterval(async () => {
            try {
                const progressRes = await fetch(`/fill-excel-progress/${jobId}`);
                const progress = await progressRes.json();
                
                if (progress.status === 'processing') {
                    showLoading(true, `Processing: ${progress.current} of ${progress.total} complete...`);
                } else if (progress.status === 'complete') {
                    clearInterval(pollInterval);
                    showLoading(false);
                    
                    const link = document.createElement('a');
                    link.href = progress.result.downloadUrl;
                    link.download = progress.result.filename || 'filled.xlsx';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showSuccess('Generated filled workbook. Download should start automatically.');
                } else if (progress.status === 'error') {
                    clearInterval(pollInterval);
                    showLoading(false);
                    throw new Error(progress.error || 'Fill workbook failed');
                }
            } catch (pollError) {
                clearInterval(pollInterval);
                showLoading(false);
                console.error('Progress poll error:', pollError);
                showError('Progress tracking failed: ' + pollError.message);
            }
        }, 500); // Poll every 500ms
        
    } catch (e) {
        console.error('Fill workbook failed:', e);
        showError('Fill workbook failed: ' + e.message);
        showLoading(false);
    }
}

// ========== Chat Functions ==========

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentFileId) return;

    try {
        // Add user message to chat
        addChatMessage(message, 'user');
        chatInput.value = '';
        chatInput.disabled = true;
        sendChatBtn.disabled = true;

        // Show typing indicator
        const typingId = addChatMessage('Thinking...', 'assistant', true);

        // Send to backend
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: message,
                fileId: currentFileId 
            })
        });

        const data = await response.json();
        
        // Remove typing indicator
        const typingMsg = document.getElementById(typingId);
        if (typingMsg) typingMsg.remove();

        if (!response.ok) {
            throw new Error(data.error || 'Chat request failed');
        }

        // Add assistant response
        addChatMessage(data.response, 'assistant');

    } catch (error) {
        console.error('Chat error:', error);
        showError('Chat failed: ' + error.message);
        
        // Remove typing indicator on error
        const typingMsg = document.querySelector('.chat-message.typing');
        if (typingMsg) typingMsg.remove();
    } finally {
        chatInput.disabled = false;
        sendChatBtn.disabled = false;
        chatInput.focus();
    }
}

function addChatMessage(content, role, isTyping = false) {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message chat-message--${role}${isTyping ? ' typing' : ''}`;
    messageDiv.id = messageId;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-avatar';
    avatarDiv.textContent = role === 'user' ? '👤' : '🤖';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

function clearChat() {
    if (!chatMessages) return;
    
    // Remove all messages except placeholder
    const messages = chatMessages.querySelectorAll('.chat-message');
    messages.forEach(msg => msg.remove());
    
    // Show placeholder if no file selected
    if (!currentFileId && chatPlaceholder) {
        chatPlaceholder.style.display = 'block';
    }
}