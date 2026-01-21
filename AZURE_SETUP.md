# Azure Services Setup Guide

This document provides step-by-step instructions for setting up the required Azure services for the Content Understanding App.

## Required Azure Services

### 1. Azure Document Intelligence

**Purpose**: Extract text from PDF files and images using OCR technology.

**Setup Steps**:
1. Go to Azure Portal (portal.azure.com)
2. Create a new resource → AI + Machine Learning → Document Intelligence
3. Choose your subscription and resource group
4. Select a pricing tier (F0 for free tier, S0 for standard)
5. Note down the endpoint and key from the "Keys and Endpoint" section

**Environment Variables**:
```env
# Endpoint must be a full base URL (include https://) and should end with a trailing slash (/)
AZURE_CONTENT_UNDERSTANDING_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com/
AZURE_CONTENT_UNDERSTANDING_KEY=your-32-character-key-here
```

### 2. Azure OpenAI Service

**Purpose**: Transcribe audio files (Whisper) and provide chat functionality (GPT).

**Setup Steps**:
1. Go to Azure Portal → Create a resource → Azure OpenAI
2. Choose your subscription and resource group
3. Select a supported region (East US, West Europe, etc.)
4. After creation, go to Azure OpenAI Studio (oai.azure.com)
5. Create model deployments:
   - Deploy a **Whisper** model (for audio transcription)
   - Deploy a **GPT-3.5-turbo** or **GPT-4** model (for chat)
6. Note down the endpoint and keys for each deployment

**Environment Variables**:
```env
# For GPT (chat + Excel workbook filling)
AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-openai-key-here
AZURE_OPENAI_DEPLOYMENT=your-gpt-deployment-name
# Optional override
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Legacy variable names (still supported)
REACT_APP_AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
REACT_APP_AZURE_OPENAI_KEY=your-openai-key-here
REACT_APP_AZURE_OPENAI_DEPLOYMENT_NAME=your-whisper-deployment-name
REACT_APP_AZURE_OPENAI_CHAT_ENDPOINT=https://your-openai-resource.openai.azure.com/
REACT_APP_AZURE_OPENAI_CHAT_KEY=your-openai-key-here
```



## Cost Considerations

- **Document Intelligence**: F0 tier provides 500 pages/month free
- **Azure OpenAI**: Pay-per-use based on tokens processed

## Security Best Practices

1. **Never commit credentials**: Always use environment variables
2. **Use Managed Identity**: In production, consider using Azure Managed Identity
3. **Rotate keys regularly**: Set up key rotation policies
4. **Monitor usage**: Set up billing alerts to avoid unexpected costs
5. **Network security**: Consider using private endpoints for production

## Troubleshooting

### Common Issues:

1. **401 Unauthorized**: Check if your keys are correct and not expired
2. **403 Forbidden**: Ensure your resource has the correct permissions
3. **Deployment not found**: Verify your deployment names in Azure OpenAI Studio
4. **Quota exceeded**: Check your service quotas and consider upgrading tiers

### Useful Azure CLI Commands:

```bash
# List your Azure OpenAI deployments
az cognitiveservices account deployment list --resource-group <rg-name> --name <openai-resource-name>

# Get Document Intelligence endpoint
az cognitiveservices account show --resource-group <rg-name> --name <di-resource-name> --query "properties.endpoint"


```

## Testing Your Setup

After configuring all services, you can test each component:

1. **Document Intelligence**: Upload a PDF or image file
2. **Whisper**: Upload an audio file (.wav or .m4a)
3. **Chat**: Ask questions about analyzed content
4. **Memory Storage**: Verify documents appear in the session history