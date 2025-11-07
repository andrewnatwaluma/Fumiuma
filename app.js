// app.js - Complete Mobile-Optimized Voting System for UMA - UPDATED VERSION
const SUPABASE_URL = 'https://jypuappvttmkvrxowvmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5cHVhcHB2dHRta3ZyeG93dm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNjg3NTUsImV4cCI6MjA3Nzc0NDc1NX0.-zb9RObfSaCV8MOik1AFIW_ygq3Agh2QuWky9RXcXZA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
window.votingApp = {
    selectedCandidates: {},
    currentVoterId: null,
    currentVoterHasVoted: false,
    hasVotedOnThisDevice: localStorage.getItem('hasVotedOnThisDevice') === 'true',
    positions: [],
    electionEndTime: null,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    selectedIdFile: null
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    checkVotingStatus();
    checkDeviceVotingStatus();
    setupMobileOptimizations();
});

// Check if voting is open or closed
async function checkVotingStatus() {
    try {
        const { data: settings, error } = await supabase
            .from('election_settings')
            .select('*')
            .single();

        if (!error && settings && settings.election_end_time) {
            window.votingApp.electionEndTime = new Date(settings.election_end_time);
            initializeElectionTimer();
        } else {
            // If no timer set, hide voting closed section
            document.getElementById('votingClosedSection').style.display = 'none';
            document.getElementById('progressContainer').style.display = 'block';
            document.getElementById('votingMain').style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking voting status:', error);
        // Default to showing voting interface if error
        document.getElementById('votingClosedSection').style.display = 'none';
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('votingMain').style.display = 'block';
    }
}

// Enhanced utility function with retry logic for Supabase queries
async function supabaseQueryWithRetry(queryFn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await queryFn();
            return result;
        } catch (error) {
            console.log(`Query attempt ${i + 1} failed:`, error.message);
            
            if (error.message.includes('rate limit') || 
                error.message.includes('network') || 
                error.message.includes('connection') ||
                error.message.includes('timeout') ||
                error.code === 'PGRST204' ||
                error.code === 'PGRST301') {
                
                if (i === maxRetries - 1) {
                    console.log('Max retries exceeded');
                    throw error;
                }
                
                const backoffTime = Math.pow(2, i) * 1000;
                console.log(`Retrying in ${backoffTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
            }
            throw error;
        }
    }
}

// Mobile-specific optimizations
function setupMobileOptimizations() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], select, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.style.fontSize = '16px';
        });
        
        input.addEventListener('blur', function() {
            this.style.fontSize = '';
        });
    });

    if (window.votingApp.isMobile) {
        document.body.classList.add('mobile-device');
        
        const criticalButtons = document.querySelectorAll('button, .candidate, .change-vote, .upload-option');
        criticalButtons.forEach(btn => {
            btn.style.minHeight = '44px';
            if (btn.classList.contains('upload-option')) {
                btn.style.minHeight = '120px';
            }
        });

        document.documentElement.style.scrollBehavior = 'smooth';
    }

    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 100);
    });

    const fileInput = document.getElementById('idUpload');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                if (file.size > 10 * 1024 * 1024) {
                    showMessage(document.getElementById('uploadMessage'), 
                               'File too large. Maximum size is 10MB.', 'error');
                    this.value = '';
                }
            }
        });
    }
}

// Enhanced election timer for mobile
function initializeElectionTimer() {
    const timerElement = document.getElementById('electionTimer');
    const countdownElement = document.getElementById('countdown');
    const votingClosedSection = document.getElementById('votingClosedSection');
    const progressContainer = document.getElementById('progressContainer');
    const votingMain = document.getElementById('votingMain');
    
    function updateTimer() {
        const now = new Date().getTime();
        const distance = window.votingApp.electionEndTime - now;
        
        if (distance < 0) {
            // Election has ended
            timerElement.classList.add('closed');
            countdownElement.textContent = 'VOTING CLOSED';
            votingClosedSection.style.display = 'block';
            progressContainer.style.display = 'none';
            votingMain.style.display = 'none';
            return;
        }
        
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        if (window.votingApp.isMobile && window.innerWidth < 768) {
            countdownElement.textContent = `${hours}h ${minutes}m`;
        } else {
            countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        }
        
        timerElement.style.display = 'block';
        votingClosedSection.style.display = 'none';
        progressContainer.style.display = 'block';
        votingMain.style.display = 'block';
    }
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Check if device has already been used for voting
function checkDeviceVotingStatus() {
    if (window.votingApp.hasVotedOnThisDevice) {
        const loginSection = document.getElementById('loginSection');
        loginSection.innerHTML += `
            <div class="message warning">
                <i class="fas fa-exclamation-triangle"></i>
                This device has already been used to vote.
            </div>
        `;
    }
}

// Enhanced ID Upload Functions - REAL UPLOAD
function openCamera() {
    const fileInput = document.getElementById('idUpload');
    fileInput.setAttribute('capture', 'environment');
    fileInput.accept = 'image/*';
    fileInput.onchange = handleFileSelection;
    fileInput.click();
}

function openGallery() {
    const fileInput = document.getElementById('idUpload');
    fileInput.removeAttribute('capture');
    fileInput.accept = 'image/*';
    fileInput.onchange = handleFileSelection;
    fileInput.click();
}

function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showMessage(document.getElementById('uploadMessage'), 
                   'File too large. Please select a file smaller than 10MB.', 'error');
        resetUpload();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showMessage(document.getElementById('uploadMessage'), 
                   'Please select a valid image file (JPEG, PNG, etc.).', 'error');
        resetUpload();
        return;
    }

    showIdPreview(file);
}

function showIdPreview(file) {
    const preview = document.getElementById('idPreview');
    const previewImage = document.getElementById('previewImage');
    const uploadMessage = document.getElementById('uploadMessage');
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        previewImage.src = e.target.result;
        preview.style.display = 'block';
        
        window.votingApp.selectedIdFile = file;
        
        showMessage(uploadMessage, 'Please confirm your ID upload.', 'info');
        
        preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    
    reader.onerror = function() {
        showMessage(uploadMessage, 'Error reading file. Please try again.', 'error');
        resetUpload();
    };
    
    reader.readAsDataURL(file);
}

// REAL ID UPLOAD FUNCTION
async function confirmUpload() {
    const uploadMessage = document.getElementById('uploadMessage');
    
    if (!window.votingApp.selectedIdFile) {
        showMessage(uploadMessage, 'No ID file selected.', 'error');
        return;
    }

    showMessage(uploadMessage, 'Uploading ID...', 'info');

    try {
        const file = window.votingApp.selectedIdFile;
        const voterId = window.votingApp.currentVoterId;
        
        const fileExt = file.name.split('.').pop();
        const fileName = `id-${voterId}-${Date.now()}.${fileExt}`;
        const filePath = `id-uploads/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('id-uploads')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('id-uploads')
            .getPublicUrl(filePath);

        const { error: updateError } = await supabase
            .from('voters')
            .update({ 
                id_url: urlData.publicUrl,
                id_uploaded_at: new Date().toISOString()
            })
            .eq('id', voterId);

        if (updateError) throw updateError;

        showMessage(uploadMessage, 'ID uploaded successfully!', 'success');
        
        setTimeout(() => {
            showSection('votingSection');
            loadCandidates();
            updateProgress(3, 'Step 3 of 4: Cast Your Votes');
            
            window.scrollTo(0, 0);
        }, 1500);

    } catch (error) {
        console.error('ID upload error:', error);
        showMessage(uploadMessage, 'Error uploading ID: ' + error.message, 'error');
    }
}

function cancelUpload() {
    resetUpload();
    showMessage(document.getElementById('uploadMessage'), 
               'Upload cancelled. Please select an ID file.', 'info');
}

function resetUpload() {
    const fileInput = document.getElementById('idUpload');
    const preview = document.getElementById('idPreview');
    
    fileInput.value = '';
    preview.style.display = 'none';
    window.votingApp.selectedIdFile = null;
}

// Handle voter login with email
async function handleVoterLogin() {
    const voterEmailInput = document.getElementById('voterEmail');
    const voterEmail = voterEmailInput.value.trim().toLowerCase();
    const loginMessage = document.getElementById('loginMessage');

    if (!voterEmail) {
        showMessage(loginMessage, 'Please enter your email.', 'error');
        voterEmailInput.focus();
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(voterEmail)) {
        showMessage(loginMessage, 'Please enter a valid email address.', 'error');
        voterEmailInput.focus();
        return;
    }

    // Check device voting status
    if (window.votingApp.hasVotedOnThisDevice) {
        showAlreadyVotedNotification();
        return;
    }

    showMessage(loginMessage, 'Checking voter registration...', 'info');

    try {
        const { data: voter, error } = await supabase
            .from('voters')
            .select('*')
            .ilike('email', voterEmail)
            .maybeSingle();

        if (error) throw error;

        if (!voter) {
            showMessage(loginMessage, 'Voter not found. Please check your email and try again.', 'error');
            voterEmailInput.focus();
            return;
        }

        if (voter.has_voted) {
            showAlreadyVotedNotification();
            return;
        }

        // Check if voter is marked as invalid
        if (voter.is_invalid) {
            showMessage(loginMessage, 'Your vote has been flagged as invalid. Please contact election administrators.', 'error');
            return;
        }

        showMessage(loginMessage, 'Login successful!', 'success');

        window.votingApp.currentVoterId = voter.id;
        window.votingApp.currentVoterHasVoted = voter.has_voted;

        setTimeout(() => {
            showSection('voterDetailsSection');
            displayVoterDetails(voter);
            updateProgress(2, 'Step 2 of 4: Verify Identity');
            
            window.scrollTo(0, 0);
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showMessage(loginMessage, 'Error: ' + error.message, 'error');
    }
}

// Display voter details - Only email
function displayVoterDetails(voter) {
    document.getElementById('displayEmail').textContent = voter.email;
}

// Load candidates for all positions with mobile optimizations - OPTIMIZED VERSION
async function loadCandidates() {
    const positionsContainer = document.getElementById('positionsContainer');
    positionsContainer.innerHTML = '<div class="loading-results"><i class="fas fa-spinner fa-spin"></i><p>Loading positions and candidates...</p></div>';

    try {
        const { data: positionsWithCandidates, error } = await supabase
            .from('positions')
            .select(`
                id,
                title,
                candidates (
                    id,
                    name,
                    description,
                    picture_url,
                    position_id
                )
            `)
            .order('title');

        if (error) throw error;

        window.votingApp.positions = positionsWithCandidates || [];
        positionsContainer.innerHTML = '';

        if (positionsWithCandidates.length === 0) {
            positionsContainer.innerHTML = '<p class="message info">No positions available for voting.</p>';
            return;
        }

        for (const position of positionsWithCandidates) {
            const positionDiv = createPositionElement(position, position.candidates || []);
            positionsContainer.appendChild(positionDiv);
            
            window.votingApp.selectedCandidates[position.id] = null;
        }

        updateCompletionStatus();

    } catch (error) {
        console.error('Error loading candidates:', error);
        positionsContainer.innerHTML = '<p class="message error">Error loading voting positions. Please try again.</p>';
    }
}

// Create position element with candidates (mobile-optimized)
function createPositionElement(position, candidates) {
    const positionDiv = document.createElement('div');
    positionDiv.className = 'position-section pending';
    positionDiv.id = `position-${position.id}`;
    
    let candidatesHTML = '';
    if (candidates.length > 0) {
        candidates.forEach(candidate => {
            const candidatePicture = candidate.picture_url 
                ? `<img src="${candidate.picture_url}" alt="${candidate.name}" class="candidate-picture" loading="lazy" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiMzMjRhYjIiLz4KPGNpcmNsZSBjeD0iNDAiIGN5PSIzMCIgcj0iMTUiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yNSA2MEMyNSA1MCA0NSA1MCA1NSA2MCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPgo='">`
                : `<div class="candidate-picture" style="background: var(--violet-blue); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">${candidate.name.charAt(0)}</div>`;
            
            candidatesHTML += `
                <div class="candidate" onclick="selectCandidate('${position.id}', '${candidate.id}', this)">
                    ${candidatePicture}
                    <div class="candidate-info">
                        <h3>${candidate.name}</h3>
                        <p>${candidate.description || 'No description available'}</p>
                        <button>SELECT</button>
                    </div>
                </div>
            `;
        });
    } else {
        candidatesHTML = '<p class="message info">No candidates available for this position</p>';
    }
    
    positionDiv.innerHTML = `
        <div class="position-title">
            <span>${position.title}</span>
            <span class="position-status">Not Voted</span>
        </div>
        <div class="candidates-container">
            ${candidatesHTML}
        </div>
        <button class="skip-btn secondary-btn" onclick="skipPosition('${position.id}')">
            <i class="fas fa-forward"></i> Skip This Position
        </button>
    `;
    
    return positionDiv;
}

// Select candidate for a position with touch feedback
function selectCandidate(positionId, candidateId, element) {
    const positionDiv = document.getElementById(`position-${positionId}`);
    
    if (element && window.votingApp.isMobile) {
        element.style.transform = 'scale(0.98)';
        element.style.transition = 'transform 0.1s ease';
        setTimeout(() => {
            if (element) element.style.transform = '';
        }, 150);
    }
    
    const candidates = positionDiv.querySelectorAll('.candidate');
    candidates.forEach(candidate => {
        candidate.classList.remove('selected');
        const btn = candidate.querySelector('button');
        if (btn) {
            btn.textContent = 'SELECT';
            btn.classList.remove('voted');
        }
    });
    
    if (element) {
        const button = element.querySelector('button');
        button.textContent = 'SELECTED ✓';
        button.classList.add('voted');
        element.classList.add('selected');
    }
    
    window.votingApp.selectedCandidates[positionId] = candidateId;
    updateCompletionStatus();
}

// Skip a position
function skipPosition(positionId) {
    window.votingApp.selectedCandidates[positionId] = 'skipped';
    
    const positionDiv = document.getElementById(`position-${positionId}`);
    if (positionDiv) {
        const candidates = positionDiv.querySelectorAll('.candidate');
        candidates.forEach(candidate => {
            candidate.classList.remove('selected');
            const btn = candidate.querySelector('button');
            if (btn) {
                btn.textContent = 'SELECT';
                btn.classList.remove('voted');
            }
        });
    }
    
    updateCompletionStatus();
}

// Update completion status
function updateCompletionStatus() {
    const totalPositions = Object.keys(window.votingApp.selectedCandidates).length;
    const votedPositions = Object.values(window.votingApp.selectedCandidates).filter(
        candidateId => candidateId && candidateId !== 'skipped'
    ).length;
    
    const completionText = document.getElementById('completionText');
    const reviewButton = document.getElementById('reviewButton');
    
    if (completionText) {
        completionText.textContent = `You have voted for ${votedPositions} of ${totalPositions} positions`;
    }
    
    if (reviewButton) {
        reviewButton.disabled = votedPositions === 0;
        reviewButton.textContent = votedPositions > 0 ? 
            `Review Votes (${votedPositions}/${totalPositions})` : 
            'Review Votes';
    }
    
    for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
        updatePositionStatus(positionId, candidateId);
    }
}

// Update individual position status
function updatePositionStatus(positionId, candidateId) {
    const positionDiv = document.getElementById(`position-${positionId}`);
    if (!positionDiv) return;
    
    const statusElement = positionDiv.querySelector('.position-status');
    if (!statusElement) return;
    
    if (candidateId && candidateId !== 'skipped') {
        positionDiv.className = 'position-section voted';
        statusElement.textContent = 'Voted';
        statusElement.style.color = 'var(--forest-green)';
        statusElement.style.fontWeight = 'bold';
    } else if (candidateId === 'skipped') {
        positionDiv.className = 'position-section skipped';
        statusElement.textContent = 'Skipped';
        statusElement.style.color = 'var(--warning)';
    } else {
        positionDiv.className = 'position-section pending';
        statusElement.textContent = 'Not Voted';
        statusElement.style.color = 'var(--violet-blue)';
    }
}

// Review votes before submission with mobile optimization
function reviewVotes() {
    const reviewContainer = document.getElementById('reviewContainer');
    if (!reviewContainer) return;
    
    let reviewHTML = '<h3><i class="fas fa-clipboard-check"></i> Your Votes</h3>';
    
    for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
        const positionDiv = document.getElementById(`position-${positionId}`);
        if (positionDiv) {
            const positionTitle = positionDiv.querySelector('.position-title span').textContent;
            
            if (candidateId && candidateId !== 'skipped') {
                const candidateDiv = positionDiv.querySelector(`.candidate[onclick*="${candidateId}"]`);
                if (candidateDiv) {
                    const candidateName = candidateDiv.querySelector('h3').textContent;
                    reviewHTML += `
                        <div class="review-item">
                            <span class="review-position">${positionTitle}</span>
                            <span class="review-candidate">${candidateName}</span>
                            <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">
                                <i class="fas fa-edit"></i> Change
                            </span>
                        </div>
                    `;
                }
            } else if (candidateId === 'skipped') {
                reviewHTML += `
                    <div class="review-item">
                        <span class="review-position">${positionTitle}</span>
                        <span class="review-skipped" style="color: var(--warning);"><i class="fas fa-forward"></i> Skipped</span>
                        <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">
                            <i class="fas fa-edit"></i> Change
                        </span>
                    </div>
                `;
            } else {
                reviewHTML += `
                    <div class="review-item">
                        <span class="review-position">${positionTitle}</span>
                        <span class="review-skipped" style="color: var(--violet-blue);"><i class="fas fa-clock"></i> Not voted yet</span>
                        <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">
                            <i class="fas fa-edit"></i> Change
                        </span>
                    </div>
                `;
            }
        }
    }
    
    reviewContainer.innerHTML = reviewHTML;
    showSection('reviewSection');
    updateProgress(4, 'Step 4 of 4: Review and Submit');
    
    window.scrollTo(0, 0);
}

// Change vote for a specific position with mobile optimization
function changeVoteForPosition(positionId) {
    window.votingApp.selectedCandidates[positionId] = null;
    updatePositionStatus(positionId, null);
    updateCompletionStatus();
    goBackToVoting();
    
    setTimeout(() => {
        const positionDiv = document.getElementById(`position-${positionId}`);
        if (positionDiv) {
            positionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// Navigate back to voting section
function goBackToVoting() {
    showSection('votingSection');
    updateProgress(3, 'Step 3 of 4: Cast Your Votes');
    
    window.scrollTo(0, 0);
}

// Cast votes - Multi-position voting with mobile optimizations - OPTIMIZED VERSION
async function castVotes() {
    const votingMessage = document.getElementById('votingMessage');
    const submitButton = document.getElementById('submitVoteButton');
    
    if (window.votingApp.currentVoterHasVoted) {
        showMessage(votingMessage, 'You have already voted. You cannot vote again.', 'error');
        return;
    }
    
    if (window.votingApp.hasVotedOnThisDevice) {
        showMessage(votingMessage, 'This device has already been used to vote.', 'error');
        return;
    }
    
    showMessage(votingMessage, 'Submitting your votes...', 'info');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    try {
        const votesToInsert = [];
        let votesCast = 0;
        
        for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
            if (candidateId && candidateId !== 'skipped') {
                votesToInsert.push({
                    voter_id: window.votingApp.currentVoterId,
                    candidate_id: candidateId,
                    position_id: positionId,
                    created_at: new Date().toISOString()
                });
                votesCast++;
            }
        }
        
        if (votesToInsert.length === 0) {
            throw new Error('No votes to submit. Please select at least one candidate.');
        }
        
        const { error: votesError } = await supabase
            .from('votes')
            .insert(votesToInsert);
            
        if (votesError) throw votesError;
        
        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: true })
            .eq('id', window.votingApp.currentVoterId);
            
        if (updateError) throw updateError;
        
        localStorage.setItem('hasVotedOnThisDevice', 'true');
        window.votingApp.hasVotedOnThisDevice = true;
        window.votingApp.currentVoterHasVoted = true;
        
        showMessage(votingMessage, `Success! ${votesCast} vote(s) recorded.`, 'success');
        
        setTimeout(() => {
            showSection('completionSection');
            window.scrollTo(0, 0);
        }, 2000);
        
    } catch (error) {
        console.error('Vote submission error:', error);
        showMessage(votingMessage, 'Error submitting votes: ' + error.message, 'error');
        submitButton.disabled = false;
        submitButton.innerHTML = 'Submit Votes';
    }
}

// Utility functions with mobile optimizations
function showMessage(element, message, type) {
    if (!element) return;
    
    element.innerHTML = `<i class="fas fa-${getIconForMessageType(type)}"></i> ${message}`;
    element.className = `message ${type}`;
    
    if (type === 'success') {
        element.classList.add('upload-success');
        setTimeout(() => {
            element.classList.remove('upload-success');
        }, 2000);
    } else if (type === 'error') {
        element.classList.add('upload-error');
        setTimeout(() => {
            element.classList.remove('upload-error');
        }, 500);
    }
}

function getIconForMessageType(type) {
    const icons = {
        'error': 'exclamation-triangle',
        'success': 'check-circle',
        'info': 'info-circle',
        'warning': 'exclamation-circle'
    };
    return icons[type] || 'info-circle';
}

function showSection(sectionId) {
    document.querySelectorAll('main section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

function updateProgress(step, text) {
    const steps = document.querySelectorAll('.step');
    steps.forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });
    
    document.querySelector('.progress-text').textContent = text;
}

function showAlreadyVotedNotification() {
    const loginMessage = document.getElementById('loginMessage');
    showMessage(loginMessage, 'You have already voted.', 'error');
}

// Make functions globally available
window.handleVoterLogin = handleVoterLogin;
window.openCamera = openCamera;
window.openGallery = openGallery;
window.confirmUpload = confirmUpload;
window.cancelUpload = cancelUpload;
window.selectCandidate = selectCandidate;
window.skipPosition = skipPosition;
window.reviewVotes = reviewVotes;
window.changeVoteForPosition = changeVoteForPosition;
window.goBackToVoting = goBackToVoting;
window.castVotes = castVotes;
