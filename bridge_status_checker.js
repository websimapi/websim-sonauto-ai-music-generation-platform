// This script checks if a local bridge is running and shows the status

(function() {
    let checkingBridge = false;
    
    // Check if a local bridge is running by attempting to connect
    function checkBridgeRunning() {
        if (checkingBridge) return;
        checkingBridge = true;
        
        try {
            const testSocket = new WebSocket('ws://localhost:3334');
            
            testSocket.onopen = function() {
                console.log('Bridge is running');
                
                // Close test connection immediately
                testSocket.close();
                checkingBridge = false;
                
                // Update UI with connected status
                const bridgeStatus = document.querySelector('#localBridgeDetail .connection-status .badge');
                if (bridgeStatus) {
                    bridgeStatus.className = 'badge bg-success';
                    bridgeStatus.textContent = 'Available';
                    
                    // Show connect button
                    const statusText = document.querySelector('.bridge-status');
                    if (statusText) {
                        statusText.innerHTML = 'Bridge detected! Click to connect: <button id="connectBridgeBtn" class="btn btn-sm btn-primary mt-2">Connect to Bridge</button>';
                        document.getElementById('connectBridgeBtn').addEventListener('click', function() {
                            if (typeof window.connectToBridge === 'function') {
                                window.connectToBridge();
                            } else {
                                console.error('connectToBridge function not found');
                            }
                        });
                    }
                }
            };
            
            testSocket.onerror = function() {
                console.log('Bridge is not running');
                checkingBridge = false;
                
                // Update UI with not connected status
                const bridgeStatus = document.querySelector('#localBridgeDetail .connection-status .badge');
                if (bridgeStatus) {
                    bridgeStatus.className = 'badge bg-warning';
                    bridgeStatus.textContent = 'Not Available';
                }
            };
            
            // Set timeout in case the connection hangs
            setTimeout(function() {
                if (testSocket.readyState !== WebSocket.OPEN && testSocket.readyState !== WebSocket.CLOSED) {
                    testSocket.close();
                    checkingBridge = false;
                }
            }, 3000);
            
        } catch (error) {
            console.error('Error checking bridge:', error);
            checkingBridge = false;
        }
    }
    
    // Run check when element is in view
    function setupBridgeDetection() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    checkBridgeRunning();
                }
            });
        });
        
        const localBridgeDetail = document.getElementById('localBridgeDetail');
        if (localBridgeDetail) {
            observer.observe(localBridgeDetail);
        }
    }
    
    // Run setup when DOM is loaded
    document.addEventListener('DOMContentLoaded', setupBridgeDetection);
    
    // Expose function globally
    window.checkBridgeRunning = checkBridgeRunning;
})();