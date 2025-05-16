document.addEventListener('DOMContentLoaded', function() {
    // Global variables
    let currentTaskId = null;
    let generationHistory = [];
    let audioPlayers = {};
    let connectionMethod = 'direct'; // direct, local, curl
    let apiKey = localStorage.getItem('sonautoApiKey') || '';
    
    // Elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const toggleApiKeyBtn = document.getElementById('toggleApiKey');
    const generateButton = document.getElementById('generateButton');
    const generationType = document.getElementById('generationType');
    const newSongParams = document.getElementById('newSongParams');
    const extendSongParams = document.getElementById('extendSongParams');
    const inpaintSongParams = document.getElementById('inpaintSongParams');
    const instrumentalSwitch = document.getElementById('instrumentalSwitch');
    const lyricsContainer = document.getElementById('lyricsContainer');
    const promptStrength = document.getElementById('promptStrength');
    const promptStrengthValue = document.getElementById('promptStrengthValue');
    const outputFormat = document.getElementById('outputFormat');
    const bitRateContainer = document.getElementById('bitRateContainer');
    const extendDuration = document.getElementById('extendDuration');
    const extendDurationValue = document.getElementById('extendDurationValue');
    const cropDuration = document.getElementById('cropDuration');
    const cropDurationValue = document.getElementById('cropDurationValue');
    const aiAssistantBtn = document.getElementById('aiAssistant');
    const aiAssistantModal = new bootstrap.Modal(document.getElementById('aiAssistantModal'));
    const generationStatus = document.getElementById('generationStatus');
    const statusText = document.getElementById('statusText');
    const progressBar = document.getElementById('progressBar');
    const results = document.getElementById('results');
    const noResults = document.getElementById('noResults');
    const songContainer = document.getElementById('songContainer');
    const downloadSongBtn = document.getElementById('downloadSong');
    const shareButton = document.getElementById('shareButton');
    const copyTaskIdBtn = document.getElementById('copyTaskId');
    const historyTable = document.getElementById('historyTable');
    const emptyHistory = document.getElementById('emptyHistory');
    
    // Connection method elements
    const directApiRadio = document.getElementById('directApi');
    const localBridgeRadio = document.getElementById('localBridge');
    const curlCommandRadio = document.getElementById('curlCommand');
    const directApiDetail = document.getElementById('directApiDetail');
    const localBridgeDetail = document.getElementById('localBridgeDetail');
    const curlCommandDetail = document.getElementById('curlCommandDetail');
    const curlCommandText = document.getElementById('curlCommandText');
    const copyCurlCommand = document.getElementById('copyCurlCommand');
    
    // Tag elements
    const tagInput = document.getElementById('tagInput');
    const addTagBtn = document.getElementById('addTag');
    const selectedTags = document.getElementById('selectedTags');
    const tagSuggestions = document.querySelectorAll('.tag-suggestion');
    
    // Initialize UI with API key if available
    if (apiKey) {
        apiKeyInput.value = '••••••••••••••••';
    }
    
    // Initialize API bridge
    initializeApiBridge(apiKey);
    
    // Event Listeners
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    generateButton.addEventListener('click', generateMusic);
    generationType.addEventListener('change', handleGenerationTypeChange);
    instrumentalSwitch.addEventListener('change', toggleLyricsSection);
    promptStrength.addEventListener('input', updatePromptStrengthValue);
    outputFormat.addEventListener('change', toggleBitRateVisibility);
    extendDuration.addEventListener('input', updateExtendDurationValue);
    cropDuration.addEventListener('input', updateCropDurationValue);
    aiAssistantBtn.addEventListener('click', openAiAssistant);
    downloadSongBtn.addEventListener('click', downloadSong);
    shareButton.addEventListener('click', shareSong);
    copyTaskIdBtn.addEventListener('click', copyTaskId);
    
    // Connection Method Radio Buttons
    directApiRadio.addEventListener('change', handleConnectionMethodChange);
    localBridgeRadio.addEventListener('change', handleConnectionMethodChange);
    curlCommandRadio.addEventListener('change', handleConnectionMethodChange);
    
    // File upload events
    document.getElementById('uploadAudioExtend').addEventListener('click', () => document.getElementById('audioFileExtend').click());
    document.getElementById('uploadAudioInpaint').addEventListener('click', () => document.getElementById('audioFileInpaint').click());
    document.getElementById('audioFileExtend').addEventListener('change', handleFileUpload);
    document.getElementById('audioFileInpaint').addEventListener('change', handleFileUpload);
    
    // Tag functionality
    addTagBtn.addEventListener('click', addTag);
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    });
    
    tagSuggestions.forEach(tag => {
        tag.addEventListener('click', () => {
            if (tag.textContent === 'more...') {
                openTagExplorer();
            } else {
                addTagFromSuggestion(tag.textContent);
            }
        });
    });
    
    // Random seed button
    document.getElementById('randomSeed').addEventListener('click', generateRandomSeed);
    
    // Get started button
    document.getElementById('getStartedBtn').addEventListener('click', scrollToGenerator);
    
    // Downloads for bridge files
    document.getElementById('downloadNodeBridge').addEventListener('click', function() {
        const bridgeContent = generateNodeJsBridgeContent();
        const blob = new Blob([bridgeContent], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sonauto-bridge.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    
    document.getElementById('downloadPythonBridge').addEventListener('click', function() {
        const bridgeContent = generatePythonBridgeContent();
        const blob = new Blob([bridgeContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sonauto-bridge.py';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    
    // Copy cURL command
    copyCurlCommand.addEventListener('click', copyCurlCommandToClipboard);
    
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Load generation history from localStorage
    loadGenerationHistory();
    
    // Functions
    
    function saveApiKey() {
        const newApiKey = apiKeyInput.value;
        if (newApiKey && newApiKey !== '••••••••••••••••') {
            apiKey = newApiKey;
            localStorage.setItem('sonautoApiKey', apiKey);
            apiKeyInput.value = '••••••••••••••••';
            
            // Update API bridge with new key
            initializeApiBridge(apiKey);
            
            showAlert('API key saved successfully!', 'success');
        }
    }
    
    function toggleApiKeyVisibility() {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            if (apiKeyInput.value === '••••••••••••••••') {
                apiKeyInput.value = apiKey;
            }
            toggleApiKeyBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }
    
    function handleGenerationTypeChange() {
        const type = generationType.value;
        
        // Hide all parameter sections
        newSongParams.classList.add('d-none');
        extendSongParams.classList.add('d-none');
        inpaintSongParams.classList.add('d-none');
        
        // Show selected section
        if (type === 'new') {
            newSongParams.classList.remove('d-none');
        } else if (type === 'extend') {
            extendSongParams.classList.remove('d-none');
        } else if (type === 'inpaint') {
            inpaintSongParams.classList.remove('d-none');
        }
        
        // Update cURL command if that's the current method
        if (connectionMethod === 'curl') {
            updateCurlCommand();
        }
    }
    
    function toggleLyricsSection() {
        if (instrumentalSwitch.checked) {
            lyricsContainer.classList.add('d-none');
        } else {
            lyricsContainer.classList.remove('d-none');
        }
    }
    
    function updatePromptStrengthValue() {
        promptStrengthValue.textContent = promptStrength.value;
    }
    
    function toggleBitRateVisibility() {
        const format = outputFormat.value;
        if (format === 'mp3' || format === 'm4a') {
            bitRateContainer.classList.remove('d-none');
        } else {
            bitRateContainer.classList.add('d-none');
        }
    }
    
    function updateExtendDurationValue() {
        extendDurationValue.textContent = `${extendDuration.value}s`;
    }
    
    function updateCropDurationValue() {
        cropDurationValue.textContent = `${cropDuration.value}s`;
    }
    
    function handleConnectionMethodChange() {
        if (directApiRadio.checked) {
            connectionMethod = 'direct';
            directApiDetail.classList.remove('d-none');
            localBridgeDetail.classList.add('d-none');
            curlCommandDetail.classList.add('d-none');
        } else if (localBridgeRadio.checked) {
            connectionMethod = 'local';
            directApiDetail.classList.add('d-none');
            localBridgeDetail.classList.remove('d-none');
            curlCommandDetail.classList.add('d-none');
            
            // Attempt to connect to bridge when this method is selected
            setTimeout(connectToBridge, 100);
        } else if (curlCommandRadio.checked) {
            connectionMethod = 'curl';
            directApiDetail.classList.add('d-none');
            localBridgeDetail.classList.add('d-none');
            curlCommandDetail.classList.remove('d-none');
            updateCurlCommand();
        }
    }
    
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Data = e.target.result.split(',')[1]; // Remove the data URL part
                
                if (event.target.id === 'audioFileExtend') {
                    document.getElementById('audioUrlExtend').value = file.name;
                    // Store the base64 data in a dataset attribute
                    document.getElementById('audioUrlExtend').dataset.base64 = base64Data;
                } else if (event.target.id === 'audioFileInpaint') {
                    document.getElementById('audioUrlInpaint').value = file.name;
                    document.getElementById('audioUrlInpaint').dataset.base64 = base64Data;
                }
            };
            reader.readAsDataURL(file);
        }
    }
    
    function addTag() {
        const tag = tagInput.value.trim();
        if (tag) {
            const tagElement = document.createElement('div');
            tagElement.className = 'tag';
            tagElement.innerHTML = `
                ${tag}
                <span class="remove-tag"><i class="fas fa-times"></i></span>
            `;
            
            const removeBtn = tagElement.querySelector('.remove-tag');
            removeBtn.addEventListener('click', () => {
                tagElement.remove();
            });
            
            selectedTags.appendChild(tagElement);
            tagInput.value = '';
        }
    }
    
    function addTagFromSuggestion(tagText) {
        // Check if tag already exists
        const existingTags = Array.from(selectedTags.querySelectorAll('.tag')).map(tag => tag.textContent.trim());
        if (!existingTags.includes(tagText)) {
            const tagElement = document.createElement('div');
            tagElement.className = 'tag';
            tagElement.innerHTML = `
                ${tagText}
                <span class="remove-tag"><i class="fas fa-times"></i></span>
            `;
            
            const removeBtn = tagElement.querySelector('.remove-tag');
            removeBtn.addEventListener('click', () => {
                tagElement.remove();
            });
            
            selectedTags.appendChild(tagElement);
        }
    }
    
    function openTagExplorer() {
        // Would typically open a modal with more tag options
        // For now, just suggesting some additional tags
        const moreTags = ['ambient', 'classical', 'country', 'dance', 'folk', 'hip-hop', 'indie', 'metal'];
        
        moreTags.forEach(tag => {
            addTagFromSuggestion(tag);
        });
    }
    
    function generateRandomSeed() {
        const seed = Math.floor(Math.random() * 10000000);
        document.getElementById('seed').value = seed;
    }
    
    function scrollToGenerator() {
        document.getElementById('generator').scrollIntoView({
            behavior: 'smooth'
        });
    }
    
    function openAiAssistant() {
        aiAssistantModal.show();
    }
    
    function updateCurlCommand() {
        const generationParams = collectGenerationParameters();
        const endpoint = getEndpointForGenerationType();
        
        let curlCmd = `curl -X POST "${endpoint}" \\
-H "Authorization: Bearer YOUR_API_KEY" \\
-H "Content-Type: application/json" \\
-d '${JSON.stringify(generationParams, null, 2)}'`;
        
        curlCommandText.textContent = curlCmd;
    }
    
    function copyCurlCommandToClipboard() {
        const textToCopy = curlCommandText.textContent;
        navigator.clipboard.writeText(textToCopy).then(
            () => {
                showAlert('cURL command copied to clipboard!', 'success');
            },
            () => {
                showAlert('Failed to copy command.', 'danger');
            }
        );
    }
    
    function generateMusic() {
        if (!apiKey) {
            showAlert('Please enter your Sonauto API key first!', 'warning');
            return;
        }
        
        // Collect parameters
        const params = collectGenerationParameters();
        
        // Show generation status
        showGenerationStatus();
        updateGenerationStatus('RECEIVED', 0);
        
        // Execute based on connection method
        if (connectionMethod === 'direct') {
            // Using the API bridge
            generateMusicDirect(params);
        } else if (connectionMethod === 'local') {
            // Check if bridge is connected
            if (!window.bridgeConnected) {
                showAlert('Local bridge is not connected. Please start the local bridge first.', 'warning');
                updateGenerationStatus('FAILURE', 0);
                return;
            }
            
            // Using the local bridge
            generateMusicViaBridge(params);
        } else if (connectionMethod === 'curl') {
            // Just update the cURL command
            updateCurlCommand();
            updateGenerationStatus('CURL_READY', 100);
            showAlert('cURL command updated. Copy and run it in your terminal.', 'info');
        }
    }
    
    function collectGenerationParameters() {
        const type = generationType.value;
        const params = {
            generationType: type
        };
        
        // Common parameters
        params.prompt = document.getElementById('prompt').value;
        params.prompt_strength = parseFloat(promptStrength.value);
        params.seed = document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : undefined;
        params.num_songs = parseInt(document.getElementById('numSongs').value);
        params.output_format = outputFormat.value;
        
        if (outputFormat.value === 'mp3' || outputFormat.value === 'm4a') {
            params.output_bit_rate = parseInt(document.getElementById('outputBitRate').value);
        }
        
        params.webhook_url = document.getElementById('webhookUrl').value || undefined;
        
        // Collect tags
        const tagElements = selectedTags.querySelectorAll('.tag');
        params.tags = Array.from(tagElements).map(tag => tag.textContent.trim());
        
        // Type-specific parameters
        if (type === 'new') {
            params.instrumental = instrumentalSwitch.checked;
            
            if (!params.instrumental) {
                params.lyrics = document.getElementById('lyrics').value || undefined;
            }
        } else if (type === 'extend') {
            const audioUrl = document.getElementById('audioUrlExtend');
            if (audioUrl.dataset.base64) {
                params.audio_base64 = audioUrl.dataset.base64;
            } else {
                params.audio_url = audioUrl.value;
            }
            
            params.side = document.getElementById('extendSide').value;
            params.extend_duration = parseFloat(extendDuration.value);
            params.crop_duration = parseFloat(cropDuration.value);
        } else if (type === 'inpaint') {
            const audioUrl = document.getElementById('audioUrlInpaint');
            if (audioUrl.dataset.base64) {
                params.audio_base64 = audioUrl.dataset.base64;
            } else {
                params.audio_url = audioUrl.value;
            }
            
            const sectionStart = parseFloat(document.getElementById('sectionStart').value);
            const sectionEnd = parseFloat(document.getElementById('sectionEnd').value);
            params.sections = [[sectionStart, sectionEnd]];
            params.selection_crop = document.getElementById('selectionCrop').checked;
            params.lyrics = document.getElementById('lyrics').value || undefined;
        }
        
        return params;
    }
    
    function getEndpointForGenerationType() {
        const type = generationType.value;
        if (type === 'new') {
            return 'https://api.sonauto.ai/v1/generations';
        } else if (type === 'extend') {
            return 'https://api.sonauto.ai/v1/generations/extend';
        } else if (type === 'inpaint') {
            return 'https://api.sonauto.ai/v1/generations/inpaint';
        }
    }
    
    function showGenerationStatus() {
        generationStatus.classList.remove('d-none');
        noResults.classList.add('d-none');
        results.classList.add('d-none');
    }
    
    function updateGenerationStatus(status, progress) {
        statusText.textContent = status.replace(/_/g, ' ');
        progressBar.style.width = `${progress}%`;
        
        if (status === 'SUCCESS') {
            generationStatus.classList.remove('alert-info');
            generationStatus.classList.add('alert-success');
        } else if (status === 'FAILURE') {
            generationStatus.classList.remove('alert-info');
            generationStatus.classList.add('alert-danger');
        } else {
            generationStatus.classList.remove('alert-success', 'alert-danger');
            generationStatus.classList.add('alert-info');
        }
    }
    
    function generateMusicDirect(params) {
        // This function is implemented in api-bridge.js
        window.generateMusicViaApi(params, (taskId) => {
            // Store task ID and start polling
            currentTaskId = taskId;
            updateGenerationStatus('TASK_SENT', 10);
            pollGenerationStatus(taskId);
        }, (error) => {
            showAlert(`Error: ${error}`, 'danger');
            updateGenerationStatus('FAILURE', 0);
        });
    }
    
    function generateMusicViaBridge(params) {
        // This function is implemented in api-bridge.js
        window.generateMusicViaBridge(params, (taskId) => {
            // Store task ID
            currentTaskId = taskId;
            updateGenerationStatus('TASK_SENT', 10);
        }, (error) => {
            showAlert(`Error: ${error}`, 'danger');
            updateGenerationStatus('FAILURE', 0);
        });
    }
    
    function pollGenerationStatus(taskId) {
        // This function is implemented in api-bridge.js
        window.pollStatus(taskId, (status) => {
            updateStatusProgress(status);
            
            if (status === 'SUCCESS') {
                fetchGenerationResult(taskId);
            } else if (status === 'FAILURE') {
                showAlert('Generation failed. Please check your parameters and try again.', 'danger');
            }
        }, (error) => {
            showAlert(`Error polling status: ${error}`, 'danger');
            updateGenerationStatus('FAILURE', 0);
        });
    }
    
    function updateStatusProgress(status) {
        // Map status to progress percentage
        let progress = 0;
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
            default:
                if (status.includes('TRANSCRIBE')) {
                    progress = 25;
                }
        }
        
        updateGenerationStatus(status, progress);
    }
    
    function fetchGenerationResult(taskId) {
        // This function is implemented in api-bridge.js
        window.getGenerationResult(taskId, (result) => {
            displayGenerationResult(result);
            addToGenerationHistory(result);
        }, (error) => {
            showAlert(`Error fetching result: ${error}`, 'danger');
        });
    }
    
    function displayGenerationResult(result) {
        generationStatus.classList.add('d-none');
        results.classList.remove('d-none');
        
        // Display audio player
        songContainer.innerHTML = '';
        
        result.song_paths.forEach((songPath, index) => {
            const songDiv = document.createElement('div');
            songDiv.className = 'audio-player mb-3';
            songDiv.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        Song ${index + 1}
                    </div>
                    <div class="card-body">
                        <div class="waveform" id="waveform-${index}"></div>
                        <div class="player-controls">
                            <button class="play-button" id="playBtn-${index}">
                                <i class="fas fa-play"></i>
                            </button>
                            <div class="audio-time">
                                <span id="currentTime-${index}">0:00</span> / 
                                <span id="duration-${index}">0:00</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            songContainer.appendChild(songDiv);
            
            // Initialize waveform
            createWaveformPlayer(songPath, index);
        });
        
        // Display generation details
        document.getElementById('resultTaskId').textContent = result.id;
        document.getElementById('resultCreatedAt').textContent = new Date(result.created_at).toLocaleString();
        document.getElementById('resultSeed').textContent = result.seed;
        document.getElementById('resultPromptStrength').textContent = result.prompt_strength;
        
        // Display tags
        const resultTags = document.getElementById('resultTags');
        resultTags.innerHTML = '';
        result.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'badge bg-primary me-1';
            tagSpan.textContent = tag;
            resultTags.appendChild(tagSpan);
        });
        
        // Display lyrics if any
        const resultLyricsContainer = document.getElementById('resultLyricsContainer');
        const resultLyrics = document.getElementById('resultLyrics');
        
        if (result.lyrics) {
            resultLyricsContainer.classList.remove('d-none');
            resultLyrics.textContent = result.lyrics;
        } else {
            resultLyricsContainer.classList.add('d-none');
        }
    }
    
    function createWaveformPlayer(audioUrl, index) {
        const wavesurfer = WaveSurfer.create({
            container: `#waveform-${index}`,
            waveColor: '#8e44ad',
            progressColor: '#6200ea',
            cursorColor: '#03dac6',
            barWidth: 2,
            barRadius: 3,
            cursorWidth: 1,
            height: 80,
            barGap: 2,
            responsive: true
        });
        
        wavesurfer.load(audioUrl);
        
        const playBtn = document.getElementById(`playBtn-${index}`);
        const currentTimeEl = document.getElementById(`currentTime-${index}`);
        const durationEl = document.getElementById(`duration-${index}`);
        
        wavesurfer.on('ready', () => {
            playBtn.addEventListener('click', () => {
                wavesurfer.playPause();
            });
            
            const duration = wavesurfer.getDuration();
            durationEl.textContent = formatTime(duration);
        });
        
        wavesurfer.on('play', () => {
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        });
        
        wavesurfer.on('pause', () => {
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        });
        
        wavesurfer.on('audioprocess', () => {
            currentTimeEl.textContent = formatTime(wavesurfer.getCurrentTime());
        });
        
        // Store wavesurfer instance
        audioPlayers[index] = wavesurfer;
        
        return wavesurfer;
    }
    
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    
    function downloadSong() {
        if (!currentTaskId) return;
        
        // This function is implemented in api-bridge.js
        window.getGenerationResult(currentTaskId, (result) => {
            result.song_paths.forEach((songPath, index) => {
                // Create a download link
                const a = document.createElement('a');
                a.href = songPath;
                a.download = `sonauto_${currentTaskId}_song${index + 1}.${result.output_format || 'ogg'}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        }, (error) => {
            showAlert(`Error downloading: ${error}`, 'danger');
        });
    }
    
    function shareSong() {
        if (!currentTaskId) return;
        
        // Create a URL to a page that will show this generation
        const shareUrl = `${window.location.origin}${window.location.pathname}?taskId=${currentTaskId}`;
        
        // Copy to clipboard
        navigator.clipboard.writeText(shareUrl).then(
            () => {
                showAlert('Share link copied to clipboard!', 'success');
            },
            () => {
                showAlert('Failed to copy link.', 'danger');
            }
        );
    }
    
    function copyTaskId() {
        if (!currentTaskId) return;
        
        navigator.clipboard.writeText(currentTaskId).then(
            () => {
                showAlert('Task ID copied to clipboard!', 'success');
            },
            () => {
                showAlert('Failed to copy Task ID.', 'danger');
            }
        );
    }
    
    function addToGenerationHistory(result) {
        // Add to the top of history
        generationHistory.unshift(result);
        
        // Limit history size
        if (generationHistory.length > 50) {
            generationHistory = generationHistory.slice(0, 50);
        }
        
        // Save to localStorage
        localStorage.setItem('sonautoGenerationHistory', JSON.stringify(generationHistory));
        
        // Update UI
        updateHistoryTable();
    }
    
    function loadGenerationHistory() {
        const savedHistory = localStorage.getItem('sonautoGenerationHistory');
        if (savedHistory) {
            try {
                generationHistory = JSON.parse(savedHistory);
                updateHistoryTable();
            } catch (e) {
                console.error('Error loading history:', e);
                localStorage.removeItem('sonautoGenerationHistory');
            }
        }
    }
    
    function updateHistoryTable() {
        const tableBody = historyTable.querySelector('tbody');
        tableBody.innerHTML = '';
        
        if (generationHistory.length === 0) {
            emptyHistory.classList.remove('d-none');
            historyTable.classList.add('d-none');
            return;
        }
        
        emptyHistory.classList.add('d-none');
        historyTable.classList.remove('d-none');
        
        generationHistory.forEach(item => {
            const row = document.createElement('tr');
            
            // Format date
            const date = new Date(item.created_at);
            const formattedDate = date.toLocaleString();
            
            // Format tags
            const tagsHtml = item.tags.map(tag => `<span class="badge bg-primary me-1">${tag}</span>`).join('');
            
            // Status badge
            const statusClass = item.status === 'SUCCESS' ? 'bg-success' : 'bg-danger';
            
            row.innerHTML = `
                <td>${item.id.substring(0, 8)}...</td>
                <td>${formattedDate}</td>
                <td>${tagsHtml}</td>
                <td><span class="badge ${statusClass}">${item.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-btn" data-task-id="${item.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add event listeners for view buttons
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.dataset.taskId;
                viewHistoryItem(taskId);
            });
        });
    }
    
    function viewHistoryItem(taskId) {
        const item = generationHistory.find(gen => gen.id === taskId);
        if (item) {
            // Set as current task
            currentTaskId = taskId;
            
            // Display result
            displayGenerationResult(item);
            
            // Scroll to results section
            document.getElementById('generator').scrollIntoView({
                behavior: 'smooth'
            });
        }
    }
    
    function showAlert(message, type) {
        const alertContainer = document.createElement('div');
        alertContainer.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
        alertContainer.style.zIndex = '9999';
        alertContainer.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(alertContainer);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertContainer);
            bsAlert.close();
        }, 5000);
    }
    
    // Improved bridge connection handling
    function connectToBridge() {
        try {
            // Show connection attempt status
            updateBridgeStatus(false, 'Attempting to connect...');
            
            // Close existing connection if any
            if (window.bridgeSocket && window.bridgeSocket.readyState !== WebSocket.CLOSED) {
                window.bridgeSocket.close();
            }
            
            window.bridgeSocket = new WebSocket('ws://localhost:3334');
            
            window.bridgeSocket.onopen = function() {
                console.log('Connected to Sonauto bridge');
                window.bridgeConnected = true;
                
                // Update UI
                updateBridgeStatus(true);
                showAlert('Successfully connected to local bridge', 'success');
            };
            
            window.bridgeSocket.onmessage = function(event) {
                console.log('Bridge message received:', event.data);
                handleBridgeMessage(event.data);
            };
            
            window.bridgeSocket.onclose = function() {
                console.log('Disconnected from Sonauto bridge');
                window.bridgeConnected = false;
                updateBridgeStatus(false);
            };
            
            window.bridgeSocket.onerror = function(error) {
                console.error('Bridge socket error:', error);
                window.bridgeConnected = false;
                updateBridgeStatus(false, 'Connection error - make sure the bridge is running');
                showAlert('Failed to connect to local bridge. Did you start the bridge application?', 'warning');
            };
        } catch (error) {
            console.error('Error connecting to bridge:', error);
            window.bridgeConnected = false;
            updateBridgeStatus(false, error.message);
        }
    }
    
    // Add a manual connect button
    document.getElementById('localBridgeDetail').querySelector('.bridge-status').innerHTML += '<button id="connectBridgeBtn" class="btn btn-sm btn-primary mt-2">Connect to Bridge</button>';
    document.getElementById('connectBridgeBtn').addEventListener('click', connectToBridge);
    
    // Handler for bridge messages
    function handleBridgeMessage(messageData) {
        try {
            const data = JSON.parse(messageData);
            console.log('Bridge message:', data);
            
            if (data.type === 'connected') {
                window.bridgeConnected = true;
                updateBridgeStatus(true);
            } else if (data.type === 'generation_started') {
                // Save task ID for later
                currentTaskId = data.taskId;
                updateStatusProgress('TASK_SENT');
            } else if (data.type === 'status_update') {
                // Update status in UI
                updateStatusProgress(data.status);
            } else if (data.type === 'generation_result') {
                // Display result
                displayGenerationResult(data.result);
                
                // Add to history
                addToGenerationHistory(data.result);
            } else if (data.type === 'error') {
                console.error('Bridge error:', data.message);
                showAlert(`Bridge error: ${data.message}`, 'danger');
            }
        } catch (e) {
            console.error('Error parsing bridge message:', e);
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
                bridgeStatus.innerHTML = 'Bridge is active and ready to use. <button id="disconnectBridgeBtn" class="btn btn-sm btn-outline-danger mt-2">Disconnect</button>';
                
                // Add disconnect handler
                document.getElementById('disconnectBridgeBtn').addEventListener('click', function() {
                    if (window.bridgeSocket) {
                        window.bridgeSocket.close();
                    }
                });
            } else {
                connectionStatus.className = 'badge bg-warning';
                connectionStatus.textContent = 'Not Connected';
                
                if (errorMsg) {
                    bridgeStatus.innerHTML = `Bridge error: ${errorMsg} <button id="connectBridgeBtn" class="btn btn-sm btn-primary mt-2">Connect to Bridge</button>`;
                } else {
                    bridgeStatus.innerHTML = 'Please download and run the bridge application. <button id="connectBridgeBtn" class="btn btn-sm btn-primary mt-2">Connect to Bridge</button>';
                }
                
                // Re-add connect handler
                document.getElementById('connectBridgeBtn').addEventListener('click', connectToBridge);
            }
        }
    }
    
    function generateNodeJsBridgeContent() {
        return `
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

// Create WebSocket server
const wss = new WebSocket.Server({ port: 3334 });

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received request:', data.action);
            
            if (data.action === 'generate') {
                const response = await generateMusic(data.params, ws);
                ws.send(JSON.stringify({
                    type: 'generation_started',
                    taskId: response.task_id
                }));
            } else if (data.action === 'status') {
                const response = await checkStatus(data.taskId);
                ws.send(JSON.stringify({
                    type: 'status_update',
                    status: response,
                    taskId: data.taskId
                }));
            } else if (data.action === 'result') {
                const response = await getResult(data.taskId);
                ws.send(JSON.stringify({
                    type: 'generation_result',
                    result: response,
                    taskId: data.taskId
                }));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Sonauto bridge server'
    }));
});

// API Functions
async function generateMusic(params, ws) {
    const endpoint = getEndpointForType(params.generationType);
    
    try {
        const response = await axios.post(endpoint, params, {
            headers: {
                'Authorization': \`Bearer \${API_KEY}\`,
                'Content-Type': 'application/json'
            }
        });
        
        // Start polling status
        const taskId = response.data.task_id;
        pollStatus(taskId, ws);
        
        return response.data;
    } catch (error) {
        console.error('Error generating music:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error || 'Failed to generate music');
    }
}

async function checkStatus(taskId) {
    try {
        const response = await axios.get(\`\${SONAUTO_API_BASE}/generations/status/\${taskId}\`, {
            headers: {
                'Authorization': \`Bearer \${API_KEY}\`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error checking status:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error || 'Failed to check status');
    }
}

async function getResult(taskId) {
    try {
        const response = await axios.get(\`\${SONAUTO_API_BASE}/generations/\${taskId}\`, {
            headers: {
                'Authorization': \`Bearer \${API_KEY}\`
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error getting result:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error || 'Failed to get result');
    }
}

function getEndpointForType(type) {
    switch (type) {
        case 'new':
            return \`\${SONAUTO_API_BASE}/generations\`;
        case 'extend':
            return \`\${SONAUTO_API_BASE}/generations/extend\`;
        case 'inpaint':
            return \`\${SONAUTO_API_BASE}/generations/inpaint\`;
        default:
            return \`\${SONAUTO_API_BASE}/generations\`;
    }
}

// Poll status and send updates to client
async function pollStatus(taskId, ws) {
    let interval;
    let completed = false;
    
    interval = setInterval(async () => {
        try {
            const status = await checkStatus(taskId);
            
            // Send status update to client
            ws.send(JSON.stringify({
                type: 'status_update',
                status: status,
                taskId: taskId
            }));
            
            // Check if generation is complete
            if (status === 'SUCCESS' || status === 'FAILURE') {
                completed = true;
                clearInterval(interval);
                
                // If success, fetch the full result
                if (status === 'SUCCESS') {
                    const result = await getResult(taskId);
                    ws.send(JSON.stringify({
                        type: 'generation_result',
                        result: result,
                        taskId: taskId
                    }));
                }
            }
        } catch (error) {
            console.error('Error polling status:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message,
                taskId: taskId
            }));
            
            clearInterval(interval);
        }
    }, 2000); // Poll every 2 seconds
    
    // Clear interval after 30 minutes to prevent infinite polling
    setTimeout(() => {
        if (!completed && interval) {
            clearInterval(interval);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Status polling timed out after 30 minutes',
                taskId: taskId
            }));
        }
    }, 30 * 60 * 1000);
}

app.listen(port, () => {
    console.log(\`Sonauto Bridge Server running at http://localhost:\${port}\`);
    console.log(\`WebSocket server running at ws://localhost:3334\`);
});
`;
    }
    
    function generatePythonBridgeContent() {
        return `
import json
import asyncio
import websockets
import requests
import time
from threading import Thread

# Your Sonauto API key - replace with yours or use env variables
API_KEY = "${apiKey || 'YOUR_API_KEY_HERE'}"
SONAUTO_API_BASE = "https://api.sonauto.ai/v1"

# Store active tasks for polling
active_tasks = {}

# API Functions
def generate_music(params):
    endpoint = get_endpoint_for_type(params.get('generationType', 'new'))
    
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(endpoint, json=params, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error generating music: {str(e)}")
        if hasattr(e, 'response') and e.response:
            error_msg = e.response.json().get('error', 'Failed to generate music')
        else:
            error_msg = 'Failed to generate music'
        raise Exception(error_msg)

def check_status(task_id):
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    try:
        response = requests.get(f"{SONAUTO_API_BASE}/generations/status/{task_id}", headers=headers)
        response.raise_for_status()
        return response.text.strip('"')  # API returns status as a quoted string
    except requests.exceptions.RequestException as e:
        print(f"Error checking status: {str(e)}")
        if hasattr(e, 'response') and e.response:
            error_msg = e.response.json().get('error', 'Failed to check status')
        else:
            error_msg = 'Failed to check status'
        raise Exception(error_msg)

def get_result(task_id):
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    try:
        response = requests.get(f"{SONAUTO_API_BASE}/generations/{task_id}", headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error getting result: {str(e)}")
        if hasattr(e, 'response') and e.response:
            error_msg = e.response.json().get('error', 'Failed to get result')
        else:
            error_msg = 'Failed to get result'
        raise Exception(error_msg)

def get_endpoint_for_type(generation_type):
    if generation_type == 'new':
        return f"{SONAUTO_API_BASE}/generations"
    elif generation_type == 'extend':
        return f"{SONAUTO_API_BASE}/generations/extend"
    elif generation_type == 'inpaint':
        return f"{SONAUTO_API_BASE}/generations/inpaint"
    else:
        return f"{SONAUTO_API_BASE}/generations"

# Poll status and send updates
def poll_status(task_id, websocket):
    completed = False
    
    while not completed:
        try:
            status = check_status(task_id)
            
            # Send status update
            asyncio.run(send_message(websocket, {
                'type': 'status_update',
                'status': status,
                'taskId': task_id
            }))
            
            # Check if generation is complete
            if status == 'SUCCESS' or status == 'FAILURE':
                completed = True
                
                # If success, fetch the full result
                if status == 'SUCCESS':
                    result = get_result(task_id)
                    asyncio.run(send_message(websocket, {
                        'type': 'generation_result',
                        'result': result,
                        'taskId': task_id
                    }))
                    
            # Wait before polling again
            time.sleep(2)
            
        except Exception as e:
            print(f"Error polling status: {str(e)}")
            asyncio.run(send_message(websocket, {
                'type': 'error',
                'message': str(e),
                'taskId': task_id
            }))
            completed = True

async def send_message(websocket, message):
    try:
        await websocket.send(json.dumps(message))
    except Exception as e:
        print(f"Error sending message: {str(e)}")

# WebSocket server handler
async def sonauto_bridge(websocket, path):
    print("Client connected")
    
    # Send connection confirmation
    await websocket.send(json.dumps({
        'type': 'connected',
        'message': 'Connected to Sonauto bridge server'
    }))
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                print(f"Received request: {data.get('action')}")
                
                if data.get('action') == 'generate':
                    response = generate_music(data.get('params', {}))
                    await websocket.send(json.dumps({
                        'type': 'generation_started',
                        'taskId': response.get('task_id')
                    }))
                    
                    # Start status polling in a separate thread
                    task_id = response.get('task_id')
                    active_tasks[task_id] = Thread(target=poll_status, args=(task_id, websocket))
                    active_tasks[task_id].start()
                    
                elif data.get('action') == 'status':
                    task_id = data.get('taskId')
                    status = check_status(task_id)
                    await websocket.send(json.dumps({
                        'type': 'status_update',
                        'status': status,
                        'taskId': task_id
                    }))
                    
                elif data.get('action') == 'result':
                    task_id = data.get('taskId')
                    result = get_result(task_id)
                    await websocket.send(json.dumps({
                        'type': 'generation_result',
                        'result': result,
                        'taskId': task_id
                    }))
                    
            except Exception as e:
                print(f"Error processing message: {str(e)}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': str(e)
                }))
                
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

async def main():
    print("Starting Sonauto Bridge Server...")
    print("WebSocket server running at ws://localhost:3334")
    
    async with websockets.serve(sonauto_bridge, "localhost", 3334):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
`;
    }
});