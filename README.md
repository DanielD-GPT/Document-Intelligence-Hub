# Document Processing App with RAG

A modern web application for processing and analyzing PDF documents using Azure AI Document Intelligence and Azure OpenAI. Features a clean two-pane UI with document viewing, content extraction, and intelligent search capabilities.

## Features

📄 **PDF Document Upload**: Upload PDF documents via drag & drop or file browser  
🔍 **Content Extraction**: Automatically extract text using Azure AI Document Intelligence (prebuilt-read model)  
📊 **Two-Pane Interface**:
- Left Pane: Upload area, file management, and extracted content display
- Right Pane: PDF document viewer with zoom controls  

🔎 **Smart Search**: Search across filenames and extracted content with highlighting  
📋 **Content Management**: Copy, download, and manage extracted text  
🎯 **Interactive Navigation**: Click on files to view PDFs and their extracted content  

## Architecture

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js with Express
- **Azure Services**:
  - Azure AI Document Intelligence (prebuilt-read model)
  - Azure OpenAI for LLM integration

## Prerequisites

- Node.js 16+ and npm
- Azure subscription with:
  - Azure AI Document Intelligence resource
  - Azure OpenAI resource with a deployed model

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/DanielD-GPT/Document-Processing-App-with-RAG.git
cd Document-Processing-App-with-RAG
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Azure Credentials

Create a `.env` file in the root directory by copying `.env.example`:

```bash
copy .env.example .env
```

Edit `.env` and add your Azure credentials:

```env
# Azure Document Intelligence Configuration  
AZURE_CONTENT_UNDERSTANDING_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_CONTENT_UNDERSTANDING_KEY=your_key_here

# Azure OpenAI Configuration (for transcription)
REACT_APP_AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
REACT_APP_AZURE_OPENAI_KEY=your_openai_key_here
REACT_APP_AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name_here

# Azure OpenAI Configuration (for chat)
REACT_APP_AZURE_OPENAI_CHAT_ENDPOINT=https://your-openai-chat.openai.azure.com/
REACT_APP_AZURE_OPENAI_CHAT_KEY=your_openai_chat_key_here

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

Use the VS Code task or run manually:

```bash
npm start
```

The server will start on http://localhost:8080

### 5. Open in Browser

Navigate to:

```
http://localhost:8080
```

## Usage

1. **Upload a PDF**: Drag & drop a PDF file or click "Browse Files" to select one
2. **View Extracted Content**: The extracted text appears in the Content Analysis Output section
3. **Search Content**: Use the search bar to find text across filenames and content
4. **View PDF**: Click on a file to display it in the PDF viewer
5. **Copy/Download**: Use the toolbar buttons to copy or download extracted text
6. **Delete Files**: Remove files using the delete button on each file entry

## Project Structure

```
Document-Processing-App-with-RAG/
├── public/
│   ├── index.html          # Main HTML file with two-pane layout
│   ├── styles.css          # Application styling
│   ├── script.js           # Frontend JavaScript logic
│   └── script-clean.js     # Clean version of frontend script
├── uploads/                # Temporary storage for uploaded PDFs
│   └── README.md
├── index.js                # Express server with Azure integration
├── Content Understanding.js # Azure Content Understanding utilities
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## API Endpoints

### POST /upload

Upload and analyze a PDF document.

**Request**: `multipart/form-data` with `pdfFile` field (PDF file)

**Response**:
```json
{
  "success": true,
  "fileId": "1234567890-document.pdf",
  "filename": "document.pdf",
  "content": "Extracted text content..."
}
```

### GET /transcription/:fileId

Get the analysis result for a specific document.

**Response**:
```json
{
  "filename": "document.pdf",
  "content": "Extracted text content...",
  "uploadTime": "2024-01-15T10:30:00.000Z"
}
```

### GET /transcriptions

Get all document analyses from the current session.

### GET /pdf/:fileId

Retrieve uploaded PDF file for viewing.

### DELETE /files/:fileId

Delete a document and its analysis data.

**Response**:
```json
{
  "success": true,
  "message": "File deleted successfully",
  "fileId": "1234567890-document.pdf"
}
```

## Development

To run in development mode with auto-restart:

```bash
npm run dev
```

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **Azure AI Services**:
  - Azure AI Document Intelligence - Document analysis SDK
  - Azure OpenAI - LLM integration
- **Other Libraries**:
  - multer - File upload handling
  - axios - HTTP client
  - cors - Cross-origin resource sharing
  - dotenv - Environment variable management
  - form-data - Multipart form data handling

## Security Notes

- Never commit `.env` file to version control
- Keep your Azure keys secure
- Uploaded files are stored temporarily in the `uploads/` directory
- Document analysis is stored in memory and cleared on server restart
- Consider implementing file cleanup and size limits for production use

## Future Enhancements

- [ ] PDF viewer with highlight functionality for selected sections
- [ ] Support for more document formats (Word, images)
- [ ] Document comparison features
- [ ] Export analyzed content
- [ ] User authentication and document management
- [ ] Advanced search within documents
- [ ] Persistent storage for document history
- [ ] RAG-powered Q&A capabilities

## Troubleshooting

**Issue: Server won't start**
- Check that port 8080 is not in use
- Verify `.env` file exists and has correct values
- Ensure all dependencies are installed (`npm install`)

**Issue: Document analysis fails**
- Verify Azure Document Intelligence credentials
- Check that the PDF file is valid and not corrupted
- Ensure your Azure resource has sufficient quota

**Issue: PDF not displaying**
- Ensure the file was uploaded successfully
- Check browser console for errors
- Verify the file path exists in the uploads directory

## License

MIT

## Support

For issues or questions, please check the Azure documentation:

- [Azure AI Document Intelligence](https://learn.microsoft.com/azure/ai-services/document-intelligence/)
- [Azure OpenAI Service](https://learn.microsoft.com/azure/ai-services/openai/)

---

⚠️ **DISCLAIMER**

This application is a prototype intended for proof of concept and demonstration purposes only. It is not designed, tested, or supported for production use. Use at your own risk. Microsoft makes no warranties, express or implied, regarding the functionality, reliability, or suitability of this code for any purpose. For production scenarios, please consult official Microsoft documentation and implement appropriate security, scalability, and compliance measures.