// This file handles the AI assistant functionality for the Sonauto interface

document.addEventListener('DOMContentLoaded', function() {
    // AI Assistant elements
    const aiChatMessages = document.getElementById('aiChatMessages');
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatSend = document.getElementById('aiChatSend');
    
    // Chat history
    let conversationHistory = [];
    
    // Initialize with welcome message
    conversationHistory.push({
        role: "system",
        content: "You are an AI assistant specializing in music generation. You help users craft prompts, lyrics, and select appropriate tags for Sonauto AI music generation. Your knowledge about music genres, instruments, moods, and music theory is extensive. Be concise, helpful, and creative."
    });
    
    conversationHistory.push({
        role: "assistant",
        content: "Hello! I'm your AI assistant for Sonauto. I can help you craft prompts, suggest tags, or generate lyrics. What would you like help with today?"
    });
    
    // Event listeners
    aiChatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
    
    aiChatSend.addEventListener('click', sendMessage);
    
    // Add a trigger for some specific buttons in the interface
    document.querySelectorAll('.ai-action-button').forEach(button => {
        button.addEventListener('click', function() {
            const action = this.dataset.action;
            handlePredefinedAction(action);
        });
    });
    
    // Functions
    function sendMessage() {
        const message = aiChatInput.value.trim();
        if (!message) return;
        
        // Add user message to UI
        addMessageToChat('user', message);
        
        // Add user message to conversation history
        conversationHistory.push({
            role: "user",
            content: message
        });
        
        // Only keep the last 10 messages to save tokens
        if (conversationHistory.length > 12) {
            // Keep system message and trim the rest
            const systemMessage = conversationHistory[0];
            conversationHistory = [systemMessage, ...conversationHistory.slice(-10)];
        }
        
        // Clear input
        aiChatInput.value = '';
        
        // Show thinking indicator
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message ai-message thinking';
        thinkingDiv.innerHTML = `
            <div class="message-content">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        aiChatMessages.appendChild(thinkingDiv);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        
        // Get AI response
        getAiResponse(message).then(response => {
            // Remove thinking indicator
            if (thinkingDiv.parentNode) {
                thinkingDiv.parentNode.removeChild(thinkingDiv);
            }
            
            // Add AI response to UI
            addMessageToChat('ai', response);
            
            // Add AI response to conversation history
            conversationHistory.push({
                role: "assistant",
                content: response
            });
        }).catch(error => {
            // Remove thinking indicator
            if (thinkingDiv.parentNode) {
                thinkingDiv.parentNode.removeChild(thinkingDiv);
            }
            
            console.error('Error getting AI response:', error);
            addMessageToChat('ai', 'Sorry, I encountered an error. Please try again.');
        });
    }
    
    async function getAiResponse(message) {
        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    ...conversationHistory,
                ],
            });
            
            return completion.content;
        } catch (error) {
            console.error('Error calling AI:', error);
            throw error;
        }
    }
    
    function addMessageToChat(role, message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        messageDiv.innerHTML = `
            <div class="message-content">
                <p>${formatMessageContent(message)}</p>
            </div>
        `;
        
        aiChatMessages.appendChild(messageDiv);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }
    
    function formatMessageContent(content) {
        // Replace newlines with <br>
        content = content.replace(/\n/g, '<br>');
        
        // Parse markdown links
        content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Parse code blocks
        content = content.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
        
        // Parse inline code
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        return content;
    }
    
    function handlePredefinedAction(action) {
        let message = '';
        
        switch (action) {
            case 'generate-tags':
                message = 'Can you suggest some music tags for a ' + document.getElementById('prompt').value;
                break;
            case 'generate-lyrics':
                message = 'Can you write lyrics for a song about ' + document.getElementById('prompt').value;
                break;
            case 'improve-prompt':
                message = 'Can you help me improve this music prompt: ' + document.getElementById('prompt').value;
                break;
            default:
                message = 'Can you help me with my music generation?';
        }
        
        aiChatInput.value = message;
        sendMessage();
    }
    
    // Public API
    window.aiAssistant = {
        generateTags: function(prompt) {
            return new Promise((resolve, reject) => {
                generateMusicTags(prompt).then(tags => {
                    resolve(tags);
                }).catch(error => {
                    reject(error);
                });
            });
        },
        
        generateLyrics: function(prompt, genreOrMood) {
            return new Promise((resolve, reject) => {
                generateMusicLyrics(prompt, genreOrMood).then(lyrics => {
                    resolve(lyrics);
                }).catch(error => {
                    reject(error);
                });
            });
        },
        
        improvePrompt: function(prompt) {
            return new Promise((resolve, reject) => {
                improveMusicPrompt(prompt).then(improvedPrompt => {
                    resolve(improvedPrompt);
                }).catch(error => {
                    reject(error);
                });
            });
        }
    };
    
    // Specialized functions that use JSON response
    async function generateMusicTags(prompt) {
        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a music expert AI. Generate appropriate music tags for the given prompt.
                        Respond directly with JSON, following this JSON schema, and no other text.
                        {
                          tags: string[]; // Array of relevant music genre and mood tags, 3-7 tags
                        }`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                json: true
            });
            
            return JSON.parse(completion.content).tags;
        } catch (error) {
            console.error('Error generating tags:', error);
            throw error;
        }
    }
    
    async function generateMusicLyrics(prompt, genreOrMood) {
        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a professional songwriter AI. Generate creative and appropriate lyrics for a song based on the prompt and genre/mood provided.
                        Respond directly with JSON, following this JSON schema, and no other text.
                        {
                          lyrics: string; // Complete lyrics with verse, chorus structure
                        }`
                    },
                    {
                        role: "user",
                        content: `Write lyrics for a ${genreOrMood || ''} song about ${prompt}`
                    }
                ],
                json: true
            });
            
            return JSON.parse(completion.content).lyrics;
        } catch (error) {
            console.error('Error generating lyrics:', error);
            throw error;
        }
    }
    
    async function improveMusicPrompt(prompt) {
        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a music production AI expert. Improve the given music generation prompt to be more detailed and effective for AI music generation.
                        Respond directly with JSON, following this JSON schema, and no other text.
                        {
                          improvedPrompt: string; // An improved, more detailed prompt
                          suggestedTags: string[]; // Suggested tags to accompany the prompt, 3-7 tags
                        }`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                json: true
            });
            
            return JSON.parse(completion.content);
        } catch (error) {
            console.error('Error improving prompt:', error);
            throw error;
        }
    }
});

