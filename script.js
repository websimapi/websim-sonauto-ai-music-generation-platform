// ...

function updateStatusProgress(status) {
    // Map status to progress percentage
    let progress = 0;
    let displayStatus = status;
    
    switch (status) {
        case 'RECEIVED':
            progress = 5;
            break;
        case 'PROMPT':
            progress = 10;
            break;
        case 'TASK_SENT':
            progress = 20;
            break;
        case 'GENERATE_TASK_STARTED':
            progress = 30;
            break;
        case 'LOADING_SOURCE':
            progress = 35;
            break;
        case 'BEGINNING_GENERATION':
            progress = 40;
            break;
        case 'GENERATING':
            progress = 60;
            break;
        case 'DECOMPRESSING':
            progress = 80;
            break;
        case 'SAVING':
            progress = 90;
            break;
        case 'SUCCESS':
            progress = 100;
            break;
        case 'FAILURE':
            progress = 0;
            break;
        case 'TRYING_DIRECT_API':
            progress = 5;
            displayStatus = 'Connecting to API...';
            break;
        default:
            if (status.includes('TRYING_CORS_PROXY')) {
                const proxyNum = status.split('_').pop();
                progress = 5;
                displayStatus = `Trying CORS proxy ${proxyNum}...`;
            } else if (status.includes('TRANSCRIBE')) {
                progress = 25;
            }
    }
    
    updateGenerationStatus(displayStatus, progress);
}

function recommendLocalBridge() {
    // Check if we're already using the local bridge
    if (document.getElementById('localBridge').checked) {
        return;
    }
    
    // Show a recommendation alert
    showAlert('CORS issues detected. We recommend using the Local Bridge option for the most reliable connection.', 'warning');
    
    // Highlight the local bridge option
    const localBridgeOption = document.querySelector('label[for="localBridge"]');
    if (localBridgeOption) {
        localBridgeOption.classList.add('recommended-option', 'pulse');
        setTimeout(() => {
            localBridgeOption.classList.remove('recommended-option', 'pulse');
        }, 5000);
    }
}

function generateMusicDirect(params) {
    window.generateMusicViaApi(params, (taskId) => {
        // Store task ID and start polling
        currentTaskId = taskId;
        updateGenerationStatus('TASK_SENT', 10);
        pollGenerationStatus(taskId);
    }, (error) => {
        showAlert(`Error: ${error}`, 'danger');
        updateGenerationStatus('FAILURE', 0);
        
        // If error contains CORS or proxy-related terms, recommend the local bridge
        if (error.toLowerCase().includes('cors') || 
            error.toLowerCase().includes('proxy') || 
            error.toLowerCase().includes('failed to fetch')) {
            recommendLocalBridge();
        }
    });
}

// ...