// API Bridge for Sonauto AI
// This file handles the different methods of connecting to the Sonauto API

(function() {
    // State
    let apiKey = null;
    let bridgeSocket = null;
    let bridgeConnected = false;
    let statusPollingIntervals = {};
    
    // Constants
    const SONAUTO_API_BASE = 'https://api.sonauto.ai/v1';
    const CORS_PROXIES = [
        '', // Direct connection first
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/raw?url='
    ];
    
    // Initialize the API bridge
    function initializeApiBridge(key) {
        apiKey = key;
        window.bridgeConnected = false;
        
        // If we're using the local bridge connection method, try to connect
        if (document.getElementById('localBridge').checked) {
            connectToBridge();
        }
        
        // Make the functions available globally
        window.generateMusicViaApi = generateMusicViaApi;
        window.generateMusicViaBridge = generateMusicViaBridge;
        window.pollStatus = pollStatus;
        window.getGenerationResult = getGenerationResult;
        window.initializeApiBridge = initializeApiBridge;
    }
    
    // Connect to local WebSocket bridge
    function connectToBridge() {
        try {
            // Close existing connection if any
            if (bridgeSocket && bridgeSocket.readyState !== WebSocket.CLOSED) {
                bridgeSocket.close();
            }
            
            bridgeSocket = new WebSocket('ws://localhost:3334');
            
            bridgeSocket.onopen = function() {
                console.log('Connected to Sonauto bridge');
                bridgeConnected = true;
                window.bridgeConnected = true;
                
                // Update UI
                updateBridgeStatus(true);
            };
            
            bridgeSocket.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Bridge message:', data);
                    
                    if (data.type === 'connected') {
                        bridgeConnected = true;
                        window.bridgeConnected = true;
                        updateBridgeStatus(true);
                    } else if (data.type === 'generation_started') {
                        // Save task ID for later
                        if (window.currentTaskId != data.taskId) {
                            window.currentTaskId = data.taskId;
                        }
                    } else if (data.type === 'status_update') {
                        // Update status in UI
                        if (window.updateStatusProgress) {
                            window.updateStatusProgress(data.status);
                        }
                        
                        // If complete, get the result
                        if (data.status === 'SUCCESS') {
                            // Result will be sent in separate message
                        }
                    } else if (data.type === 'generation_result') {
                        // Display result
                        if (window.displayGenerationResult) {
                            window.displayGenerationResult(data.result);
                        }
                        
                        // Add to history
                        if (window.addToGenerationHistory) {
                            window.addToGenerationHistory(data.result);
                        }
                    } else if (data.type === 'error') {
                        console.error('Bridge error:', data.message);
                        if (window.showAlert) {
                            window.showAlert(`Bridge error: ${data.message}`, 'danger');
                        }
                    }
                } catch (e) {
                    console.error('Error parsing bridge message:', e);
                }
            };
            
            bridgeSocket.onclose = function() {
                console.log('Disconnected from Sonauto bridge');
                bridgeConnected = false;
                window.bridgeConnected = false;
                updateBridgeStatus(false);
            };
            
            bridgeSocket.onerror = function(error) {
                console.error('Bridge socket error:', error);
                bridgeConnected = false;
                window.bridgeConnected = false;
                updateBridgeStatus(false, 'Connection error');
            };
        } catch (error) {
            console.error('Error connecting to bridge:', error);
            bridgeConnected = false;
            window.bridgeConnected = false;
            updateBridgeStatus(false, error.message);
        }
    }
    
    // Update bridge status in UI
    function updateBridgeStatus(connected, errorMsg) {
        const bridgeStatus = document.querySelector('.bridge-status');
        const connectionStatus = document.querySelector('#localBridgeDetail .connection-status .badge');
        
        if (bridgeStatus && connectionStatus) {
            if (connected) {
                connectionStatus.className = 'badge bg-success';
                connectionStatus.textContent = 'Connected';
                bridgeStatus.textContent = 'Bridge is active and ready to use.';
            } else {
                connectionStatus.className = 'badge bg-warning';
                connectionStatus.textContent = 'Not Connected';
                
                if (errorMsg) {
                    bridgeStatus.textContent = `Bridge error: ${errorMsg}`;
                } else {
                    bridgeStatus.textContent = 'Please download and run the bridge application.';
                }
            }
        }
    }
    
    // Direct API connection
    async function generateMusicViaApi(params, onSuccess, onError) {
        try {
            const endpoint = getEndpointForType(params.generationType);
            
            // Remove generationType from params (not in actual API)
            const apiParams = { ...params };
            delete apiParams.generationType;
            
            // Try making the request with different CORS proxies
            for (let i = 0; i < CORS_PROXIES.length; i++) {
                try {
                    const proxyUrl = CORS_PROXIES[i] + endpoint;
                    
                    const response = await fetch(proxyUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(apiParams)
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `HTTP error: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    onSuccess(data.task_id);
                    return;
                } catch (proxyError) {
                    console.error(`Error with proxy ${i}:`, proxyError);
                    
                    // Try next proxy if available
                    if (i === CORS_PROXIES.length - 1) {
                        throw proxyError; // All proxies failed
                    }
                }
            }
        } catch (error) {
            console.error('Error generating music:', error);
            onError(error.message);
        }
    }
    
    // Generate music via local bridge
    function generateMusicViaBridge(params, onSuccess, onError) {
        try {
            if (!bridgeConnected || !bridgeSocket) {
                onError('Bridge is not connected');
                return;
            }
            
            // Send request to bridge
            bridgeSocket.send(JSON.stringify({
                action: 'generate',
                params: params
            }));
            
            // Success will be handled in onmessage event
            onSuccess('pending');
        } catch (error) {
            console.error('Error sending to bridge:', error);
            onError(error.message);
        }
    }
    
    // Poll status API
    async function pollStatus(taskId, onStatus, onError) {
        // Clear any existing polling for this task
        if (statusPollingIntervals[taskId]) {
            clearInterval(statusPollingIntervals[taskId]);
        }
        
        // Function to check status
        async function checkStatus() {
            try {
                // Try different CORS proxies
                for (let i = 0; i < CORS_PROXIES.length; i++) {
                    try {
                        const proxyUrl = CORS_PROXIES[i] + `${SONAUTO_API_BASE}/generations/status/${taskId}`;
                        
                        const response = await fetch(proxyUrl, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${apiKey}`
                            }
                        });
                        
                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || `HTTP error: ${response.status}`);
                        }
                        
                        // API returns status as a quoted string
                        const statusText = await response.text();
                        const status = statusText.replace(/"/g, '');
                        
                        onStatus(status);
                        
                        // If status is terminal, stop polling
                        if (status === 'SUCCESS' || status === 'FAILURE') {
                            clearInterval(statusPollingIntervals[taskId]);
                            delete statusPollingIntervals[taskId];
                        }
                        
                        return;
                    } catch (proxyError) {
                        console.error(`Error with status proxy ${i}:`, proxyError);
                        
                        // Try next proxy if available
                        if (i === CORS_PROXIES.length - 1) {
                            throw proxyError; // All proxies failed
                        }
                    }
                }
            } catch (error) {
                console.error('Error checking status:', error);
                onError(error.message);
                
                // Stop polling on error
                clearInterval(statusPollingIntervals[taskId]);
                delete statusPollingIntervals[taskId];
            }
        }
        
        // Check immediately then set interval
        await checkStatus();
        statusPollingIntervals[taskId] = setInterval(checkStatus, 2000);
        
        // Safety timeout (30 minutes)
        setTimeout(() => {
            if (statusPollingIntervals[taskId]) {
                clearInterval(statusPollingIntervals[taskId]);
                delete statusPollingIntervals[taskId];
                onError('Status polling timed out after 30 minutes');
            }
        }, 30 * 60 * 1000);
    }
    
    // Get generation result
    async function getGenerationResult(taskId, onResult, onError) {
        try {
            // If using bridge and it's connected, ask bridge for result
            if (bridgeConnected && bridgeSocket && document.getElementById('localBridge').checked) {
                bridgeSocket.send(JSON.stringify({
                    action: 'result',
                    taskId: taskId
                }));
                return; // Result will come via websocket
            }
            
            // Otherwise use direct API
            for (let i = 0; i < CORS_PROXIES.length; i++) {
                try {
                    const proxyUrl = CORS_PROXIES[i] + `${SONAUTO_API_BASE}/generations/${taskId}`;
                    
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`
                        }
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `HTTP error: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    onResult(data);
                    return;
                } catch (proxyError) {
                    console.error(`Error with result proxy ${i}:`, proxyError);
                    
                    // Try next proxy if available
                    if (i === CORS_PROXIES.length - 1) {
                        throw proxyError; // All proxies failed
                    }
                }
            }
        } catch (error) {
            console.error('Error getting result:', error);
            onError(error.message);
        }
    }
    
    // Helper function to get the right endpoint
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
    
    // Make initializeApiBridge globally available
    window.initializeApiBridge = initializeApiBridge;
})();

