# Flask Migration Guide

## Overview
This application has been refactored from Node.js/Express to Python/Flask.

## Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

## Setup Instructions

### 1. Create a Virtual Environment (Recommended)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables
1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env  # Windows
   # or
   cp .env.example .env  # Linux/Mac
   ```

2. Edit `.env` and fill in your Azure credentials:
   - `AZURE_CONTENT_UNDERSTANDING_ENDPOINT`: Your Azure Document Intelligence endpoint
   - `AZURE_CONTENT_UNDERSTANDING_KEY`: Your Azure Document Intelligence API key
   - `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI endpoint
   - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
   - `AZURE_OPENAI_DEPLOYMENT`: Your GPT deployment name

### 4. Run the Application
```bash
python app.py
```

The server will start on `http://localhost:8080` by default.

## Key Changes from Node.js Version

### Backend Changes
- **Framework**: Express → Flask
- **Language**: JavaScript → Python
- **Package Manager**: npm → pip
- **Dependencies**: 
  - `multer` → `werkzeug` for file uploads
  - `exceljs` → `openpyxl` for Excel processing
  - `axios` → `requests` for HTTP calls
  - `dotenv` → `python-dotenv` for environment variables

### API Endpoints (Unchanged)
All API endpoints remain the same, so the frontend requires no changes:
- `POST /upload` - Upload PDF file
- `POST /upload-excel` - Upload Excel template
- `POST /fill-excel` - Fill Excel workbook
- `GET /fill-excel-progress/:jobId` - Check fill progress
- `POST /export-tables` - Export tables to Excel
- `POST /export-single-tab` - Export tables to single sheet
- `GET /download-filled-excel/:filledId` - Download filled workbook
- `POST /chat` - Chat with document content
- `GET /transcription/:fileId` - Get document analysis
- `GET /transcriptions` - Get all analyses
- `DELETE /files/:fileId` - Delete file
- `GET /pdf/:fileId` - Serve PDF file
- `GET /config-status` - Check configuration status

### File Structure
```
Document-Intelligence-Hub/
├── app.py                 # Flask application (replaces index.js)
├── requirements.txt       # Python dependencies (replaces package.json)
├── .env                   # Environment variables
├── .env.example           # Example environment file
├── public/                # Frontend files (unchanged)
│   ├── index.html
│   ├── script.js
│   └── styles.css
└── uploads/               # Uploaded files directory
```

## Development

### Run in Debug Mode
Debug mode is enabled by default when running `python app.py`.

### Background Jobs
The Excel filling process runs in a background thread. For production use, consider using:
- Celery for distributed task processing
- Redis for job queue management
- Gunicorn for production WSGI server

## Production Deployment

### Using Gunicorn (Recommended)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8080 app:app
```

### Using Waitress (Windows-friendly)
```bash
pip install waitress
waitress-serve --host=0.0.0.0 --port=8080 app:app
```

## Troubleshooting

### Port Already in Use
Change the `PORT` variable in your `.env` file:
```
PORT=3000
```

### Module Not Found Errors
Make sure you've activated your virtual environment and installed all dependencies:
```bash
pip install -r requirements.txt
```

### Azure API Errors
1. Check `/config-status` endpoint to verify environment variables are set correctly
2. Ensure your Azure endpoints end with a `/`
3. Verify your API keys are correct and have proper permissions

## Migration Notes

If you're migrating from the Node.js version:
1. The frontend files in `public/` folder work without modification
2. All existing `.env` variables are compatible
3. The `uploads/` folder and its contents are preserved
4. API responses maintain the same JSON structure

## Support
For issues or questions, refer to:
- Flask documentation: https://flask.palletsprojects.com/
- Azure Document Intelligence: https://learn.microsoft.com/azure/ai-services/document-intelligence/
- Azure OpenAI: https://learn.microsoft.com/azure/ai-services/openai/
