import React, { useState, useCallback } from 'react';
import axios from 'axios';
import './AudioTranscriber.css';

const AudioTranscriber = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Chat functionality state
  const [chatQuery, setChatQuery] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [animatingQuestionId, setAnimatingQuestionId] = useState(null);

  // Azure OpenAI configuration
  const AZURE_OPENAI_ENDPOINT = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
  const AZURE_OPENAI_KEY = process.env.REACT_APP_AZURE_OPENAI_KEY;
  const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT_NAME || 'whisper';
  const AZURE_OPENAI_CHAT_ENDPOINT = process.env.REACT_APP_AZURE_OPENAI_CHAT_ENDPOINT;
  const AZURE_OPENAI_CHAT_KEY = process.env.REACT_APP_AZURE_OPENAI_CHAT_KEY;

  const handleFileSelect = (file) => {
    if (file && (file.type === 'audio/wav' || file.type === 'audio/m4a' || file.type === 'audio/x-m4a')) {
      setSelectedFile(file);
      setError('');
    } else {
      setError('Please select a valid .wav or .m4a audio file');
      setSelectedFile(null);
    }
  };

  const handleFileInput = (event) => {
    const file = event.target.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const transcribeAudio = async () => {
    if (!selectedFile) {
      setError('Please select an audio file first');
      return;
    }

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      setError('Azure OpenAI configuration is missing. Please check your environment variables.');
      return;
    }

    setIsLoading(true);
    setError('');
    setTranscription('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post(
        `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT_NAME}/audio/transcriptions?api-version=2024-06-01`,
        formData,
        {
          headers: {
            'api-key': AZURE_OPENAI_KEY,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setTranscription(response.data.text);
    } catch (err) {
      console.error('Transcription error:', err);
      setError(
        err.response?.data?.error?.message || 
        'Failed to transcribe audio. Please check your configuration and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = () => {
    setSelectedFile(null);
    setTranscription('');
    setError('');
    setChatQuery('');
    setChatResponse('');
    setChatError('');
    setChatHistory([]);
    setTypingText('');
    setIsTyping(false);
    setAnimatingQuestionId(null);
  };

  const typeText = (text, onComplete) => {
    setIsTyping(true);
    setTypingText('');
    let index = 0;
    
    const typeChar = () => {
      if (index < text.length) {
        setTypingText(prev => prev + text.charAt(index));
        index++;
        setTimeout(typeChar, 30); // Adjust typing speed here (30ms per character)
      } else {
        setIsTyping(false);
        onComplete();
      }
    };
    
    typeChar();
  };

  const askQuestion = async () => {
    if (!chatQuery.trim()) {
      setChatError('Please enter a question');
      return;
    }

    if (!transcription.trim()) {
      setChatError('Please transcribe audio first before asking questions');
      return;
    }

    if (!AZURE_OPENAI_CHAT_ENDPOINT || !AZURE_OPENAI_CHAT_KEY) {
      setChatError('Azure OpenAI chat configuration is missing');
      return;
    }

    setIsChatLoading(true);
    setChatError('');
    setChatResponse('');

    try {
      const messages = [
        {
          role: "system",
          content: "You are a helpful assistant that answers questions based on the provided transcript. Only use information from the transcript to answer questions. If the question cannot be answered from the transcript, politely say so."
        },
        {
          role: "user",
          content: `Based on this transcript: "${transcription}"\n\nQuestion: ${chatQuery}`
        }
      ];

      const response = await axios.post(
        AZURE_OPENAI_CHAT_ENDPOINT,
        {
          messages: messages,
          max_tokens: 500,
          temperature: 0.7
        },
        {
          headers: {
            'api-key': AZURE_OPENAI_CHAT_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const answer = response.data.choices[0].message.content;
      const questionId = Date.now(); // Unique ID for animation
      
      // Add question immediately with animation
      setAnimatingQuestionId(questionId);
      setChatHistory(prev => [...prev, 
        { id: questionId, type: 'question', content: chatQuery, isAnimating: true }
      ]);
      
      setChatQuery(''); // Clear the input
      
      // Wait a bit for question animation, then add typing answer
      setTimeout(() => {
        setAnimatingQuestionId(null);
        setChatHistory(prev => prev.map(item => 
          item.id === questionId ? {...item, isAnimating: false} : item
        ));
        
        // Add answer placeholder and start typing animation
        const answerId = Date.now() + 1;
        setChatHistory(prev => [...prev, 
          { id: answerId, type: 'answer', content: '', isTyping: true }
        ]);
        
        // Start typing animation
        typeText(answer, () => {
          // When typing is done, update the final answer
          setChatHistory(prev => prev.map(item => 
            item.id === answerId ? {...item, content: answer, isTyping: false} : item
          ));
        });
        
      }, 500); // 500ms delay for question slide animation
    } catch (err) {
      console.error('Chat error:', err);
      setChatError(
        err.response?.data?.error?.message || 
        'Failed to get response. Please check your configuration and try again.'
      );
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  return (
    <div className="audio-transcriber">
      <h1>Audio Transcription with Azure OpenAI Whisper</h1>
      
      <div className="main-content">
        {/* Left Panel - File Upload */}
        <div className="left-panel">
          <div 
            className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="file-info">
                <div className="file-icon">🎵</div>
                <div className="file-details">
                  <p className="file-name">{selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button className="clear-file" onClick={clearAll}>×</button>
              </div>
            ) : (
              <div className="drop-message">
                <div className="upload-icon">📁</div>
                <p>Drag and drop your .wav or .m4a file here</p>
                <p className="or-text">or</p>
                <label className="file-input-label">
                  Choose File
                  <input
                    type="file"
                    accept=".wav,.m4a,audio/wav,audio/m4a,audio/x-m4a"
                    onChange={handleFileInput}
                    className="file-input"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="controls">
            <button 
              className="submit-btn"
              onClick={transcribeAudio}
              disabled={!selectedFile || isLoading}
            >
              {isLoading ? 'Transcribing...' : 'Submit for Transcription'}
            </button>
            
            {selectedFile && (
              <button className="clear-btn" onClick={clearAll}>
                Clear All
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}
        </div>

        {/* Right Panel - Transcription Results */}
        <div className="right-panel">
          <h3>Transcription Result</h3>
          <div className="transcription-container">
            {isLoading ? (
              <div className="loading">
                <div className="spinner"></div>
                <p>Transcribing your audio...</p>
              </div>
            ) : transcription ? (
              <div className="transcription-text">
                <p>{transcription}</p>
                <button 
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(transcription)}
                  title="Copy to clipboard"
                >
                  📋 Copy
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <p>Your transcription will appear here after processing</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat Panel - Ask Questions (Bottom Section) */}
      <div className="chat-panel">
        <h3>Ask Questions About Transcript</h3>
        
        <div className="chat-input-section">
          <div className="chat-input-container">
            <input
              type="text"
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              onKeyPress={handleChatKeyPress}
              placeholder={transcription ? "Ask a question about the transcript..." : "Transcribe audio first to ask questions"}
              className="chat-input"
              disabled={!transcription || isChatLoading}
            />
            <button 
              className="ask-btn"
              onClick={askQuestion}
              disabled={!transcription || !chatQuery.trim() || isChatLoading}
            >
              {isChatLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          
          {chatError && (
            <div className="chat-error">
              <span className="error-icon">⚠️</span>
              {chatError}
            </div>
          )}
        </div>

        <div className="chat-response-container">
          {isChatLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Getting answer...</p>
            </div>
          ) : chatHistory.length > 0 ? (
            <div className="chat-history">
              {chatHistory.map((item, index) => (
                <div key={item.id || index} className={`chat-message ${item.type} ${item.isAnimating ? 'slide-in' : ''}`}>
                  <div className="message-label">
                    {item.type === 'question' ? '❓ You asked:' : '🤖 AI answered:'}
                  </div>
                  <div className="message-content">
                    {item.isTyping ? (
                      <>
                        {typingText}
                        <span className="typing-cursor">|</span>
                      </>
                    ) : (
                      item.content
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>Ask questions about your transcribed audio and get AI-powered answers</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioTranscriber;