// API Bridge for Sonauto AI
// This file handles the different methods of connecting to the Sonauto API

(function() {
    // State
    let apiKey = null;
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
        
        // Make the functions available globally
        window.generateMusicViaApi = generateMusicViaApi;
        window.generateMusicViaBridge = generateMusicViaBridge;
        window.pollStatus = pollStatus;
        window.getGenerationResult = getGenerationResult;
        window.initializeApiBridge = initializeApiBridge;
    }
    
    // Generate music via local bridge
    function generateMusicViaBridge(params, onSuccess, onError) {
        try {
            if (!window.bridgeConnected || !window.bridgeSocket) {
                onError('Bridge is not connected');
                return;
            }
            
            // Send request to bridge
            window.bridgeSocket.send(JSON.stringify({
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
            if (window.bridgeConnected && window.bridgeSocket && document.getElementById('localBridge').checked) {
                window.bridgeSocket.send(JSON.stringify({
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