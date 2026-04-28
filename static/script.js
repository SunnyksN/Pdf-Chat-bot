// Global variables
let isTyping = false;
let uploadedFiles = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Load chat history from localStorage
    loadChatHistory();

    // Set up event listeners
    setupEventListeners();

    // Set up drag and drop
    setupDragAndDrop();
}

function setupEventListeners() {
    // Enter key to send message
    document.getElementById('question').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askQuestion();
        }
    });

    // Auto-resize textarea (we'll change input to textarea later)
    document.getElementById('question').addEventListener('input', autoResizeTextarea);
}

function setupDragAndDrop() {
    const uploadBox = document.querySelector('.upload-box');
    const fileInput = document.getElementById('pdfs');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadBox.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        uploadBox.classList.add('drag-over');
    }

    function unhighlight(e) {
        uploadBox.classList.remove('drag-over');
    }

    uploadBox.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        fileInput.files = files;
        updateFilePreview(files);
    }
}

function updateFilePreview(files) {
    const uploadBox = document.querySelector('.upload-box');
    let previewDiv = document.getElementById('file-preview');

    if (!previewDiv) {
        previewDiv = document.createElement('div');
        previewDiv.id = 'file-preview';
        previewDiv.className = 'file-preview';
        uploadBox.appendChild(previewDiv);
    }

    previewDiv.innerHTML = '<h3>Selected Files:</h3>';
    for (let file of files) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">(${formatFileSize(file.size)})</span>
        `;
        previewDiv.appendChild(fileItem);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadPDFs() {
    const files = document.getElementById("pdfs").files;

    if (files.length === 0) {
        showError("Please select PDF files first.");
        return;
    }

    // Show loading state
    const uploadButton = document.querySelector('.upload-box button');
    const originalText = uploadButton.textContent;
    uploadButton.textContent = 'Uploading...';
    uploadButton.disabled = true;

    try {
        let formData = new FormData();

        for (let i = 0; i < files.length; i++) {
            formData.append("pdfs", files[i]);
        }

        // Show progress
        showUploadProgress();

        let res = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error('Server error: Invalid response. Make sure Ollama/LLM is running or check server logs.');
        }

        if (res.ok && data.success) {
            uploadedFiles = Array.from(files).map(f => f.name);
            addMessage('system', `✅ ${data.message}`);
            saveChatHistory();
            // Clear file input after successful upload
            document.getElementById("pdfs").value = '';
            updateFilePreview([]);
        } else {
            throw new Error(data.message || 'Upload failed');
        }

    } catch (error) {
        showError(`Upload failed: ${error.message}`);
    } finally {
        uploadButton.textContent = originalText;
        uploadButton.disabled = false;
        hideUploadProgress();
    }
}

function showUploadProgress() {
    const uploadBox = document.querySelector('.upload-box');
    let progressDiv = document.getElementById('upload-progress');

    if (!progressDiv) {
        progressDiv = document.createElement('div');
        progressDiv.id = 'upload-progress';
        progressDiv.className = 'upload-progress';
        progressDiv.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div class="progress-text">Processing PDFs...</div>
        `;
        uploadBox.appendChild(progressDiv);
    }

    progressDiv.style.display = 'block';
    animateProgressBar();
}

function animateProgressBar() {
    const progressFill = document.querySelector('.progress-fill');
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 90) {
            clearInterval(interval);
        } else {
            width += Math.random() * 10;
            progressFill.style.width = width + '%';
        }
    }, 200);
}

function hideUploadProgress() {
    const progressDiv = document.getElementById('upload-progress');
    if (progressDiv) {
        progressDiv.style.display = 'none';
    }
}

async function askQuestion() {
    const questionInput = document.getElementById("question");
    const question = questionInput.value.trim();

    if (!question) {
        showError("Please enter a question.");
        return;
    }

    if (uploadedFiles.length === 0) {
        showError("Please upload PDF files first.");
        return;
    }

    if (isTyping) {
        return; // Prevent multiple simultaneous requests
    }

    // Add user message
    addMessage('user', question);
    questionInput.value = "";
    questionInput.style.height = 'auto'; // Reset textarea height

    // Show typing indicator
    showTypingIndicator();

    try {
        let res = await fetch("/ask", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question: question })
        });

        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw new Error('Server error: Invalid response format. Check if the LLM is running.');
        }

        if (res.ok && data.success) {
            // Simulate typing delay for better UX
            setTimeout(() => {
                hideTypingIndicator();
                addMessage('bot', data.answer);
                saveChatHistory();
            }, 500 + Math.random() * 1000);
        } else {
            throw new Error(data.answer || data.message || 'Failed to get answer');
        }

    } catch (error) {
        hideTypingIndicator();
        showError(`Error: ${error.message}`);
    }
}

function addMessage(type, content) {
    const chat = document.getElementById("chat-box");
    const messageDiv = document.createElement('div');
    messageDiv.className = type;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
        <div class="message-content">${content}</div>
        <div class="message-time">${timestamp}</div>
    `;

    chat.appendChild(messageDiv);
    chat.scrollTop = chat.scrollHeight;

    // Animate message appearance
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 10);
}

function showTypingIndicator() {
    isTyping = true;
    const chat = document.getElementById("chat-box");
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'bot typing';
    typingDiv.innerHTML = `
        <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    chat.appendChild(typingDiv);
    chat.scrollTop = chat.scrollHeight;
}

function hideTypingIndicator() {
    isTyping = false;
    const typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) {
        typingDiv.remove();
    }
}

function showError(message) {
    addMessage('error', message);
}

function autoResizeTextarea() {
    const textarea = document.getElementById('question');
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function saveChatHistory() {
    const chatBox = document.getElementById('chat-box');
    const messages = Array.from(chatBox.children).map(msg => ({
        type: msg.className.split(' ')[0],
        content: msg.querySelector('.message-content')?.textContent || msg.textContent,
        time: msg.querySelector('.message-time')?.textContent || ''
    }));
    localStorage.setItem('chatHistory', JSON.stringify(messages));
}

function loadChatHistory() {
    const history = localStorage.getItem('chatHistory');
    if (history) {
        const messages = JSON.parse(history);
        messages.forEach(msg => {
            addMessage(msg.type, msg.content);
            // Update timestamp if it exists
            if (msg.time) {
                const lastMessage = document.getElementById('chat-box').lastElementChild;
                if (lastMessage && lastMessage.querySelector('.message-time')) {
                    lastMessage.querySelector('.message-time').textContent = msg.time;
                }
            }
        });
    }
}

// Clear chat function (can be called from console or added to UI later)
function clearChat() {
    document.getElementById('chat-box').innerHTML = '';
    localStorage.removeItem('chatHistory');
    uploadedFiles = [];
}