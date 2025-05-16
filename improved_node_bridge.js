// This is the improved Node.js bridge content that gets downloaded by users
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const port = 3333;

// Your Sonauto API key - replace with yours or use env variables
const API_KEY = '${apiKey || 'YOUR_API_KEY_HERE'}';
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
                
                // Add the API key to params if it wasn't included
                const params = {...data.params};
                
                // Handle generation
                try {
                    const response = await generateMusic(params, ws);
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
        return response.data;
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

// HTTP server for API bridge test endpoint
app.get('/', (req, res) => {
    res.send('Sonauto Bridge Server is running');
});

app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        websocket_server: 'ws://localhost:3334',
        connected_clients: clients.size,
        active_polling_jobs: pollingJobs.size
    });
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
  
  This window must remain open for the bridge to work.
  Return to your browser to start generating music!
============================================================
`);
});
