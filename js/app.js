// Configuration constants - EDIT THIS WITH YOUR N8N ENDPOINT
const N8N_ENDPOINT_URL = 'https://ca-icdev-its-n8n.whitefield-8ab9cbcd.southeastasia.azurecontainerapps.io/webhook/636cb5cc-dd44-47bf-945d-827bc02ca798/chat';
const ENABLE_VOICE_INPUT = false; // Set to true to enable voice input

// Store responseIds for messages to enable feedback
const messageResponseIds = new Map();

document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const restartButton = document.getElementById('restartButton');
    const voiceButton = document.getElementById('voiceButton');
    const recordingStatus = document.getElementById('recordingStatus');
    
    // Lightbox elements for image enlarge
    const lightboxOverlay = document.createElement('div');
    lightboxOverlay.className = 'lightbox-overlay';
    const lightboxImage = document.createElement('img');
    lightboxImage.className = 'lightbox-image';
    lightboxOverlay.appendChild(lightboxImage);
    document.body.appendChild(lightboxOverlay);
    
    function openLightbox(src) {
        lightboxImage.src = src;
        lightboxOverlay.classList.add('active');
    }
    
    function closeLightbox() {
        lightboxOverlay.classList.remove('active');
        lightboxImage.src = '';
    }
    
    lightboxOverlay.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightboxOverlay.classList.contains('active')) {
            closeLightbox();
        }
    });
    
    // Variables for voice recording
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingTimer = null;
    let recordingDuration = 0;
    const MAX_RECORDING_DURATION = 30;
    
    // Chat history storage keys
    const CHAT_HISTORY_KEY = 'hkuSgaChatHistory';
    const SESSION_ID_KEY = 'hkuSgaChatSessionId';
    
    // Apply voice input configuration
    updateVoiceButtonState();
    
    // Configure marked for markdown parsing with custom renderer
    const renderer = new marked.Renderer();
    
    // Override link rendering to open in new tab with security attributes
    renderer.link = function(href, title, text) {
        let link = marked.Renderer.prototype.link.call(this, href, title, text);
        return link.replace("<a", "<a target='_blank' rel='noopener noreferrer'");
    };
    
    marked.setOptions({
        renderer: renderer,
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        langPrefix: 'hljs language-',
        pedantic: false,
        gfm: true,
        breaks: true,
        sanitize: false,
        smartypants: false,
        xhtml: false
    });
    
    // Get or generate a session ID
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    console.log(`Session ID: ${sessionId}`);
    
    // Load chat history from localStorage
    loadChatHistory();
    
    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    restartButton.addEventListener('click', restartSession);
    
    // Delegate image click to open lightbox
    chatMessages.addEventListener('click', (e) => {
        const target = e.target;
        if (target && target.tagName === 'IMG' && target.closest('.message-content')) {
            openLightbox(target.src);
        }
    });
    
    // Voice button event listeners
    let buttonHoldTimeout;
    const HOLD_THRESHOLD = 300;
    
    function updateVoiceButtonState() {
        if (ENABLE_VOICE_INPUT) {
            voiceButton.style.display = 'flex';
        } else {
            voiceButton.style.display = 'none';
        }
    }
    
    voiceButton.addEventListener('mousedown', function(e) {
        e.preventDefault();
        buttonHoldTimeout = setTimeout(() => {
            startRecording();
        }, HOLD_THRESHOLD);
    });
    
    voiceButton.addEventListener('touchstart', function(e) {
        e.preventDefault();
        buttonHoldTimeout = setTimeout(() => {
            startRecording();
        }, HOLD_THRESHOLD);
    });
    
    voiceButton.addEventListener('mouseup', function() {
        clearTimeout(buttonHoldTimeout);
        stopRecording();
    });
    
    voiceButton.addEventListener('touchend', function() {
        clearTimeout(buttonHoldTimeout);
        stopRecording();
    });
    
    voiceButton.addEventListener('mouseleave', function() {
        clearTimeout(buttonHoldTimeout);
        stopRecording();
    });
    
    voiceButton.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    function startRecording() {
        if (!ENABLE_VOICE_INPUT) {
            recordingStatus.textContent = 'Voice input is disabled';
            setTimeout(() => { recordingStatus.textContent = ''; }, 3000);
            return;
        }
        
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                isRecording = true;
                voiceButton.classList.add('recording');
                recordingDuration = 0;
                recordingStatus.textContent = `Recording... ${MAX_RECORDING_DURATION - recordingDuration}s remaining`;
                
                recordingTimer = setInterval(() => {
                    recordingDuration++;
                    recordingStatus.textContent = `Recording... ${MAX_RECORDING_DURATION - recordingDuration}s remaining`;
                    
                    if (recordingDuration >= MAX_RECORDING_DURATION) {
                        stopRecording();
                    }
                }, 1000);
                
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };
                
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    sendVoiceMessage(audioBlob);
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
                recordingStatus.textContent = 'Error: Could not access microphone';
                setTimeout(() => { recordingStatus.textContent = ''; }, 3000);
            });
    }
    
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            isRecording = false;
            voiceButton.classList.remove('recording');
            recordingStatus.textContent = 'Processing voice message...';
            mediaRecorder.stop();
        }
    }
    
    function sendVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('chatInput', '');
        formData.append('audioFile', audioBlob, 'recording.webm');
        formData.append('action', 'sendVoiceMessage');
        
        addMessage('🎤 Voice message sent...', 'user-message', false);
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(typingIndicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        fetch(N8N_ENDPOINT_URL, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (typingIndicator.parentNode === chatMessages) {
                chatMessages.removeChild(typingIndicator);
            }
            recordingStatus.textContent = '';
            
            if (data && data.output) {
                let transcript = '';
                if (typeof data.output === 'object' && data.output.transcript) {
                    transcript = data.output.transcript;
                }
                
                let botResponse = '';
                if (typeof data.output === 'string') {
                    botResponse = data.output;
                } else if (typeof data.output === 'object' && data.output.response) {
                    botResponse = data.output.response;
                } else if (typeof data.output === 'object' && data.output.text) {
                    botResponse = data.output.text;
                }
                
                if (transcript) {
                    const messages = chatMessages.querySelectorAll('.message');
                    for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].classList.contains('user-message')) {
                            const content = messages[i].querySelector('.message-content');
                            content.textContent = `🎤 ${transcript}`;
                            break;
                        }
                    }
                }
                
                if (botResponse) {
                    addMessage(botResponse, 'bot-message', true, data.responseId || null);
                } else {
                    addMessage('I received your voice message but couldn\'t generate a response.', 'bot-message', true);
                }
            } else {
                addMessage('I received your voice message but the response format was unexpected.', 'bot-message', true);
            }
            
            saveChatHistory();
        })
        .catch(error => {
            console.error('Error sending voice message:', error);
            if (typingIndicator.parentNode === chatMessages) {
                chatMessages.removeChild(typingIndicator);
            }
            recordingStatus.textContent = '';
            addMessage('Sorry, there was an error processing your voice message.', 'bot-message', true);
            saveChatHistory();
        });
    }
    
    function restartSession() {
        sessionId = generateSessionId();
        localStorage.setItem(SESSION_ID_KEY, sessionId);
        console.log(`New Session ID: ${sessionId}`);
        
        while (chatMessages.children.length > 1) {
            chatMessages.removeChild(chatMessages.lastChild);
        }
        
        addMessage('Session restarted. How can I assist you with SGA EA Platform today?', 'bot-message', true);
        localStorage.removeItem(CHAT_HISTORY_KEY);
    }
    
    function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        addMessage(message, 'user-message', false);
        userInput.value = '';
        userInput.style.height = 'auto';
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(typingIndicator);
        
        fetchChatResponse(message, sessionId, typingIndicator);
    }
    
    async function fetchChatResponse(chatInput, sessionId, typingIndicator) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 60000);
            });
            
            const response = await Promise.race([
                fetch(N8N_ENDPOINT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        chatInput,
                        sessionId,
                        action: 'sendMessage'
                    })
                }),
                timeoutPromise
            ]);
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (typingIndicator && typingIndicator.parentNode === chatMessages) {
                chatMessages.removeChild(typingIndicator);
            }
            
            if (data && data.output) {
                addMessage(data.output, 'bot-message', true, data.responseId || null);
            } else {
                addMessage('Sorry, I couldn\'t process your request.', 'bot-message', true);
            }
            
            saveChatHistory();
        } catch (error) {
            console.error('Error:', error);
            
            if (typingIndicator && typingIndicator.parentNode === chatMessages) {
                chatMessages.removeChild(typingIndicator);
            }
            
            let errorMessage = 'Sorry, there was an error processing your request.';
            if (error.message === 'Request timeout') {
                errorMessage = 'The request took too long to complete. Please try again.';
            }
            addMessage(errorMessage, 'bot-message', true);
            
            saveChatHistory();
        }
    }
    
    function addMessage(text, className, parseMarkdown, responseId = null) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${className}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        if (parseMarkdown) {
            const rawHtml = marked.parse(text);
            
            // Configure DOMPurify to allow target and rel attributes
            const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['target', 'rel'],
                ADD_TAGS: ['img', 'figure', 'figcaption'],
                ADD_DATA_URI_TAGS: ['img']
            });
            
            messageContent.innerHTML = sanitizedHtml;
            
            // Ensure all links open in new tab (double-check fallback)
            messageContent.querySelectorAll('a').forEach((link) => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            });
            
            // Enhance images: lazy-load and add error fallback UI
            messageContent.querySelectorAll('img').forEach((img) => {
                img.setAttribute('loading', 'lazy');
                img.addEventListener('error', () => {
                    const url = img.getAttribute('src') || '';
                    const fallback = document.createElement('div');
                    fallback.style.background = '#fff3cd';
                    fallback.style.border = '1px solid #ffeeba';
                    fallback.style.color = '#856404';
                    fallback.style.padding = '8px 10px';
                    fallback.style.borderRadius = '6px';
                    fallback.style.margin = '8px 0';
                    fallback.innerHTML = `Image failed to load. <a href="${url}" target="_blank" rel="noopener noreferrer">Open image in new tab</a>`;
                    img.replaceWith(fallback);
                });
            });
            
            messageContent.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } else {
            messageContent.textContent = text;
        }
        
        messageElement.appendChild(messageContent);
        
        if (className === 'bot-message' && responseId) {
            messageResponseIds.set(messageElement, responseId);
            
            const feedbackButtons = document.createElement('div');
            feedbackButtons.className = 'feedback-buttons';
            
            const likeButton = document.createElement('button');
            likeButton.className = 'feedback-button like-button';
            likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i>';
            likeButton.addEventListener('click', () => sendFeedback('like', responseId, messageElement));
            
            const dislikeButton = document.createElement('button');
            dislikeButton.className = 'feedback-button dislike-button';
            dislikeButton.innerHTML = '<i class="fas fa-thumbs-down"></i>';
            dislikeButton.addEventListener('click', () => sendFeedback('dislike', responseId, messageElement));
            
            feedbackButtons.appendChild(likeButton);
            feedbackButtons.appendChild(dislikeButton);
            messageElement.appendChild(feedbackButtons);
        }
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        if (chatMessages.children.length > 1) {
            saveChatHistory();
        }
        
        return messageElement;
    }
    
    async function sendFeedback(feedbackType, responseId, messageElement) {
        const feedbackButtons = messageElement.querySelector('.feedback-buttons');
        const likeButton = feedbackButtons.querySelector('.like-button');
        const dislikeButton = feedbackButtons.querySelector('.dislike-button');
        
        likeButton.classList.remove('liked');
        dislikeButton.classList.remove('disliked');
        
        if (feedbackType === 'like') {
            likeButton.classList.add('liked');
        } else {
            dislikeButton.classList.add('disliked');
        }
        
        try {
            const response = await fetch(N8N_ENDPOINT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'sendFeedback',
                    responseId: responseId,
                    feedback: feedbackType,
                    sessionId: sessionId
                })
            });
            
            if (!response.ok) {
                console.error('Feedback submission failed');
            } else {
                console.log(`Feedback "${feedbackType}" sent successfully for response ${responseId}`);
            }
        } catch (error) {
            console.error('Error sending feedback:', error);
        }
        
        saveChatHistory();
    }
    
    function saveChatHistory() {
        const messages = [];
        const messageElements = chatMessages.querySelectorAll('.message');
        
        messageElements.forEach((messageElement) => {
            const content = messageElement.querySelector('.message-content');
            if (content) {
                const isUser = messageElement.classList.contains('user-message');
                const responseId = messageResponseIds.get(messageElement) || null;
                
                let feedbackState = null;
                if (!isUser) {
                    const feedbackButtons = messageElement.querySelector('.feedback-buttons');
                    if (feedbackButtons) {
                        const likeButton = feedbackButtons.querySelector('.like-button');
                        const dislikeButton = feedbackButtons.querySelector('.dislike-button');
                        
                        if (likeButton && likeButton.classList.contains('liked')) {
                            feedbackState = 'like';
                        } else if (dislikeButton && dislikeButton.classList.contains('disliked')) {
                            feedbackState = 'dislike';
                        }
                    }
                }
                
                messages.push({
                    text: content.innerHTML,
                    isUser: isUser,
                    responseId: responseId,
                    feedbackState: feedbackState
                });
            }
        });
        
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
    }
    
    function loadChatHistory() {
        const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
        if (!savedHistory) return;
        
        try {
            const messages = JSON.parse(savedHistory);
            
            // Clear existing messages except the first welcome message
            while (chatMessages.children.length > 1) {
                chatMessages.removeChild(chatMessages.lastChild);
            }
            
            messages.forEach((message) => {
                if (message.isUser) {
                    addMessage(message.text, 'user-message', false);
                } else {
                    const messageElement = document.createElement('div');
                    messageElement.className = 'message bot-message';
                    
                    const messageContent = document.createElement('div');
                    messageContent.className = 'message-content';
                    messageContent.innerHTML = message.text;
                    
                    // Ensure all links in loaded history open in new tab
                    messageContent.querySelectorAll('a').forEach((link) => {
                        link.setAttribute('target', '_blank');
                        link.setAttribute('rel', 'noopener noreferrer');
                    });
                    
                    messageElement.appendChild(messageContent);
                    
                    if (message.responseId) {
                        messageResponseIds.set(messageElement, message.responseId);
                        
                        const feedbackButtons = document.createElement('div');
                        feedbackButtons.className = 'feedback-buttons';
                        
                        const likeButton = document.createElement('button');
                        likeButton.className = 'feedback-button like-button';
                        likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i>';
                        likeButton.addEventListener('click', () => sendFeedback('like', message.responseId, messageElement));
                        
                        const dislikeButton = document.createElement('button');
                        dislikeButton.className = 'feedback-button dislike-button';
                        dislikeButton.innerHTML = '<i class="fas fa-thumbs-down"></i>';
                        dislikeButton.addEventListener('click', () => sendFeedback('dislike', message.responseId, messageElement));
                        
                        feedbackButtons.appendChild(likeButton);
                        feedbackButtons.appendChild(dislikeButton);
                        messageElement.appendChild(feedbackButtons);
                        
                        if (message.feedbackState === 'like') {
                            likeButton.classList.add('liked');
                        } else if (message.feedbackState === 'dislike') {
                            dislikeButton.classList.add('disliked');
                        }
                    }
                    
                    chatMessages.appendChild(messageElement);
                }
            });
        } catch (error) {
            console.error('Error loading chat history:', error);
            localStorage.removeItem(CHAT_HISTORY_KEY);
        }
    }
    
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
});
