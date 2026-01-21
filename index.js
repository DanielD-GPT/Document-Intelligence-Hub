const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const ExcelJS = require('exceljs');
const DOTENV_PATH = path.resolve(__dirname, '.env');
require('dotenv').config({ path: DOTENV_PATH, override: true });

const app = express();
const PORT = process.env.PORT || 8080;

function getEnv(name) {
    return (process.env[name] || '').trim();
}

function isPlaceholder(value) {
    return !value || /^your_/i.test(value) || /_here$/i.test(value);
}

function requireEnv(name) {
    const value = getEnv(name);
    if (isPlaceholder(value)) {
        throw new Error(`Missing or placeholder ${name}. Update your .env file.`);
    }
    return value;
}

function requireAnyEnv(names, canonicalNameForError) {
    for (const name of names) {
        const value = getEnv(name);
        if (!isPlaceholder(value)) {
            return value;
        }
    }
    const canonical = canonicalNameForError || names[0] || 'ENV_VAR';
    throw new Error(`Missing or placeholder ${canonical}. Update your .env file.`);
}

function normalizeBaseUrl(rawUrl, nameForErrors) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('Unsupported protocol');
        }
        // Ensure it acts as a base URL
        if (!url.pathname.endsWith('/')) {
            url.pathname = url.pathname + '/';
        }
        return url.toString();
    } catch (e) {
        throw new Error(
            `Invalid ${nameForErrors}. Expected a full URL like https://<your-resource>/`
        );
    }
}

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

// Configure multer for Excel uploads (.xlsx templates)
const excelUpload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        const isXlsx = file.originalname.toLowerCase().endsWith('.xlsx');
        if (allowedTypes.includes(file.mimetype) || isXlsx) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx files are allowed'), false);
        }
    },
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB limit
    }
});

// Store document analysis results and file paths in memory
let documentAnalysis = {};
let filePaths = {}; // Store file paths for deletion

// Store uploaded Excel templates (paths) and generated filled workbooks (paths)
let excelTemplates = {}; // { excelId: { filename, path, uploadTime } }
let filledWorkbooks = {}; // { filledId: { filename, path, createdTime } }

// Store fill job progress
let fillJobs = {}; // { jobId: { status, current, total, startTime, error, result } }

function createId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeFilename(name) {
    return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isZipFileHeader(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(4);
        const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);
        if (bytesRead < 4) return false;

        // ZIP files start with: 50 4B 03 04 (or other PK variants)
        return buffer[0] === 0x50 && buffer[1] === 0x4B;
    } catch (_) {
        return false;
    }
}

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
        const endpointBase = normalizeBaseUrl(
            requireEnv('AZURE_CONTENT_UNDERSTANDING_ENDPOINT'),
            'AZURE_CONTENT_UNDERSTANDING_ENDPOINT'
        );
        const subscriptionKey = requireEnv('AZURE_CONTENT_UNDERSTANDING_KEY');

        const analyzeUrl = new URL(
            'formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31',
            endpointBase
        ).toString();

        // First, start the document analysis
        const formData = new FormData();
        const fileStream = fs.createReadStream(filePath);
        formData.append('file', fileStream, originalFilename);

        const analyzeResponse = await axios.post(
            analyzeUrl,
            formData,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': subscriptionKey,
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
                    'Ocp-Apim-Subscription-Key': subscriptionKey
                }
            });
            attempts++;
        } while (resultResponse.data.status === 'running' && attempts < maxAttempts);

        if (resultResponse.data.status === 'succeeded') {
            // Extract text content and tables from the analysis result
            const analyzeResult = resultResponse.data.analyzeResult || {};
            const pages = analyzeResult.pages || [];
            const tables = analyzeResult.tables || [];
            let extractedText = '';
            
            // Extract text from pages
            for (const page of pages) {
                if (page.lines) {
                    for (const line of page.lines) {
                        extractedText += line.content + '\n';
                    }
                }
            }
            
            // Extract tables in a structured format
            const extractedTables = [];
            if (tables.length > 0) {
                extractedText += '\n\n=== TABLES ===\n\n';
                
                for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
                    const table = tables[tableIndex];
                    extractedText += `\n--- Table ${tableIndex + 1} (${table.rowCount} rows x ${table.columnCount} columns) ---\n`;
                    
                    // Create a 2D array for the table
                    const tableData = Array(table.rowCount).fill(null).map(() => Array(table.columnCount).fill(''));
                    
                    // Fill in cell values
                    for (const cell of table.cells) {
                        const rowIndex = cell.rowIndex || 0;
                        const columnIndex = cell.columnIndex || 0;
                        tableData[rowIndex][columnIndex] = cell.content || '';
                    }
                    
                    // Store structured table data
                    extractedTables.push({
                        tableIndex: tableIndex + 1,
                        rowCount: table.rowCount,
                        columnCount: table.columnCount,
                        data: tableData
                    });
                    
                    // Format as text table
                    for (const row of tableData) {
                        extractedText += row.join(' | ') + '\n';
                    }
                    extractedText += '\n';
                }
            }
            
            return { text: extractedText.trim(), tables: extractedTables };
        } else {
            throw new Error(`Document analysis failed with status: ${resultResponse.data.status}`);
        }
    } catch (error) {
        console.error(`Content Understanding API Error (attempt ${retryCount + 1}):`, error.response?.data || error.message);

        // Configuration / URL issues
        if (String(error.message || '').startsWith('Missing or placeholder AZURE_CONTENT_UNDERSTANDING_') ||
            String(error.message || '').startsWith('Invalid AZURE_CONTENT_UNDERSTANDING_ENDPOINT')) {
            throw error;
        }
        
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

// Debug helper: shows whether required env vars are present (no secrets returned)
app.get('/config-status', (req, res) => {
    try {
        const explain = (value) => {
            const trimmed = String(value || '').trim();
            return {
                set: Boolean(trimmed),
                placeholder: isPlaceholder(trimmed),
                trimmedLength: trimmed.length,
                startsWithYour_: /^your_/i.test(trimmed),
                endsWith_Here: /_here$/i.test(trimmed)
            };
        };

        const check = (name) => explain(getEnv(name));

        const status = {
            AZURE_CONTENT_UNDERSTANDING_ENDPOINT: check('AZURE_CONTENT_UNDERSTANDING_ENDPOINT'),
            AZURE_CONTENT_UNDERSTANDING_KEY: check('AZURE_CONTENT_UNDERSTANDING_KEY'),
            AZURE_OPENAI_ENDPOINT: check('AZURE_OPENAI_ENDPOINT'),
            AZURE_OPENAI_API_KEY: check('AZURE_OPENAI_API_KEY'),
            AZURE_OPENAI_DEPLOYMENT: check('AZURE_OPENAI_DEPLOYMENT'),
            AZURE_OPENAI_API_VERSION: {
                set: Boolean(getEnv('AZURE_OPENAI_API_VERSION')),
                placeholder: false,
                length: getEnv('AZURE_OPENAI_API_VERSION').length
            }
        };

        const ok =
            status.AZURE_CONTENT_UNDERSTANDING_ENDPOINT.set && !status.AZURE_CONTENT_UNDERSTANDING_ENDPOINT.placeholder &&
            status.AZURE_CONTENT_UNDERSTANDING_KEY.set && !status.AZURE_CONTENT_UNDERSTANDING_KEY.placeholder;

        res.json({
            ok,
            dotenv: {
                path: DOTENV_PATH,
                exists: fs.existsSync(DOTENV_PATH)
            },
            status
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message || e) });
    }
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
        const result = await analyzePDF(filePath, req.file.originalname);

        // Store document analysis result in memory
        documentAnalysis[fileId] = {
            filename: req.file.originalname,
            content: result.text,
            tables: result.tables,
            uploadTime: new Date().toISOString()
        };

        // Store file path for deletion
        filePaths[fileId] = filePath;

        res.json({
            success: true,
            fileId: fileId,
            filename: req.file.originalname,
            content: result.text
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Upload an Excel workbook template
app.post('/upload-excel', excelUpload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No Excel file uploaded' });
        }

        // Validate this is a real .xlsx (ZIP-based). Many .xls files are renamed to .xlsx and will fail later.
        if (!isZipFileHeader(req.file.path)) {
            try {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
            } catch (_) {
                // ignore cleanup failure
            }

            return res.status(400).json({
                error:
                    'Invalid workbook file. This does not appear to be a real .xlsx (ZIP-based) file. ' +
                    'It may be an older .xls workbook renamed to .xlsx. Please open it in Excel and “Save As” .xlsx, then upload again.'
            });
        }

        const excelId = createId('excel');
        excelTemplates[excelId] = {
            filename: req.file.originalname,
            path: req.file.path,
            uploadTime: new Date().toISOString()
        };

        res.json({
            success: true,
            excelId,
            filename: req.file.originalname
        });
    } catch (error) {
        console.error('Excel upload error:', error);
        res.status(500).json({ error: 'Excel upload failed: ' + error.message });
    }
});

function chunkTextForExcel(text, chunkSize = 30000) {
    const safe = String(text || '');
    if (safe.length <= chunkSize) return [safe];
    const chunks = [];
    for (let i = 0; i < safe.length; i += chunkSize) {
        chunks.push(safe.slice(i, i + chunkSize));
    }
    return chunks;
}

function buildSectionsByMarker(fullText) {
    const text = String(fullText || '');
    const markerStartRegex = /^\s*([A-Z]\.\d+)\b/gm;
    const matches = [];

    let match;
    while ((match = markerStartRegex.exec(text)) !== null) {
        matches.push({ marker: match[1], index: match.index });
    }

    const sections = {};
    for (let i = 0; i < matches.length; i++) {
        const { marker, index } = matches[i];
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const sectionText = text.slice(index, end).trim();
        if (sectionText) {
            sections[marker] = sectionText;
        }
    }

    return sections;
}

function truncateSectionText(text, maxChars = 16000) {
    const safe = String(text || '');
    if (safe.length <= maxChars) return safe;
    const head = safe.slice(0, Math.floor(maxChars / 2));
    const tail = safe.slice(-Math.floor(maxChars / 2));
    return `${head}\n\n[...TRUNCATED...]\n\n${tail}`;
}

function extractJsonObject(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (_) {
        // Fall through
    }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const candidate = raw.slice(start, end + 1);
        try {
            return JSON.parse(candidate);
        } catch (_) {
            return null;
        }
    }

    return null;
}

function normalizeGptAnswerPayload(payload, marker) {
    if (!payload || typeof payload !== 'object') return null;

    const answer = typeof payload.answer === 'string' ? payload.answer.trim() : null;
    const confidenceRaw = payload.confidence;
    const confidence = typeof confidenceRaw === 'number'
        ? confidenceRaw
        : (typeof confidenceRaw === 'string' ? Number(confidenceRaw) : NaN);
    const evidence = typeof payload.evidence_snippet === 'string' ? payload.evidence_snippet.trim() : '';
    const markerOut = typeof payload.marker === 'string' ? payload.marker.trim() : marker;

    if (!answer || !Number.isFinite(confidence)) return null;
    const boundedConfidence = Math.max(0, Math.min(1, confidence));

    return {
        answer: answer.length > 250 ? answer.slice(0, 250) : answer,
        confidence: boundedConfidence,
        evidence_snippet: evidence,
        marker: markerOut || marker
    };
}

async function generateAnswerWithAzureOpenAI({ marker, question, sectionText }) {
    const endpointBase = normalizeBaseUrl(
        requireAnyEnv(
            ['AZURE_OPENAI_ENDPOINT', 'REACT_APP_AZURE_OPENAI_CHAT_ENDPOINT', 'REACT_APP_AZURE_OPENAI_ENDPOINT'],
            'AZURE_OPENAI_ENDPOINT'
        ),
        'AZURE_OPENAI_ENDPOINT'
    );
    const apiKey = requireAnyEnv(
        ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_KEY', 'REACT_APP_AZURE_OPENAI_CHAT_KEY', 'REACT_APP_AZURE_OPENAI_KEY'],
        'AZURE_OPENAI_API_KEY'
    );
    const deployment = requireAnyEnv(
        ['AZURE_OPENAI_DEPLOYMENT', 'REACT_APP_AZURE_OPENAI_DEPLOYMENT', 'REACT_APP_AZURE_OPENAI_DEPLOYMENT_NAME'],
        'AZURE_OPENAI_DEPLOYMENT'
    );
    const apiVersion = getEnv('AZURE_OPENAI_API_VERSION') || '2024-02-15-preview';

    const url = new URL(`openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`, endpointBase).toString();

    const safeMarker = String(marker || '').trim();
    const safeQuestion = String(question || '').trim();
    const safeSectionText = truncateSectionText(sectionText || '');

    const system =
        'You are a helpful assistant. Answer questions based on the following document content:\n\n' +
        `${safeSectionText}\n\n` +
        'All questions are in column A, all answers should be placed in Column B in the cell to the right. If the answer cannot be found respond "N/A". ' +
        '\n\n' +
        'Return ONLY a single valid JSON object with EXACT keys: answer (string <= 250 chars), confidence (number 0-1), evidence_snippet (string), marker (string). ' +
        'Do not include any extra keys or text.';

    const user =
        `marker: ${safeMarker}\n` +
        `question: ${safeQuestion}\n` +
        `section_text:\n${safeSectionText}`;

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.post(
                url,
                {
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ],
                    max_tokens: 800,
                    temperature: 0.7,
                    // Best-effort: some deployments/api versions support this.
                    response_format: { type: 'json_object' }
                },
                {
                    headers: {
                        'api-key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 90000
                }
            );

            const content = response.data?.choices?.[0]?.message?.content || '';
            const parsed = extractJsonObject(content);
            const normalized = normalizeGptAnswerPayload(parsed, safeMarker);
            if (normalized) {
                return normalized;
            }

            if (attempt === maxAttempts) {
                return {
                    answer: 'NOT FOUND',
                    confidence: 0,
                    evidence_snippet: '',
                    marker: safeMarker
                };
            }
        } catch (error) {
            // If response_format isn't supported, retry without it.
            const status = error.response?.status;
            const message = String(error.response?.data?.error?.message || error.message || '');
            if (status === 400 && /response_format/i.test(message) && attempt < maxAttempts) {
                try {
                    const response = await axios.post(
                        url,
                        {
                            messages: [
                                { role: 'system', content: system },
                                { role: 'user', content: user }
                            ],
                            max_tokens: 800,
                            temperature: 0.7
                        },
                        {
                            headers: {
                                'api-key': apiKey,
                                'Content-Type': 'application/json'
                            },
                            timeout: 90000
                        }
                    );

                    const content = response.data?.choices?.[0]?.message?.content || '';
                    const parsed = extractJsonObject(content);
                    const normalized = normalizeGptAnswerPayload(parsed, safeMarker);
                    if (normalized) {
                        return normalized;
                    }
                } catch (_) {
                    // fall through to retry loop
                }
            }

            if (attempt === maxAttempts) {
                throw new Error(`Azure OpenAI answer generation failed: ${error.response?.data?.error?.message || error.message}`);
            }
        }
    }

    return {
        answer: 'NOT FOUND',
        confidence: 0,
        evidence_snippet: '',
        marker: String(marker || '').trim()
    };
}

// Start filling an uploaded workbook with extracted content (background job)
app.post('/fill-excel', async (req, res) => {
    try {
        const { excelId, fileId } = req.body || {};
        if (!excelId || !excelTemplates[excelId]) {
            return res.status(400).json({ error: 'Invalid or missing excelId' });
        }
        if (!fileId || !documentAnalysis[fileId]) {
            return res.status(400).json({ error: 'Invalid or missing fileId (PDF analysis)' });
        }

        const template = excelTemplates[excelId];
        const analysis = documentAnalysis[fileId];

        if (!template?.path || !fs.existsSync(template.path)) {
            return res.status(400).json({ error: 'Excel template file is missing on disk. Please re-upload the workbook.' });
        }

        if (!isZipFileHeader(template.path)) {
            return res.status(400).json({
                error:
                    'Excel template is not a valid .xlsx (ZIP-based) file. ' +
                    'It may be an older .xls workbook renamed to .xlsx. Please “Save As” .xlsx and upload again.'
            });
        }

        // Count total questions to process
        let totalQuestions = 0;
        const workbookForCount = new ExcelJS.Workbook();
        await workbookForCount.xlsx.readFile(template.path);
        const markerCellRegex = /\b([A-Z]\.\d+)\b/;
        
        for (const worksheet of workbookForCount.worksheets) {
            const lastRow = worksheet.rowCount || 0;
            for (let rowIndex = 1; rowIndex <= lastRow; rowIndex++) {
                const cellA = worksheet.getCell(rowIndex, 1);
                const rawA = String(cellA?.text ?? cellA?.value ?? '').trim();
                if (!rawA) continue;
                const markerMatch = rawA.match(markerCellRegex);
                if (!markerMatch) {
                    totalQuestions++;
                }
            }
        }

        const jobId = createId('fillJob');
        fillJobs[jobId] = {
            status: 'processing',
            current: 0,
            total: totalQuestions,
            startTime: Date.now(),
            error: null,
            result: null
        };

        // Start background processing
        processFillJob(jobId, excelId, fileId).catch(error => {
            console.error('Fill job error:', error);
            fillJobs[jobId].status = 'error';
            fillJobs[jobId].error = error.message;
        });

        res.json({ success: true, jobId, total: totalQuestions });
    } catch (error) {
        console.error('Fill Excel error:', error);
        res.status(500).json({ error: `Fill workbook failed: ${error.message}` });
    }
});

// Background job processor
async function processFillJob(jobId, excelId, fileId) {
    const job = fillJobs[jobId];
    const template = excelTemplates[excelId];
    const analysis = documentAnalysis[fileId];
    
    const fullText = analysis.content || '';
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(template.path);
    
    const markerCellRegex = /\b([A-Z]\.\d+)\b/;
    
    for (const worksheet of workbook.worksheets) {
        const lastRow = worksheet.rowCount || 0;
        
        for (let rowIndex = 1; rowIndex <= lastRow; rowIndex++) {
            const cellA = worksheet.getCell(rowIndex, 1);
            const rawA = String(cellA?.text ?? cellA?.value ?? '').trim();
            if (!rawA) continue;
            
            // Skip rows that are section markers
            const markerMatch = rawA.match(markerCellRegex);
            if (markerMatch) {
                continue;
            }
            
            const cellB = worksheet.getCell(rowIndex, 2);
            
            // Use entire PDF content for each question
            const payload = await generateAnswerWithAzureOpenAI({
                marker: '',
                question: rawA,
                sectionText: fullText
            });
            
            cellB.value = (payload?.answer || 'N/A').toString().slice(0, 250);
            job.current++;
        }
    }
    
    const safeBase = sanitizeFilename((analysis.filename || 'analysis').replace(/\.pdf$/i, ''));
    const outName = `${safeBase}_filled.xlsx`;
    const filledId = createId('filled');
    const outPath = path.join(__dirname, 'uploads', `${filledId}-${outName}`);
    await workbook.xlsx.writeFile(outPath);
    
    filledWorkbooks[filledId] = {
        filename: outName,
        path: outPath,
        createdTime: new Date().toISOString()
    };
    
    job.status = 'complete';
    job.result = {
        filledId,
        filename: outName,
        downloadUrl: `/download-filled-excel/${filledId}`
    };
}

// Get progress of a fill job
app.get('/fill-excel-progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = fillJobs[jobId];
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
        status: job.status,
        current: job.current,
        total: job.total,
        error: job.error,
        result: job.result
    });
});

// Export tables to Excel workbook
app.post('/export-tables', async (req, res) => {
    try {
        const { fileId } = req.body;
        
        if (!fileId || !documentAnalysis[fileId]) {
            return res.status(400).json({ error: 'Invalid or missing fileId' });
        }
        
        const analysis = documentAnalysis[fileId];
        
        if (!analysis.tables || analysis.tables.length === 0) {
            return res.status(400).json({ error: 'No tables found in this document' });
        }
        
        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        
        // Create a worksheet for each table
        for (const table of analysis.tables) {
            const sheetName = `Table ${table.tableIndex}`;
            const worksheet = workbook.addWorksheet(sheetName);
            
            // Add table data maintaining row/column structure
            for (let rowIndex = 0; rowIndex < table.data.length; rowIndex++) {
                const row = table.data[rowIndex];
                for (let colIndex = 0; colIndex < row.length; colIndex++) {
                    const cell = worksheet.getCell(rowIndex + 1, colIndex + 1);
                    cell.value = row[colIndex];
                    
                    // Style header row (first row)
                    if (rowIndex === 0) {
                        cell.font = { bold: true };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD9D9D9' }
                        };
                    }
                }
            }
            
            // Auto-fit columns
            worksheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    const length = cell.value ? cell.value.toString().length : 10;
                    if (length > maxLength) {
                        maxLength = length;
                    }
                });
                column.width = Math.min(maxLength + 2, 50);
            });
        }
        
        // Save workbook
        const safeBase = sanitizeFilename((analysis.filename || 'tables').replace(/\.pdf$/i, ''));
        const outName = `${safeBase}_tables.xlsx`;
        const exportId = createId('export');
        const outPath = path.join(__dirname, 'uploads', `${exportId}-${outName}`);
        
        await workbook.xlsx.writeFile(outPath);
        
        // Store reference for download
        filledWorkbooks[exportId] = {
            filename: outName,
            path: outPath,
            createdTime: new Date().toISOString()
        };
        
        res.json({
            success: true,
            exportId,
            filename: outName,
            tableCount: analysis.tables.length
        });
    } catch (error) {
        console.error('Export tables error:', error);
        res.status(500).json({ error: `Export tables failed: ${error.message}` });
    }
});

// Export tables to single tab
app.post('/export-single-tab', async (req, res) => {
    try {
        const { fileId } = req.body;
        
        if (!fileId || !documentAnalysis[fileId]) {
            return res.status(400).json({ error: 'Invalid or missing fileId' });
        }
        
        const analysis = documentAnalysis[fileId];
        
        if (!analysis.tables || analysis.tables.length === 0) {
            return res.status(400).json({ error: 'No tables found in this document' });
        }
        
        // Create a new workbook with single worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('All Tables');
        
        let currentRow = 1;
        
        // Add each table vertically
        for (const table of analysis.tables) {
            // Add table header with table number
            const headerCell = worksheet.getCell(currentRow, 1);
            headerCell.value = `Table ${table.tableIndex}`;
            headerCell.font = { bold: true, size: 12 };
            headerCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' }
            };
            headerCell.font = { ...headerCell.font, color: { argb: 'FFFFFFFF' } };
            
            // Merge cells for table header
            if (table.columnCount > 1) {
                worksheet.mergeCells(currentRow, 1, currentRow, table.columnCount);
            }
            
            currentRow++;
            
            // Add table data
            for (let rowIndex = 0; rowIndex < table.data.length; rowIndex++) {
                const row = table.data[rowIndex];
                for (let colIndex = 0; colIndex < row.length; colIndex++) {
                    const cell = worksheet.getCell(currentRow, colIndex + 1);
                    cell.value = row[colIndex];
                    
                    // Style first row of each table (header row)
                    if (rowIndex === 0) {
                        cell.font = { bold: true };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD9D9D9' }
                        };
                    }
                }
                currentRow++;
            }
            
            // Add spacing between tables
            currentRow += 2;
        }
        
        // Auto-fit columns
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const length = cell.value ? cell.value.toString().length : 10;
                if (length > maxLength) {
                    maxLength = length;
                }
            });
            column.width = Math.min(maxLength + 2, 50);
        });
        
        // Save workbook
        const safeBase = sanitizeFilename((analysis.filename || 'tables').replace(/\.pdf$/i, ''));
        const outName = `${safeBase}_single_tab.xlsx`;
        const exportId = createId('export');
        const outPath = path.join(__dirname, 'uploads', `${exportId}-${outName}`);
        
        await workbook.xlsx.writeFile(outPath);
        
        // Store reference for download
        filledWorkbooks[exportId] = {
            filename: outName,
            path: outPath,
            createdTime: new Date().toISOString()
        };
        
        res.json({
            success: true,
            exportId,
            filename: outName,
            tableCount: analysis.tables.length
        });
    } catch (error) {
        console.error('Export single tab error:', error);
        res.status(500).json({ error: `Export single tab failed: ${error.message}` });
    }
});

// Download the filled workbook
app.get('/download-filled-excel/:filledId', async (req, res) => {
    try {
        const { filledId } = req.params;
        const entry = filledWorkbooks[filledId];
        if (!entry || !entry.path || !fs.existsSync(entry.path)) {
            return res.status(404).json({ error: 'Filled workbook not found' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
        return res.sendFile(path.resolve(entry.path));
    } catch (error) {
        console.error('Download filled Excel error:', error);
        return res.status(500).json({ error: 'Failed to download filled workbook' });
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

// Chat with document content
app.post('/chat', async (req, res) => {
    try {
        const { message, fileId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'No message provided' });
        }

        // Get document content if fileId is provided
        let context = '';
        if (fileId && documentAnalysis[fileId]) {
            context = documentAnalysis[fileId].content;
        }

        const endpointBase = normalizeBaseUrl(
            requireAnyEnv(
                ['AZURE_OPENAI_ENDPOINT', 'REACT_APP_AZURE_OPENAI_CHAT_ENDPOINT', 'REACT_APP_AZURE_OPENAI_ENDPOINT'],
                'AZURE_OPENAI_ENDPOINT'
            ),
            'AZURE_OPENAI_ENDPOINT'
        );
        const apiKey = requireAnyEnv(
            ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_KEY', 'REACT_APP_AZURE_OPENAI_CHAT_KEY', 'REACT_APP_AZURE_OPENAI_KEY'],
            'AZURE_OPENAI_API_KEY'
        );
        const deployment = requireAnyEnv(
            ['AZURE_OPENAI_DEPLOYMENT', 'REACT_APP_AZURE_OPENAI_DEPLOYMENT', 'REACT_APP_AZURE_OPENAI_DEPLOYMENT_NAME'],
            'AZURE_OPENAI_DEPLOYMENT'
        );
        const apiVersion = getEnv('AZURE_OPENAI_API_VERSION') || '2024-02-15-preview';

        const url = new URL(
            `openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
            endpointBase
        ).toString();

        // Call Azure OpenAI API
        const response = await axios.post(
            url,
            {
                messages: [
                    {
                        role: 'system',
                        content: context
                            ? `You are a helpful assistant. Answer questions based on the following document content:\n\n${context}`
                            : 'You are a helpful assistant.'
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ],
                max_tokens: 800,
                temperature: 0.7
            },
            {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 90000
            }
        );

        const aiResponse = response.data.choices[0]?.message?.content || 'No response generated';
        res.json({ response: aiResponse });

    } catch (error) {
        console.error('Chat error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Chat failed: ' + (error.response?.data?.error?.message || error.message)
        });
    }
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
