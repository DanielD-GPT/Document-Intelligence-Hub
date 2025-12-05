const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf'];
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.toLowerCase().endsWith('.pdf')) {
        cb(null, true);
    } else {
        cb(new Error('Only .pdf files are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Store document analysis results and file paths in memory
let documentAnalysis = {};
let filePaths = {}; // Store file paths for deletion

// Function to rebuild filePaths mapping from existing files
function rebuildFilePathsMapping() {
    try {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            files.forEach(filename => {
                const filePath = path.join(uploadsDir, filename);
                // Use the filename as the fileId (this is how multer names the files)
                filePaths[filename] = filePath;
            });
            console.log(`Rebuilt file paths mapping for ${files.length} files`);
        }
    } catch (error) {
        console.error('Error rebuilding file paths mapping:', error);
    }
}

// Azure Content Understanding API integration with retry logic
async function analyzePDF(filePath, originalFilename, retryCount = 0) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    
    try {
        // First, start the document analysis
        const formData = new FormData();
        const fileStream = fs.createReadStream(filePath);
        formData.append('file', fileStream, originalFilename);

        const analyzeResponse = await axios.post(
            `${process.env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT}formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
            formData,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': process.env.AZURE_CONTENT_UNDERSTANDING_KEY,
                    ...formData.getHeaders()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 90000
            }
        );

        // Get the operation location from the response headers
        const operationLocation = analyzeResponse.headers['operation-location'];
        if (!operationLocation) {
            throw new Error('No operation location received from Content Understanding API');
        }

        // Poll for results
        let resultResponse;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute timeout
        
        do {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            resultResponse = await axios.get(operationLocation, {
                headers: {
                    'Ocp-Apim-Subscription-Key': process.env.AZURE_CONTENT_UNDERSTANDING_KEY
                }
            });
            attempts++;
        } while (resultResponse.data.status === 'running' && attempts < maxAttempts);

        if (resultResponse.data.status === 'succeeded') {
            // Extract text content from the analysis result
            const pages = resultResponse.data.analyzeResult?.pages || [];
            let extractedText = '';
            
            for (const page of pages) {
                if (page.lines) {
                    for (const line of page.lines) {
                        extractedText += line.content + '\n';
                    }
                }
            }
            
            return extractedText.trim();
        } else {
            throw new Error(`Document analysis failed with status: ${resultResponse.data.status}`);
        }
    } catch (error) {
        console.error(`Content Understanding API Error (attempt ${retryCount + 1}):`, error.response?.data || error.message);
        
        // Handle rate limiting with exponential backoff
        if (error.response?.status === 429 && retryCount < maxRetries) {
            const delay = baseDelay * Math.pow(2, retryCount) + Math.random() * 1000;
            console.log(`Rate limited. Retrying in ${Math.round(delay)}ms... (attempt ${retryCount + 1}/${maxRetries})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return analyzePDF(filePath, originalFilename, retryCount + 1);
        }
        
        // Return user-friendly error messages
        if (error.response?.status === 401) {
            throw new Error('Authentication failed - please check your API key');
        } else if (error.response?.status === 429) {
            throw new Error(`Rate limit exceeded. Please wait a few minutes before uploading more files. (Tried ${retryCount + 1} times)`);
        } else if (error.response?.status === 413) {
            throw new Error('File too large for Content Understanding service');
        } else if (error.response?.status === 400) {
            throw new Error('Invalid PDF file format or corrupted file');
        } else if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout - the audio file might be too large or network is slow');
        } else {
            throw new Error(`Document analysis failed: ${error.response?.data?.error?.message || error.message}`);
        }
    }
}



// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve PDF files
app.get('/pdf/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        // First, try to serve from local file system using known file path
        let filePath = filePaths[fileId];
        
        // If not in filePaths mapping, try to construct the path directly
        if (!filePath) {
            const uploadsDir = path.join(__dirname, 'uploads');
            const potentialPath = path.join(uploadsDir, fileId);
            if (fs.existsSync(potentialPath)) {
                filePath = potentialPath;
                // Update the mapping for future use
                filePaths[fileId] = filePath;
            }
        }
        
        // If we found a local file, serve it
        if (filePath && fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
            console.log(`Serving PDF from local file: ${filePath}`);
            return res.sendFile(path.resolve(filePath));
        }
        
        // File not found
        console.log(`PDF file not found: ${fileId}`);
        return res.status(404).json({ error: 'PDF file not found' });
        
    } catch (error) {
        console.error('Error serving PDF:', error);
        return res.status(500).json({ error: 'Error retrieving PDF file' });
    }
});



// Upload and analyze PDF file
app.post('/upload', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const fileId = req.file.filename;

        // Call Azure Content Understanding API for PDF analysis
        const extractedText = await analyzePDF(filePath, req.file.originalname);

        // Store document analysis result in memory
        documentAnalysis[fileId] = {
            filename: req.file.originalname,
            content: extractedText,
            uploadTime: new Date().toISOString()
        };

        // Store file path for deletion
        filePaths[fileId] = filePath;

        res.json({
            success: true,
            fileId: fileId,
            filename: req.file.originalname,
            content: extractedText
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Get document analysis by file ID
app.get('/transcription/:fileId', (req, res) => {
    const { fileId } = req.params;
    const analysis = documentAnalysis[fileId];
    
    if (!analysis) {
        return res.status(404).json({ error: 'Document analysis not found' });
    }
    
    res.json(analysis);
});



// Get all document analyses
app.get('/transcriptions', (req, res) => {
    res.json(documentAnalysis);
});

// Delete a file and its data
app.delete('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Check if file exists locally
        if (!documentAnalysis[fileId]) {
            return res.status(404).json({ error: 'File not found' });
        }
        

        
        // Delete physical file from filesystem
        if (filePaths[fileId]) {
            try {
                if (fs.existsSync(filePaths[fileId])) {
                    fs.unlinkSync(filePaths[fileId]);
                    console.log(`Deleted file: ${filePaths[fileId]}`);
                }
            } catch (fileError) {
                console.error('Error deleting physical file:', fileError);
                // Continue with data cleanup even if file deletion fails
            }
            delete filePaths[fileId];
        }
        
        // Remove from local document analysis
        delete documentAnalysis[fileId];
        
        res.json({ 
            success: true, 
            message: 'File deleted successfully',
            fileId: fileId 
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete file: ' + error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
    }
    res.status(500).json({ error: error.message });
});

// Initialize server
function startServer() {
    // Rebuild file paths mapping from existing files
    rebuildFilePathsMapping();
    
    // Start the Express server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Using in-memory storage for document analysis');
    });
}

// Start the server
startServer();
