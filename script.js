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
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const fileSelect = document.getElementById('fileSelect');
const loadingOverlay = document.getElementById('loadingOverlay');

// Chat export buttons
const copyChatBtn = document.querySelector('.copy-chat-btn');
const exportChatBtn = document.querySelector('.export-chat-btn');

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

    // Chat functionality
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // File selection for chat
    fileSelect.addEventListener('change', handleFileSelectForChat);
    
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
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3'];
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (!allowedTypes.includes(file.type) && 
        !file.name.toLowerCase().endsWith('.wav') && 
        !file.name.toLowerCase().endsWith('.mp3')) {
        showError('Please select only .wav or .mp3 files');
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
        formData.append('audioFile', file);
        
        showLoading(true, `Uploading and transcribing ${file.name}...`);
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
                        showError('Upload/Transcription failed: ' + error.error);
                    }
                    reject(new Error(error.error || 'Upload failed'));
                } catch (e) {
                    showError('Upload/Transcription failed: ' + xhr.statusText);
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
    const { fileId, filename, transcription } = response;
    
    // Store file info
    uploadedFiles[fileId] = {
        filename: filename,
        transcription: transcription,
        fileId: fileId
    };
    
    // Add to file list
    addFileToList(fileId, filename);
    
    // Update transcription data for searching
    updateFileTranscriptionData(fileId, transcription);
    
    // Add to chat file selector
    addFileToSelector(fileId, filename);
    
    // Show transcription
    showTranscription(transcription);
    
    // Set as current file
    currentFileId = fileId;
    fileSelect.value = fileId;
    enableChat();
    
    showSuccess('File uploaded and transcribed successfully!');
}

// Add file to the uploaded files list
function addFileToList(fileId, filename) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.setAttribute('data-filename', filename.toLowerCase());
    fileItem.setAttribute('data-file-id', fileId);
    
    // Add transcription content for searching (will be updated when transcription is available)
    const transcription = uploadedFiles[fileId]?.transcription || '';
    fileItem.setAttribute('data-transcription', transcription.toLowerCase());
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-name">${filename}</div>
        </div>
        <div class="file-actions">
            <button onclick="event.stopPropagation(); deleteFile('${fileId}')">Delete</button>
        </div>
    `;
    
    // Add click event to entire file item to trigger view action
    fileItem.addEventListener('click', () => {
        selectFile(fileId);
    });
    
    // Add cursor pointer style to indicate clickability
    fileItem.style.cursor = 'pointer';
    
    fileList.appendChild(fileItem);
}

// Update transcription data attribute for a file item
function updateFileTranscriptionData(fileId, transcription) {
    const fileItem = fileList.querySelector(`[data-file-id="${fileId}"]`);
    if (fileItem) {
        fileItem.setAttribute('data-transcription', transcription.toLowerCase());
    }
}

// Filter files based on search input
function filterFiles() {
    const searchTerm = fileSearchInput.value.toLowerCase().trim();
    const fileItems = fileList.querySelectorAll('.file-item');
    let visibleCount = 0;
    
    // Show/hide clear button based on input content
    toggleClearButton();
    
    fileItems.forEach(item => {
        const filename = item.getAttribute('data-filename');
        const transcription = item.getAttribute('data-transcription') || '';
        
        // Search in both filename and transcription content
        const filenameMatch = filename.includes(searchTerm);
        const transcriptionMatch = transcription.includes(searchTerm);
        const isMatch = filenameMatch || transcriptionMatch;
        
        if (isMatch) {
            item.style.display = 'flex';
            visibleCount++;
            
            // Add visual indicator for content vs filename matches
            updateMatchIndicator(item, filenameMatch, transcriptionMatch, searchTerm);
        } else {
            item.style.display = 'none';
            // Remove any existing match indicators
            removeMatchIndicator(item);
        }
    });
    
    // Show/hide "no results" message
    updateNoResultsMessage(visibleCount, searchTerm);
    
    // Update transcription highlighting if a file is currently selected
    updateTranscriptionHighlighting(searchTerm);
}

// Clear the search input and reset the file list
function clearSearch() {
    const fileSearchInput = document.getElementById('fileSearchInput');
    fileSearchInput.value = '';
    filterFiles();
    fileSearchInput.focus();
}

// Toggle the visibility of the clear button
function toggleClearButton() {
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchInput = document.getElementById('fileSearchInput');
    
    if (searchInput.value.trim() !== '') {
        clearBtn.style.display = 'flex';
    } else {
        clearBtn.style.display = 'none';
    }
}

// Update or show/hide "no results" message
function updateNoResultsMessage(visibleCount, searchTerm) {
    let noResultsMsg = fileList.querySelector('.no-results-message');
    
    if (visibleCount === 0 && searchTerm !== '') {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement('div');
            noResultsMsg.className = 'no-results-message';
            fileList.appendChild(noResultsMsg);
        }
        noResultsMsg.innerHTML = `No files found matching "<strong>${searchTerm}</strong>"<br><small>Searched in filenames and transcriptions</small>`;
        noResultsMsg.style.display = 'block';
    } else {
        if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
        }
    }
}

// Add visual indicator for search matches
function updateMatchIndicator(item, filenameMatch, transcriptionMatch, searchTerm) {
    // Remove existing indicators
    removeMatchIndicator(item);
    
    if (!searchTerm) return;
    
    const fileInfo = item.querySelector('.file-info');
    let matchIndicator = document.createElement('div');
    matchIndicator.className = 'match-indicator';
    
    if (filenameMatch && transcriptionMatch) {
        matchIndicator.innerHTML = '<span class="match-type filename-match">📄</span><span class="match-type content-match">📝</span> <small>Filename + Content</small>';
    } else if (filenameMatch) {
        matchIndicator.innerHTML = '<span class="match-type filename-match">📄</span> <small>Filename match</small>';
    } else if (transcriptionMatch) {
        matchIndicator.innerHTML = '<span class="match-type content-match">📝</span> <small>Content match</small>';
    }
    
    fileInfo.appendChild(matchIndicator);
}

// Remove match indicator from file item
function removeMatchIndicator(item) {
    const existingIndicator = item.querySelector('.match-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
}

// Update transcription highlighting when search term changes
function updateTranscriptionHighlighting(searchTerm) {
    if (currentFileId && uploadedFiles[currentFileId]) {
        showTranscription(uploadedFiles[currentFileId].transcription, searchTerm);
    }
}

// Clear search and show all files
function clearFileSearch() {
    fileSearchInput.value = '';
    filterFiles();
}

// Add file to chat selector
function addFileToSelector(fileId, filename) {
    const option = document.createElement('option');
    option.value = fileId;
    option.textContent = filename;
    fileSelect.appendChild(option);
}

// Select a file for viewing/chat
function selectFile(fileId) {
    if (uploadedFiles[fileId]) {
        currentFileId = fileId;
        fileSelect.value = fileId;
        
        // Get current search term for highlighting
        const searchTerm = fileSearchInput.value.toLowerCase().trim();
        showTranscription(uploadedFiles[fileId].transcription, searchTerm);
        
        enableChat();
        loadChatHistory(fileId);
    }
}

// Delete a file
async function deleteFile(fileId) {
    if (confirm('Are you sure you want to delete this file permanently? This cannot be undone.')) {
        try {
            // Show loading state
            const deleteButton = document.querySelector(`button[onclick="deleteFile('${fileId}')"]`);
            const originalText = deleteButton.textContent;
            deleteButton.textContent = 'Deleting...';
            deleteButton.disabled = true;
            
            // Call server to permanently delete the file
            const response = await fetch(`/files/${fileId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                // Remove from local storage
                delete uploadedFiles[fileId];
                
                // Remove from file list UI
                const fileItems = document.querySelectorAll('.file-item');
                fileItems.forEach(item => {
                    if (item.getAttribute('data-file-id') === fileId) {
                        item.remove();
                    }
                });
                
                // Remove from selector
                const option = fileSelect.querySelector(`option[value="${fileId}"]`);
                if (option) {
                    option.remove();
                }
                
                // Clear if current file
                if (currentFileId === fileId) {
                    currentFileId = null;
                    fileSelect.value = '';
                    clearTranscription();
                    disableChat();
                    clearChatMessages();
                }
                
                // Refresh search results after deletion
                filterFiles();
                
                showSuccess('File deleted permanently from server');
            } else {
                throw new Error(result.error || 'Failed to delete file');
            }
            
        } catch (error) {
            console.error('Delete error:', error);
            showError('Failed to delete file: ' + error.message);
            
            // Re-enable button on error
            const deleteButton = document.querySelector(`button[onclick="deleteFile('${fileId}')"]`);
            if (deleteButton) {
                deleteButton.textContent = 'Delete';
                deleteButton.disabled = false;
            }
        }
    }
}

// Show transcription
function showTranscription(transcription, searchTerm = '') {
    transcriptionPlaceholder.style.display = 'none';
    transcriptionText.style.display = 'block';
    
    if (searchTerm && searchTerm.length > 0) {
        // Create highlighted version for display
        const highlightedTranscription = highlightSearchTerms(transcription, searchTerm);
        
        // Hide the textarea and show highlighted div
        transcriptionText.style.display = 'none';
        showHighlightedTranscription(highlightedTranscription);
    } else {
        // Show normal textarea without highlighting
        hideHighlightedTranscription();
        transcriptionText.style.display = 'block';
        transcriptionText.value = transcription;
    }
}

// Highlight search terms in transcription text
function highlightSearchTerms(text, searchTerm) {
    if (!searchTerm || searchTerm.length === 0) {
        return text;
    }
    
    // Escape special regex characters in search term
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create regex for case-insensitive global match
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    // Replace matches with highlighted spans
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// Show highlighted transcription in a div
function showHighlightedTranscription(highlightedText) {
    let highlightDiv = document.getElementById('highlighted-transcription');
    
    if (!highlightDiv) {
        // Create the highlighted transcription div
        highlightDiv = document.createElement('div');
        highlightDiv.id = 'highlighted-transcription';
        highlightDiv.className = 'highlighted-transcription';
        
        // Insert it after the transcription textarea
        transcriptionText.parentNode.insertBefore(highlightDiv, transcriptionText.nextSibling);
    }
    
    highlightDiv.innerHTML = highlightedText;
    highlightDiv.style.display = 'block';
}

// Hide highlighted transcription div
function hideHighlightedTranscription() {
    const highlightDiv = document.getElementById('highlighted-transcription');
    if (highlightDiv) {
        highlightDiv.style.display = 'none';
    }
}

// Clear transcription
function clearTranscription() {
    transcriptionPlaceholder.style.display = 'block';
    transcriptionText.style.display = 'none';
    transcriptionText.value = '';
    hideHighlightedTranscription();
}

// Chat functionality
function handleFileSelectForChat() {
    const selectedFileId = fileSelect.value;
    if (selectedFileId && uploadedFiles[selectedFileId]) {
        currentFileId = selectedFileId;
        
        // Get current search term for highlighting
        const searchTerm = fileSearchInput.value.toLowerCase().trim();
        showTranscription(uploadedFiles[selectedFileId].transcription, searchTerm);
        
        enableChat();
        loadChatHistory(selectedFileId);
    } else {
        currentFileId = null;
        disableChat();
        clearChatMessages();
    }
    updateChatExportButtons();
}

function enableChat() {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.placeholder = "Ask a question about the transcribed audio...";
}

function disableChat() {
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = "Select a transcribed file to start chatting...";
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentFileId) return;
    
    // Disable input while processing
    chatInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Thinking...';
    
    // Add user message to UI
    addMessageToChat('user', message);
    chatInput.value = '';
    
    // Add typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
        const response = await fetch(`/chat/${currentFileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: message })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingIndicator);
        
        if (response.ok) {
            // Add AI response to UI
            addMessageToChat('assistant', data.response);
        } else {
            showError('Chat error: ' + data.error);
        }
        
    } catch (error) {
        // Remove typing indicator
        removeTypingIndicator(typingIndicator);
        showError('Chat error: ' + error.message);
    } finally {
        // Re-enable input
        chatInput.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        chatInput.focus();
    }
}

function addMessageToChat(role, content) {
    // Hide placeholder if it exists
    const placeholder = chatMessages.querySelector('.chat-placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-content">${content}</div>
        <div class="message-time">${timeString}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Update export button states
    updateChatExportButtons();
}

async function loadChatHistory(fileId) {
    try {
        const response = await fetch(`/chat/${fileId}`);
        const data = await response.json();
        
        clearChatMessages();
        
        if (data.chatHistory && data.chatHistory.length > 0) {
            data.chatHistory.forEach(msg => {
                addMessageToChat(msg.role, msg.content);
            });
        }
        
        updateChatExportButtons();
        
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

function clearChatMessages() {
    chatMessages.innerHTML = `
        <div class="chat-placeholder">
            <p>Select a transcribed file and start asking questions about the audio content!</p>
        </div>
    `;
    updateChatExportButtons();
}

function clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
        clearChatMessages();
    }
}

// Update chat export button states
function updateChatExportButtons() {
    const hasMessages = chatMessages.querySelectorAll('.message:not(.typing-indicator)').length > 0;
    const hasSelectedFile = currentFileId !== null;
    
    if (copyChatBtn) {
        copyChatBtn.disabled = !hasMessages || !hasSelectedFile;
    }
    if (exportChatBtn) {
        exportChatBtn.disabled = !hasMessages || !hasSelectedFile;
    }
}

// Typing indicator functions
function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.innerHTML = `
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>AI is thinking...</span>
        </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return typingDiv;
}

function removeTypingIndicator(indicator) {
    if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
    }
}

// Utility functions
function showUploadProgress(show) {
    uploadProgress.style.display = show ? 'block' : 'none';
    if (!show) {
        progressFill.style.width = '0%';
    }
}

function updateProgress(percent) {
    progressFill.style.width = percent + '%';
    progressText.textContent = `Uploading... ${Math.round(percent)}%`;
}

function showLoading(show, message = 'Processing audio file...') {
    loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        const messageElement = loadingOverlay.querySelector('p');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }
}

function showError(message) {
    alert('Error: ' + message);
}

function showRateLimitError(message) {
    // Create a more informative rate limit error display
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 400px;
        border-left: 4px solid #ff5252;
    `;
    errorDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Rate Limit Exceeded</div>
        <div style="margin-bottom: 12px;">${message}</div>
        <div style="font-size: 14px; opacity: 0.9;">
            💡 <strong>Tips:</strong><br>
            • Wait 2-3 minutes between uploads<br>
            • Upload files one at a time<br>
            • Try again in a few minutes
        </div>
        <button onclick="this.parentElement.remove()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
        ">Close</button>
    `;
    document.body.appendChild(errorDiv);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 10000);
}

function showSuccess(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        document.body.removeChild(successDiv);
    }, 3000);
}

// Transcription utility functions
function copyTranscription() {
    if (transcriptionText.value) {
        navigator.clipboard.writeText(transcriptionText.value).then(() => {
            showSuccess('Transcription copied to clipboard!');
        });
    }
}

function downloadTranscription() {
    if (transcriptionText.value && currentFileId) {
        const filename = uploadedFiles[currentFileId]?.filename || 'transcription';
        const blob = new Blob([transcriptionText.value], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_transcription.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Chat export utility functions
function copyChatHistory() {
    if (!currentFileId) {
        showError('Please select a file first');
        return;
    }
    
    const messages = chatMessages.querySelectorAll('.message:not(.typing-indicator)');
    if (messages.length === 0) {
        showError('No chat history to copy');
        return;
    }
    
    let chatText = `Chat History for: ${uploadedFiles[currentFileId]?.filename || 'Unknown File'}\n`;
    chatText += `Generated on: ${new Date().toLocaleString()}\n`;
    chatText += '=' + '='.repeat(50) + '\n\n';
    
    messages.forEach(message => {
        const role = message.classList.contains('user') ? 'You' : 'AI Assistant';
        const content = message.querySelector('.message-content').textContent;
        const time = message.querySelector('.message-time')?.textContent || '';
        
        chatText += `${role} ${time ? `(${time})` : ''}:\n${content}\n\n`;
    });
    
    navigator.clipboard.writeText(chatText).then(() => {
        showSuccess('Chat history copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy chat history');
    });
}

function exportChatHistory() {
    if (!currentFileId) {
        showError('Please select a file first');
        return;
    }
    
    const messages = chatMessages.querySelectorAll('.message:not(.typing-indicator)');
    if (messages.length === 0) {
        showError('No chat history to export');
        return;
    }
    
    const filename = uploadedFiles[currentFileId]?.filename || 'chat';
    let chatText = `Chat History for: ${filename}\n`;
    chatText += `Generated on: ${new Date().toLocaleString()}\n`;
    chatText += '=' + '='.repeat(50) + '\n\n';
    
    // Add transcription context
    if (uploadedFiles[currentFileId]?.transcription) {
        chatText += 'Original Transcription:\n';
        chatText += '-'.repeat(25) + '\n';
        chatText += uploadedFiles[currentFileId].transcription + '\n\n';
        chatText += 'Chat Conversation:\n';
        chatText += '-'.repeat(20) + '\n\n';
    }
    
    messages.forEach((message, index) => {
        const role = message.classList.contains('user') ? 'You' : 'AI Assistant';
        const content = message.querySelector('.message-content').textContent;
        const time = message.querySelector('.message-time')?.textContent || '';
        
        chatText += `${index + 1}. ${role} ${time ? `(${time})` : ''}:\n${content}\n\n`;
    });
    
    // Create and download the file
    const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.[^/.]+$/, '')}_chat_history_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showSuccess('Chat history exported successfully!');
}

// Load existing transcriptions on page load
async function loadExistingTranscriptions() {
    try {
        const response = await fetch('/transcriptions');
        const transcriptions = await response.json();
        
        Object.entries(transcriptions).forEach(([fileId, data]) => {
            uploadedFiles[fileId] = {
                filename: data.filename,
                transcription: data.transcription,
                fileId: fileId
            };
            
            addFileToList(fileId, data.filename);
            // Update transcription data for searching
            updateFileTranscriptionData(fileId, data.transcription);
            addFileToSelector(fileId, data.filename);
        });
        
    } catch (error) {
        console.error('Error loading existing transcriptions:', error);
    }
}