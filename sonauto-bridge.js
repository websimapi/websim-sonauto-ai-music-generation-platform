// Sonauto Bridge Server with local storage capabilities
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const readline = require('readline-sync');
const app = express();
const port = 3333;

// Ask user if they want to enable local storage
const enableLocalStorage = readline.keyInYNStrict('Would you like to enable local storage of generated audio? ');

if (enableLocalStorage) {
    console.log('Local storage enabled. Generated audio will be saved to the /music folder.');
    // Create music directory if it doesn't exist
    fs.ensureDirSync(path.join(__dirname, 'music'));
} else {
    console.log('Local storage disabled.');
}

// Your Sonauto API key - replace with yours or use env variables
let API_KEY = '${apiKey || 'YOUR_API_KEY_HERE'}';
// If API key is not set, ask for it
if (API_KEY === 'YOUR_API_KEY_HERE') {
    API_KEY = readline.question('Please enter your Sonauto API key: ', {
        hideEchoBack: true // The typed text won't be visible
    });
    if (!API_KEY) {
        console.error('API key is required to continue.');
        process.exit(1);
    }
}

const SONAUTO_API_BASE = 'https://api.sonauto.ai/v1';

app.use(cors());
app.use(express.json({limit: '50mb'}));

// Create WebSocket server with better error handling
const wss = new WebSocket.Server({ 
    port: 3334,
    // Adding error handler for the server itself
    perMessageDeflate: false
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error.message);
    console.log('Is port 3334 already in use? Try closing other applications or changing the port.');
});

// Store connected clients
const clients = new Set();

// Keep track of active polling jobs
const pollingJobs = new Map();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);
    
    // Send connection confirmation immediately
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Sonauto bridge server'
    }));
    
    ws.on('message', async (message) => {
        try {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch (parseError) {
                throw new Error('Invalid JSON in message');
            }
            
            console.log('Received request:', data.action);
            
            if (data.action === 'generate') {
                if (!data.params) {
                    throw new Error('No parameters provided for generation');
                }
                
                // Handle generation
                try {
                    const response = await generateMusic(data.params, ws);
                    ws.send(JSON.stringify({
                        type: 'generation_started',
                        taskId: response.task_id
                    }));
                } catch (genError) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: genError.message || 'Failed to start generation'
                    }));
                }
            } else if (data.action === 'status') {
                if (!data.taskId) {
                    throw new Error('No taskId provided for status check');
                }
                
                try {
                    const status = await checkStatus(data.taskId);
                    ws.send(JSON.stringify({
                        type: 'status_update',
                        status: status,
                        taskId: data.taskId
                    }));
                } catch (statusError) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: statusError.message || 'Failed to check status'
                    }));
                }
            } else if (data.action === 'result') {
                if (!data.taskId) {
                    throw new Error('No taskId provided for result fetch');
                }
                
                try {
                    const result = await getResult(data.taskId);
                    ws.send(JSON.stringify({
                        type: 'generation_result',
                        result: result,
                        taskId: data.taskId
                    }));
                } catch (resultError) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: resultError.message || 'Failed to get result'
                    }));
                }
            } else {
                throw new Error(`Unknown action: ${data.action}`);
            }
        } catch (error) {
            console.error('Error processing message:', error);
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message || 'Unknown error occurred'
                }));
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket connection error:', error);
        clients.delete(ws);
    });
});

// API Functions
async function generateMusic(params, ws) {
    const endpoint = getEndpointForType(params.generationType);
    
    // Remove generationType as it's not part of the actual API
    const apiParams = {...params};
    delete apiParams.generationType;
    
    try {
        console.log(`Sending request to ${endpoint}`);
        const response = await axios.post(endpoint, apiParams, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Start polling status
        const taskId = response.data.task_id;
        startPollingStatus(taskId, ws);
        
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error('API error response:', error.response.status, error.response.data);
            throw new Error(error.response.data?.error || `API error: ${error.response.status}`);
        } else if (error.request) {
            console.error('No response received:', error.request);
            throw new Error('No response from Sonauto API. Check your internet connection.');
        } else {
            console.error('Error setting up request:', error.message);
            throw new Error(`Request setup error: ${error.message}`);
        }
    }
}

async function checkStatus(taskId) {
    try {
        const response = await axios.get(`${SONAUTO_API_BASE}/generations/status/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        // API returns status as a quoted string
        const status = response.data.replace(/"/g, '');
        return status;
    } catch (error) {
        if (error.response) {
            console.error('Status check API error:', error.response.status, error.response.data);
            throw new Error(error.response.data?.error || `Status check error: ${error.response.status}`);
        } else {
            console.error('Status check error:', error.message);
            throw new Error(`Status check error: ${error.message}`);
        }
    }
}

async function getResult(taskId) {
    try {
        const response = await axios.get(`${SONAUTO_API_BASE}/generations/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });
        
        const result = response.data;
        
        // If local storage is enabled, save the audio files
        if (enableLocalStorage && result.song_paths) {
            saveAudioLocally(result);
        }
        
        return result;
    } catch (error) {
        if (error.response) {
            console.error('Result fetch API error:', error.response.status, error.response.data);
            throw new Error(error.response.data?.error || `Result fetch error: ${error.response.status}`);
        } else {
            console.error('Result fetch error:', error.message);
            throw new Error(`Result fetch error: ${error.message}`);
        }
    }
}

// Function to save audio files locally
async function saveAudioLocally(result) {
    try {
        // Create project directory based on task ID
        const projectDir = path.join(__dirname, 'music', result.id);
        await fs.ensureDir(projectDir);
        
        // Save metadata
        await fs.writeJson(path.join(projectDir, 'metadata.json'), result, { spaces: 2 });
        
        // Download and save each audio file
        for (let i = 0; i < result.song_paths.length; i++) {
            const songUrl = result.song_paths[i];
            const extension = getExtensionFromUrl(songUrl);
            const localPath = path.join(projectDir, `song_${i+1}${extension}`);
            
            console.log(`Downloading song ${i+1} to ${localPath}...`);
            
            try {
                const response = await axios({
                    method: 'get',
                    url: songUrl,
                    responseType: 'stream'
                });
                
                // Create a write stream and pipe the response data to it
                const writer = fs.createWriteStream(localPath);
                response.data.pipe(writer);
                
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                console.log(`Song ${i+1} saved to ${localPath}`);
            } catch (downloadError) {
                console.error(`Error downloading song ${i+1}:`, downloadError.message);
            }
        }
        
        console.log(`All songs for task ${result.id} saved to ${projectDir}`);
    } catch (error) {
        console.error('Error saving audio locally:', error.message);
    }
}

// Helper function to extract file extension from URL
function getExtensionFromUrl(url) {
    const urlPath = new URL(url).pathname;
    const extension = path.extname(urlPath);
    return extension || '.ogg'; // Default to .ogg if no extension found
}

function getEndpointForType(type) {
    switch (type) {
        case 'new':
            return `${SONAUTO_API_BASE}/generations`;
        case 'extend':
            return `${SONAUTO_API_BASE}/generations/extend`;
        case 'inpaint':
            return `${SONAUTO_API_BASE}/generations/inpaint`;
        default:
            return `${SONAUTO_API_BASE}/generations`;
    }
}

// Start polling status and send updates
function startPollingStatus(taskId, ws) {
    // Stop any existing polling for this task
    stopPollingStatus(taskId);
    
    console.log(`Starting to poll status for task ${taskId}`);
    
    let completed = false;
    
    // Create polling function
    const pollFunction = async () => {
        if (completed) return;
        
        try {
            const status = await checkStatus(taskId);
            
            // Only send if websocket is still open
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'status_update',
                    status: status,
                    taskId: taskId
                }));
                
                // Check if generation is complete
                if (status === 'SUCCESS' || status === 'FAILURE') {
                    completed = true;
                    stopPollingStatus(taskId);
                    
                    // If success, fetch the full result
                    if (status === 'SUCCESS') {
                        try {
                            const result = await getResult(taskId);
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'generation_result',
                                    result: result,
                                    taskId: taskId
                                }));
                            }
                        } catch (resultError) {
                            console.error(`Error getting result for ${taskId}:`, resultError);
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'error',
                                    message: resultError.message,
                                    taskId: taskId
                                }));
                            }
                        }
                    }
                }
            } else {
                // WebSocket closed, stop polling
                completed = true;
                stopPollingStatus(taskId);
            }
        } catch (error) {
            console.error(`Error polling status for ${taskId}:`, error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: error.message,
                    taskId: taskId
                }));
            }
            completed = true;
            stopPollingStatus(taskId);
        }
    };
    
    // Start polling immediately
    pollFunction();
    
    // Then set up interval
    const intervalId = setInterval(pollFunction, 2000);
    
    // Store the interval ID
    pollingJobs.set(taskId, intervalId);
    
    // Safety timeout (30 minutes)
    setTimeout(() => {
        if (!completed && pollingJobs.has(taskId)) {
            console.log(`Polling timeout for task ${taskId}`);
            stopPollingStatus(taskId);
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Status polling timed out after 30 minutes',
                    taskId: taskId
                }));
            }
        }
    }, 30 * 60 * 1000);
}

// Stop polling status
function stopPollingStatus(taskId) {
    if (pollingJobs.has(taskId)) {
        clearInterval(pollingJobs.get(taskId));
        pollingJobs.delete(taskId);
        console.log(`Stopped polling for task ${taskId}`);
    }
}

// HTTP server endpoints
app.get('/', (req, res) => {
    res.send('Sonauto Bridge Server is running');
});

app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        websocket_server: 'ws://localhost:3334',
        connected_clients: clients.size,
        active_polling_jobs: pollingJobs.size,
        local_storage: enableLocalStorage ? 'enabled' : 'disabled'
    });
});

// Add endpoint to list saved songs if local storage is enabled
app.get('/saved-songs', (req, res) => {
    if (!enableLocalStorage) {
        return res.status(404).json({ error: 'Local storage is not enabled' });
    }
    
    try {
        const musicDir = path.join(__dirname, 'music');
        if (!fs.existsSync(musicDir)) {
            return res.json({ projects: [] });
        }
        
        const projects = fs.readdirSync(musicDir)
            .filter(file => fs.statSync(path.join(musicDir, file)).isDirectory())
            .map(projectId => {
                const projectDir = path.join(musicDir, projectId);
                const files = fs.readdirSync(projectDir);
                
                // Try to get metadata if available
                let metadata = null;
                const metadataPath = path.join(projectDir, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    try {
                        metadata = fs.readJsonSync(metadataPath);
                    } catch (e) {
                        console.error(`Error reading metadata for ${projectId}:`, e.message);
                    }
                }
                
                return {
                    projectId,
                    files: files.filter(f => f !== 'metadata.json'),
                    createdAt: metadata?.created_at || null,
                    tags: metadata?.tags || [],
                    status: metadata?.status || 'UNKNOWN'
                };
            });
        
        res.json({ projects });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add endpoint to access saved songs
app.get('/music/:projectId/:fileName', (req, res) => {
    if (!enableLocalStorage) {
        return res.status(404).json({ error: 'Local storage is not enabled' });
    }
    
    try {
        const { projectId, fileName } = req.params;
        const filePath = path.join(__dirname, 'music', projectId, fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.sendFile(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add endpoint to get project details
app.get('/project/:projectId', (req, res) => {
    if (!enableLocalStorage) {
        return res.status(404).json({ error: 'Local storage is not enabled' });
    }
    
    try {
        const { projectId } = req.params;
        const projectDir = path.join(__dirname, 'music', projectId);
        
        if (!fs.existsSync(projectDir)) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const metadataPath = path.join(projectDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Project metadata not found' });
        }
        
        const metadata = fs.readJsonSync(metadataPath);
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start HTTP server
app.listen(port, () => {
    console.log(`
============================================================
  Sonauto Bridge Server Running
============================================================
  HTTP API:   http://localhost:${port}
  WebSocket:  ws://localhost:3334
  Connected:  ${clients.size} clients
  Local Storage: ${enableLocalStorage ? 'Enabled' : 'Disabled'}
  
  This window must remain open for the bridge to work.
  Return to your browser to start generating music!
============================================================
`);
});