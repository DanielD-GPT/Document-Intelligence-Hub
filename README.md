# Azure Document Intelligence Hub

A modern web application for analyzing documents using Azure AI Document Intelligence (Content Understanding) and Azure OpenAI. Features a three-pane UI with document viewing, content extraction, and intelligent Q&A capabilities.

## ⚠️ Important: Flask Migration

**This application has been refactored to use Flask (Python) instead of Node.js/Express.**

For detailed Flask setup instructions, see **[FLASK_SETUP.md](FLASK_SETUP.md)**

## Features

📄 **PDF Document Upload**: Upload contract documents for analysis  
🔍 **Content Extraction**: Automatically extract text using Azure AI Document Intelligence (prebuilt-read model)  
📊 **Three-Pane Interface**:
- **Left Pane**: Upload area, file management, and extracted content display
- **Middle Pane**: PDF document viewer with zoom controls
- **Right Pane**: LLM-powered Q&A interface

🤖 **AI-Powered Q&A**: Ask questions about your documents using Azure OpenAI  
🎯 **Interactive Navigation**: Click on files to view PDFs and their extracted content  
🔎 **Smart Search**: Search across filenames and extracted content with highlighting  
📋 **Content Management**: Copy, download, and manage extracted text  
📊 **Excel Export**: Generate structured Excel workbooks from extracted content  

## Architecture

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Python with Flask (migrated from Node.js/Express)
- **Azure Services**:
  - Azure AI Document Intelligence (prebuilt-layout model)
  - Azure OpenAI for LLM integration

## Prerequisites

- Python 3.8+ and pip
- Azure subscription with:
  - Azure AI Document Intelligence resource
  - Azure OpenAI resource with a deployed model

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/DanielD-GPT/Document-Intelligence-Hub.git
cd Document-Intelligence-Hub
```

## Quick Start (Flask)

### 1. Clone the Repository

```bash
git clone https://github.com/DanielD-GPT/Document-Intelligence-Hub.git
cd Document-Intelligence-Hub
```

### 2. Install Dependencies

```bash
# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Linux/Mac

# Install Python packages
pip install -r requirements.txt
```

### 3. Configure Azure Credentials

Create a `.env` file in the root directory by copying `.env.example`:

```bash
copy .env.example .env  # Windows
# or
cp .env.example .env  # Linux/Mac
```

Edit `.env` and add your Azure credentials:

```env
# Azure Document Intelligence Configuration  
AZURE_CONTENT_UNDERSTANDING_ENDPOINT=your_azure_document_intelligence_endpoint_here
AZURE_CONTENT_UNDERSTANDING_KEY=your_azure_document_intelligence_key_here

# Azure OpenAI Configuration (required for chat + Excel workbook filling)
AZURE_OPENAI_ENDPOINT=your_azure_openai_endpoint_here
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT=your_deployment_name_here
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here

# Server Configuration
PORT=8080
```

#### How to Get Azure Credentials:

**Azure AI Document Intelligence:**
1. Go to [Azure Portal](https://portal.azure.com)
2. Create or navigate to your Document Intelligence resource
3. Go to "Keys and Endpoint" section
4. Copy the endpoint URL and one of the keys

**Azure OpenAI:**
1. Go to [Azure Portal](https://portal.azure.com)
2. Create or navigate to your Azure OpenAI resource
3. Go to "Keys and Endpoint" section
4. Copy the endpoint and key
5. Deploy a model (e.g., gpt-4, gpt-35-turbo) in Azure OpenAI Studio
6. Use the deployment name in your configuration

### 4. Run the Application

```bash
python app.py
```

The server will start on `http://localhost:8080`

### 5. Open in Browser

Navigate to:
```
http://localhost:8080
```

## Usage

1. **Upload a Document**: Click the upload area and select a PDF file or drag & drop
2. **View Extracted Content**: The left pane will show all extracted text
3. **Search Content**: Use the search bar to find specific content
4. **View PDF**: The middle pane displays the PDF document with zoom controls
5. **Ask Questions**: Use the right pane to ask AI-powered questions about your document
6. **Export to Excel**: Generate structured Excel workbooks from extracted content

## Project Structure

```
Document-Intelligence-Hub/
├── public/
│   ├── index.html          # Main HTML file with three-pane layout
│   ├── styles.css          # Application styling
│   └── script.js           # Frontend JavaScript logic
├── uploads/                # Temporary storage for uploaded PDFs (auto-created)
├── index.js                # Express server with Azure integration
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## API Endpoints

### POST /upload
Upload and analyze a document.

**Request**: `multipart/form-data` with `file` field (PDF)

**Response**:
```json
{
  "message": "File uploaded successfully",
  "filePath": "/uploads/document.pdf",
  "content": "Extracted text content..."
}
```

### POST /chat
Ask a question about uploaded documents.

**Request**:
```json
{
  "message": "What is the termination clause?",
  "context": "Document content..."
}
```

**Response**:
```json
{
  "response": "The termination clause states..."
}
```

### GET /files
List all uploaded files with their analysis.

**Response**:
```json
{
  "files": [
    {
      "filename": "contract.pdf",
      "content": "...",
      "uploadDate": "2026-01-21T..."
    }
  ]
}
```

### POST /generate-workbook
Generate an Excel workbook from extracted content.

**Request**:
```json
{
  "filename": "contract.pdf",
  "extractedContent": "..."
}
```

**Response**: Excel file download

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **Azure AI Services**:
  - `@azure/ai-form-recognizer` - Document Intelligence SDK
  - `@azure/openai` - Azure OpenAI integration
- **Other Libraries**:
  - `multer` - File upload handling
  - `dotenv` - Environment variable management
  - `exceljs` - Excel workbook generation
  - `axios` - HTTP client

## Security Notes

- ⚠️ Never commit `.env` file to version control
- 🔐 Keep your Azure keys secure
- 📁 Uploaded files are stored temporarily in the `uploads/` directory
- 🛡️ Consider implementing file cleanup and size limits for production use
- 🔒 Implement proper authentication and authorization for production scenarios

## Troubleshooting

**Issue: Server won't start**
- Check that port 8080 is not in use
- Verify `.env` file exists and has correct values
- Ensure dependencies are installed: `npm install`

**Issue: Document analysis fails**
- Verify Azure Document Intelligence credentials
- Check that the PDF file is valid and not corrupted
- Ensure your Azure resource has sufficient quota

**Issue: Q&A not working**
- Verify Azure OpenAI credentials
- Ensure your deployment name is correct
- Check that you've uploaded a document first

## Support

For issues or questions, please check the Azure documentation:
- [Azure AI Document Intelligence](https://learn.microsoft.com/azure/ai-services/document-intelligence/)
- [Azure OpenAI Service](https://learn.microsoft.com/azure/ai-services/openai/)

---

## ⚠️ DISCLAIMER

This application is a prototype intended for proof of concept and demonstration purposes only. It is not designed, tested, or supported for production use. Use at your own risk. Microsoft makes no warranties, express or implied, regarding the functionality, reliability, or suitability of this code for any purpose. For production scenarios, please consult official Microsoft documentation and implement appropriate security, scalability, and compliance measures.
