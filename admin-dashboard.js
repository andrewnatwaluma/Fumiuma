// admin-dashboard.js - Complete Admin Dashboard Functionality - UPDATED FOR UMA
const SUPABASE_URL = 'https://jypuappvttmkvrxowvmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5cHVhcHB2dHRta3ZyeG93dm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNjg3NTUsImV4cCI6MjA3Nzc0NDc1NX0.-zb9RObfSaCV8MOik1AFIW_ygq3Agh2QuWky9RXcXZA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global admin state
window.adminApp = {
    currentAdmin: null,
    adminRole: null,
    selectedVoterId: null,
    sessionStartTime: null,
    realtimeSubscription: null
};

// Candidate Management State
let currentEditingCandidateId = null;

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminDashboard();
});

// Main initialization function
async function initializeAdminDashboard() {
    if (!checkAdminAuthentication()) {
        return;
    }

    await loadAdminData();
    await loadPositionsForDropdown();
    setupRealtimeUpdates();
    startSessionTimer();
    
    setupRoleBasedAccess();
}

// Setup role-based access control
function setupRoleBasedAccess() {
    const adminRole = window.adminApp.adminRole;
    
    if (adminRole !== 'superadmin') {
        document.getElementById('superAdminSection').style.display = 'none';
        document.getElementById('superAdminCandidateSection').style.display = 'none';
        document.getElementById('invalidVotesSection').style.display = 'none';
        document.getElementById('electionTimerControl').style.display = 'none';
    }
}

// Check if admin is properly authenticated
function checkAdminAuthentication() {
    const adminRole = localStorage.getItem('adminRole');
    const adminUsername = localStorage.getItem('adminUsername');
    
    if (!adminRole || !adminUsername) {
        window.location.href = 'admin-login.html';
        return false;
    }

    window.adminApp.currentAdmin = adminUsername;
    window.adminApp.adminRole = adminRole;
    window.adminApp.sessionStartTime = new Date(localStorage.getItem('adminLoginTime'));

    document.getElementById('currentAdmin').textContent = adminUsername;
    document.getElementById('adminRole').textContent = adminRole;
    document.getElementById('loginTime').textContent = `Logged in: ${window.adminApp.sessionStartTime.toLocaleString()}`;

    return true;
}

// Load all admin data
async function loadAdminData() {
    await loadAdminStats();
    await loadResults();
    await loadCandidatesForSuperAdmin();
    await loadVoterStats();
    await loadInvalidVoters();
    updateElectionTimerDisplay();
    checkDatabaseStatus();
}

// Load admin statistics
async function loadAdminStats() {
    try {
        const [
            { count: totalVoters },
            { count: votedCount },
            { count: invalidCount }
        ] = await Promise.all([
            supabase.from('voters').select('*', { count: 'exact', head: true }),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('is_invalid', true)
        ]);

        const validVotedCount = (votedCount || 0) - (invalidCount || 0);
        const turnout = totalVoters > 0 ? Math.round((validVotedCount / totalVoters) * 100) : 0;

        document.getElementById('adminStats').innerHTML = `
            <div class="stat-item">
                <i class="fas fa-users"></i>
                <span class="stat-value">${totalVoters || 0}</span>
                <span class="stat-label">Total Voters</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-vote-yea"></i>
                <span class="stat-value">${validVotedCount}</span>
                <span class="stat-label">Valid Votes</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-chart-pie"></i>
                <span class="stat-value">${turnout}%</span>
                <span class="stat-label">Turnout</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-times-circle"></i>
                <span class="stat-value">${invalidCount || 0}</span>
                <span class="stat-label">Invalid Votes</span>
            </div>
        `;

    } catch (error) {
        console.error('Error loading admin stats:', error);
        document.getElementById('adminStats').innerHTML = '<p class="error">Error loading statistics</p>';
    }
}

// Load election results (excluding invalid votes)
async function loadResults() {
    try {
        const { data: results, error } = await supabase
            .from('vote_results')
            .select('*')
            .order('position_title');

        if (error) throw error;

        const resultsContainer = document.getElementById('adminResultsContainer');
        const previewContainer = document.getElementById('resultsPreview');

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p class="info">No votes have been cast yet.</p>';
            previewContainer.innerHTML = '<p class="info">No results available</p>';
            return;
        }

        const resultsByPosition = {};
        results.forEach(result => {
            if (!resultsByPosition[result.position_title]) {
                resultsByPosition[result.position_title] = [];
            }
            resultsByPosition[result.position_title].push(result);
        });

        let resultsHTML = '';
        let previewHTML = '';

        for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
            const totalVotes = candidates.reduce((sum, cand) => sum + cand.vote_count, 0);
            
            const positionResultsHTML = `
                <div class="position-results">
                    <h3>${positionTitle}</h3>
                    ${candidates.map(candidate => {
                        const percentage = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
                        return `
                            <div class="candidate-result">
                                <span>${candidate.candidate_name}</span>
                                <strong>${percentage}%</strong>
                                <span class="vote-count">(${candidate.vote_count} votes)</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            resultsHTML += positionResultsHTML;

            const leadingCandidate = candidates.reduce((leading, current) => 
                current.vote_count > leading.vote_count ? current : leading
            );
            const leadPercentage = totalVotes > 0 ? Math.round((leadingCandidate.vote_count / totalVotes) * 100) : 0;
            
            previewHTML += `
                <div class="preview-item">
                    <strong>${positionTitle}:</strong> ${leadingCandidate.candidate_name} (${leadPercentage}%)
                </div>
            `;
        }

        resultsContainer.innerHTML = resultsHTML;
        previewContainer.innerHTML = previewHTML;

    } catch (error) {
        console.error('Error loading results:', error);
        document.getElementById('adminResultsContainer').innerHTML = '<p class="error">Error loading results</p>';
    }
}

// Load voter statistics
async function loadVoterStats() {
    try {
        const { data: stats, error } = await supabase
            .from('voter_stats')
            .select('*')
            .single();

        if (error) throw error;

        document.getElementById('voterStats').innerHTML = `
            <p>Total Voters: <strong>${stats?.total_voters || 0}</strong></p>
            <p>Valid Votes: <strong>${stats?.valid_votes || 0}</strong></p>
            <p>Invalid Votes: <strong>${stats?.invalid_votes || 0}</strong></p>
            <p>Completion Rate: <strong>${stats?.completion_rate || 0}%</strong></p>
        `;

    } catch (error) {
        console.error('Error loading voter stats:', error);
        document.getElementById('voterStats').innerHTML = '<p class="error">Error loading voter statistics</p>';
    }
}

// INVALID VOTES MANAGEMENT FUNCTIONS

// Load invalid voters list
async function loadInvalidVoters() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    try {
        const { data: voters, error } = await supabase
            .from('voters')
            .select('*')
            .eq('is_invalid', true)
            .order('name');

        if (error) throw error;

        const container = document.getElementById('invalidVotersList');
        
        if (!voters || voters.length === 0) {
            container.innerHTML = '<p class="info">No invalid votes recorded.</p>';
            return;
        }

        let html = `
            <h5>Invalid Voters (${voters.length})</h5>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>ID</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        voters.forEach(voter => {
            const idIcon = voter.id_url 
                ? `<i class="fas fa-id-card view-id" style="color: var(--forest-green); cursor: pointer;" onclick="viewId('${voter.id}', '${voter.name.replace(/'/g, "\\'")}')" title="View ID"></i>`
                : `<i class="fas fa-times-circle" style="color: var(--danger);" title="No ID"></i>`;
            
            html += `
                <tr>
                    <td>${voter.name}</td>
                    <td>${voter.email || 'N/A'}</td>
                    <td>${idIcon}</td>
                    <td>
                        <button onclick="restoreVoter('${voter.id}', '${voter.name.replace(/'/g, "\\'")}')" class="secondary-btn btn-sm">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading invalid voters:', error);
        document.getElementById('invalidVotersList').innerHTML = '<p class="error">Error loading invalid voters</p>';
    }
}

// Mark voter as invalid
async function markVoterAsInvalid(voterId, voterName) {
    if (window.adminApp.adminRole !== 'superadmin') return;

    if (!confirm(`Mark ${voterName} as invalid? This will remove their votes from the results.`)) {
        return;
    }

    try {
        const { error } = await supabase
            .from('voters')
            .update({ is_invalid: true })
            .eq('id', voterId);

        if (error) throw error;

        alert(`${voterName} has been marked as invalid. Their votes have been removed from results.`);
        
        // Refresh all data
        await loadAdminStats();
        await loadResults();
        await loadVoterStats();
        await loadInvalidVoters();
        await showVotedVoters();

    } catch (error) {
        console.error('Error marking voter as invalid:', error);
        alert('Error marking voter as invalid: ' + error.message);
    }
}

// Restore voter (remove from invalid list)
async function restoreVoter(voterId, voterName) {
    if (window.adminApp.adminRole !== 'superadmin') return;

    if (!confirm(`Restore ${voterName}? This will include their votes in the results.`)) {
        return;
    }

    try {
        const { error } = await supabase
            .from('voters')
            .update({ is_invalid: false })
            .eq('id', voterId);

        if (error) throw error;

        alert(`${voterName} has been restored. Their votes are now included in results.`);
        
        // Refresh all data
        await loadAdminStats();
        await loadResults();
        await loadVoterStats();
        await loadInvalidVoters();
        await showVotedVoters();

    } catch (error) {
        console.error('Error restoring voter:', error);
        alert('Error restoring voter: ' + error.message);
    }
}

// SUPER ADMIN FUNCTIONS

// Load candidates for superadmin vote override
async function loadCandidatesForSuperAdmin() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select('*')
            .order('name');

        if (error) throw error;

        const select = document.getElementById('superAdminCandidateSelect');
        select.innerHTML = '<option value="">Select candidate</option>';
        
        if (candidates && candidates.length > 0) {
            candidates.forEach(candidate => {
                const option = document.createElement('option');
                option.value = candidate.id;
                option.textContent = candidate.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading candidates:', error);
    }
}

// Voter lookup functionality
async function lookupVoter() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const voterName = document.getElementById('voterLookupName').value.trim();
    const resultDiv = document.getElementById('voterLookupResult');
    
    if (!voterName) {
        resultDiv.innerHTML = '<p class="message error">Please enter a voter name or email</p>';
        return;
    }

    resultDiv.innerHTML = '<p class="message info">Searching...</p>';

    try {
        const { data: voter, error } = await supabase
            .from('voters')
            .select('*')
            .or(`name.ilike.%${voterName}%,email.ilike.%${voterName}%`)
            .limit(5);

        if (error) throw error;

        if (!voter || voter.length === 0) {
            resultDiv.innerHTML = '<p class="message warning">No voters found</p>';
            return;
        }

        let resultHTML = '<div class="voter-list">';
        voter.forEach(v => {
            const invalidBadge = v.is_invalid ? '<span class="status-badge invalid" style="background: #ff4444; color: white;">Invalid</span>' : '';
            
            resultHTML += `
                <div class="voter-item">
                    <p><strong>${v.name}</strong> - ${v.email || 'N/A'} ${invalidBadge}</p>
                    <p>Status: <span class="status-badge ${v.has_voted ? 'voted' : 'not-voted'}">
                        ${v.has_voted ? 'Voted' : 'Not Voted'}
                    </span></p>
                    <div class="voter-actions">
                        <button onclick="selectVoterForAction('${v.id}', '${v.name.replace(/'/g, "\\'")}', ${v.has_voted})" 
                                class="secondary-btn btn-sm">
                            Select
                        </button>
                        ${v.has_voted && !v.is_invalid ? `
                        <button onclick="markVoterAsInvalid('${v.id}', '${v.name.replace(/'/g, "\\'")}')" 
                                class="danger-btn btn-sm">
                            Mark Invalid
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        resultHTML += '</div>';
        resultDiv.innerHTML = resultHTML;

    } catch (error) {
        console.error('Voter lookup error:', error);
        resultDiv.innerHTML = '<p class="message error">Error searching voters</p>';
    }
}

// Select voter for administrative actions
async function selectVoterForAction(voterId, voterName, hasVoted) {
    window.adminApp.selectedVoterId = voterId;
    
    document.getElementById('selectedVoterName').textContent = voterName;
    
    let currentVotesInfo = 'Not voted yet';
    try {
        const { data: votes, error } = await supabase
            .from('votes')
            .select('candidates(name), positions(title)')
            .eq('voter_id', voterId);

        if (!error && votes && votes.length > 0) {
            currentVotesInfo = votes.map(vote => 
                `${vote.positions.title}: ${vote.candidates.name}`
            ).join('; ');
        }
    } catch (error) {
        console.error('Error getting voter votes:', error);
    }

    const statusText = hasVoted ? `Voted - ${currentVotesInfo}` : 'Not voted yet';
    document.getElementById('voterVoteStatus').textContent = statusText;
    document.getElementById('voterVoteStatus').className = `status-badge ${hasVoted ? 'voted' : 'not-voted'}`;
    
    document.getElementById('voterActionSection').style.display = 'block';
    
    document.getElementById('voterActionSection').scrollIntoView({ behavior: 'smooth' });
}

// Change voter's vote (superadmin override)
async function changeVote() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const candidateId = document.getElementById('superAdminCandidateSelect').value;
    const messageElement = document.getElementById('superAdminMessage');
    
    if (!window.adminApp.selectedVoterId) {
        showAdminMessage(messageElement, 'Please select a voter first', 'error');
        return;
    }

    if (!candidateId) {
        showAdminMessage(messageElement, 'Please select a candidate', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Processing vote change...', 'info');

    try {
        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .select('position_id')
            .eq('id', candidateId)
            .single();

        if (candidateError) throw candidateError;

        const { data: position, error: positionError } = await supabase
            .from('positions')
            .select('title')
            .eq('id', candidate.position_id)
            .single();

        if (positionError) throw positionError;

        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .eq('voter_id', window.adminApp.selectedVoterId)
            .eq('position_id', candidate.position_id);

        if (deleteError && deleteError.code !== 'P0001') {
            throw deleteError;
        }

        const { error: insertError } = await supabase
            .from('votes')
            .insert([{
                voter_id: window.adminApp.selectedVoterId,
                candidate_id: candidateId,
                position_id: candidate.position_id
            }]);

        if (insertError) throw insertError;

        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: true })
            .eq('id', window.adminApp.selectedVoterId)
            .eq('has_voted', false);

        if (updateError) throw updateError;

        showAdminMessage(messageElement, `Vote for ${position.title} successfully updated! Other votes remain unchanged.`, 'success');
        
        setTimeout(() => {
            loadAdminStats();
            loadResults();
            lookupVoter();
        }, 1000);

    } catch (error) {
        console.error('Vote change error:', error);
        showAdminMessage(messageElement, 'Error: ' + error.message, 'error');
    }
}

// Show voted voters list WITH ID VIEWING
async function showVotedVoters() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    try {
        const { data: voters, error } = await supabase
            .from('voters')
            .select('*')
            .eq('has_voted', true)
            .order('name');

        if (error) throw error;

        const container = document.getElementById('votedVotersList');
        
        if (!voters || voters.length === 0) {
            container.innerHTML = '<p class="info">No voters have voted yet.</p>';
            return;
        }

        let html = `
            <h5>Voted Voters (${voters.length})</h5>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>ID</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        voters.forEach(voter => {
            const idIcon = voter.id_url 
                ? `<i class="fas fa-id-card view-id" style="color: var(--forest-green); cursor: pointer;" onclick="viewId('${voter.id}', '${voter.name.replace(/'/g, "\\'")}')" title="View ID"></i>`
                : `<i class="fas fa-times-circle" style="color: var(--danger);" title="No ID"></i>`;
            
            const statusBadge = voter.is_invalid 
                ? '<span class="status-badge invalid" style="background: #ff4444; color: white;">Invalid</span>'
                : '<span class="status-badge valid" style="background: var(--forest-green); color: white;">Valid</span>';
            
            html += `
                <tr>
                    <td>${voter.name}</td>
                    <td>${voter.email || 'N/A'}</td>
                    <td>${idIcon}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button onclick="quickSelectVoter('${voter.id}', '${voter.name.replace(/'/g, "\\'")}', true)" class="secondary-btn btn-sm">
                            <i class="fas fa-edit"></i> Override
                        </button>
                        ${!voter.is_invalid ? `
                        <button onclick="markVoterAsInvalid('${voter.id}', '${voter.name.replace(/'/g, "\\'")}')" class="danger-btn btn-sm">
                            <i class="fas fa-ban"></i> Invalidate
                        </button>
                        ` : `
                        <button onclick="restoreVoter('${voter.id}', '${voter.name.replace(/'/g, "\\'")}')" class="secondary-btn btn-sm">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                        `}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading voted voters:', error);
        document.getElementById('votedVotersList').innerHTML = '<p class="error">Error loading voted voters</p>';
    }
}

// Quick select voter from voted list
async function quickSelectVoter(voterId, voterName, hasVoted) {
    window.adminApp.selectedVoterId = voterId;
    
    document.getElementById('selectedVoterName').textContent = voterName;
    
    let currentVotesInfo = 'Not voted yet';
    try {
        const { data: votes, error } = await supabase
            .from('votes')
            .select('candidates(name), positions(title)')
            .eq('voter_id', voterId);

        if (!error && votes && votes.length > 0) {
            currentVotesInfo = votes.map(vote => 
                `${vote.positions.title}: ${vote.candidates.name}`
            ).join('; ');
        }
    } catch (error) {
        console.error('Error getting voter votes:', error);
    }

    const statusText = hasVoted ? `Voted - ${currentVotesInfo}` : 'Not voted yet';
    document.getElementById('voterVoteStatus').textContent = statusText;
    document.getElementById('voterVoteStatus').className = `status-badge ${hasVoted ? 'voted' : 'not-voted'}`;
    
    document.getElementById('voterActionSection').style.display = 'block';
    
    document.getElementById('voterActionSection').scrollIntoView({ behavior: 'smooth' });
}

// View ID function
async function viewId(voterId, voterName) {
    try {
        const { data: voter, error } = await supabase
            .from('voters')
            .select('id_url, id_uploaded_at')
            .eq('id', voterId)
            .single();

        if (error) throw error;

        if (!voter.id_url) {
            alert('No ID uploaded for this voter.');
            return;
        }

        const modalHTML = `
            <div id="idModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 10000;">
                <div style="background: white; padding: 20px; border-radius: 10px; max-width: 90%; max-height: 90%; overflow: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3>ID for ${voterName}</h3>
                        <button onclick="closeIdModal()" style="background: var(--danger); color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                    <img src="${voter.id_url}" alt="ID for ${voterName}" style="max-width: 100%; max-height: 70vh; border: 2px solid #ddd; border-radius: 5px;">
                    <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
                        Uploaded: ${voter.id_uploaded_at ? new Date(voter.id_uploaded_at).toLocaleString() : 'Unknown'}
                    </p>
                </div>
            </div>
        `;

        const existingModal = document.getElementById('idModal');
        if (existingModal) {
            existingModal.remove();
        }

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (error) {
        console.error('Error viewing ID:', error);
        alert('Error loading ID: ' + error.message);
    }
}

// Close ID modal
function closeIdModal() {
    const modal = document.getElementById('idModal');
    if (modal) {
        modal.remove();
    }
}

// ELECTION TIMER CONTROL FUNCTIONS

// Update election timer display
async function updateElectionTimerDisplay() {
    try {
        const { data: settings, error } = await supabase
            .from('election_settings')
            .select('*')
            .single();

        if (!error && settings && settings.election_end_time) {
            const endTime = new Date(settings.election_end_time);
            document.getElementById('electionEndTimeDisplay').textContent = endTime.toLocaleString();
            
            // Update the countdown in the main app
            if (window.votingApp) {
                window.votingApp.electionEndTime = endTime;
            }
        } else {
            document.getElementById('electionEndTimeDisplay').textContent = 'Not set';
        }
    } catch (error) {
        console.error('Error loading election timer:', error);
        document.getElementById('electionEndTimeDisplay').textContent = 'Error loading';
    }
}

// Update election timer
async function updateElectionTimer() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const duration = prompt("Enter election duration in hours (e.g., 24 for 24 hours):");
    
    if (!duration || isNaN(duration) || duration <= 0) {
        alert('Please enter a valid number of hours.');
        return;
    }

    const hours = parseInt(duration);
    const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);

    try {
        const { error } = await supabase
            .from('election_settings')
            .upsert({
                id: 1,
                election_end_time: endTime.toISOString(),
                updated_at: new Date().toISOString()
            });

        if (error) throw error;

        alert(`Election timer set to ${hours} hours. Voting will end at ${endTime.toLocaleString()}`);
        
        updateElectionTimerDisplay();

    } catch (error) {
        console.error('Error updating election timer:', error);
        alert('Error updating election timer: ' + error.message);
    }
}

// CANDIDATE MANAGEMENT FUNCTIONS (unchanged, but included for completeness)
async function loadPositionsForDropdown() {
    try {
        const { data: positions, error } = await supabase
            .from('positions')
            .select('*')
            .order('title');

        if (error) throw error;

        const editSelect = document.getElementById('editCandidatePosition');
        const addSelect = document.getElementById('newCandidatePosition');
        
        editSelect.innerHTML = '<option value="">Select Position</option>';
        addSelect.innerHTML = '<option value="">Select Position</option>';
        
        if (positions && positions.length > 0) {
            positions.forEach(position => {
                const option = document.createElement('option');
                option.value = position.id;
                option.textContent = position.title;
                editSelect.appendChild(option.cloneNode(true));
                addSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading positions:', error);
    }
}

// Search candidates
async function searchCandidates() {
    const searchTerm = document.getElementById('candidateSearch').value.trim();
    const resultsDiv = document.getElementById('candidateSearchResults');
    
    if (!searchTerm) {
        resultsDiv.innerHTML = '<p class="message error">Please enter a search term</p>';
        return;
    }

    resultsDiv.innerHTML = '<p class="message info">Searching...</p>';

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .ilike('name', `%${searchTerm}%`)
            .order('name')
            .limit(10);

        if (error) throw error;

        if (!candidates || candidates.length === 0) {
            resultsDiv.innerHTML = '<p class="message warning">No candidates found</p>';
            return;
        }

        let html = '<div class="search-results-list">';
        candidates.forEach(candidate => {
            html += `
                <div class="candidate-search-result">
                    <div class="candidate-info">
                        <strong>${candidate.name}</strong>
                        <span>${candidate.positions?.title || 'No position'}</span>
                        ${candidate.picture_url ? '<i class="fas fa-camera has-photo"></i>' : '<i class="fas fa-camera-slash no-photo"></i>'}
                    </div>
                    <button onclick="editCandidate('${candidate.id}')" class="secondary-btn btn-sm">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            `;
        });
        html += '</div>';

        resultsDiv.innerHTML = html;

    } catch (error) {
        console.error('Candidate search error:', error);
        resultsDiv.innerHTML = '<p class="message error">Error searching candidates</p>';
    }
}

// Edit candidate
async function editCandidate(candidateId) {
    try {
        const { data: candidate, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .eq('id', candidateId)
            .single();

        if (error) throw error;

        currentEditingCandidateId = candidateId;
        
        document.getElementById('editingCandidateName').textContent = candidate.name;
        document.getElementById('editCandidateName').value = candidate.name;
        document.getElementById('editCandidateDescription').value = candidate.description || '';
        document.getElementById('editCandidatePosition').value = candidate.position_id;
        
        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        if (candidate.picture_url) {
            photoImg.src = candidate.picture_url;
            photoImg.style.display = 'block';
            noPhotoMsg.style.display = 'none';
            removeBtn.style.display = 'block';
        } else {
            photoImg.style.display = 'none';
            noPhotoMsg.style.display = 'block';
            removeBtn.style.display = 'none';
        }
        
        document.getElementById('candidateEditForm').style.display = 'block';
        document.getElementById('candidateSearchResults').innerHTML = '';
        
        document.getElementById('candidateEditForm').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error loading candidate:', error);
        showAdminMessage(document.getElementById('candidateEditMessage'), 'Error loading candidate: ' + error.message, 'error');
    }
}

// Upload candidate photo
async function uploadCandidatePhoto() {
    const fileInput = document.getElementById('newCandidatePhoto');
    const messageElement = document.getElementById('candidateEditMessage');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showAdminMessage(messageElement, 'Please select a photo to upload', 'error');
        return;
    }

    const file = fileInput.files[0];
    const maxSize = 2 * 1024 * 1024;
    
    if (file.size > maxSize) {
        showAdminMessage(messageElement, 'File too large. Maximum size is 2MB.', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showAdminMessage(messageElement, 'Please select a valid image file.', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Uploading photo...', 'info');

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentEditingCandidateId}-${Date.now()}.${fileExt}`;
        const filePath = `candidate-photos/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('candidate-photos')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('candidate-photos')
            .getPublicUrl(filePath);

        const { error: updateError } = await supabase
            .from('candidates')
            .update({ picture_url: urlData.publicUrl })
            .eq('id', currentEditingCandidateId);

        if (updateError) throw updateError;

        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        photoImg.src = urlData.publicUrl;
        photoImg.style.display = 'block';
        noPhotoMsg.style.display = 'none';
        removeBtn.style.display = 'block';
        
        fileInput.value = '';
        
        showAdminMessage(messageElement, 'Photo uploaded successfully!', 'success');
        
        setTimeout(() => {
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Photo upload error:', error);
        showAdminMessage(messageElement, 'Error uploading photo: ' + error.message, 'error');
    }
}

// Remove candidate photo
async function removeCandidatePhoto() {
    const messageElement = document.getElementById('candidateEditMessage');
    
    if (!confirm('Are you sure you want to remove this photo?')) {
        return;
    }

    showAdminMessage(messageElement, 'Removing photo...', 'info');

    try {
        const { error: updateError } = await supabase
            .from('candidates')
            .update({ picture_url: null })
            .eq('id', currentEditingCandidateId);

        if (updateError) throw updateError;

        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        photoImg.style.display = 'none';
        noPhotoMsg.style.display = 'block';
        removeBtn.style.display = 'none';
        
        showAdminMessage(messageElement, 'Photo removed successfully!', 'success');
        
        setTimeout(() => {
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Photo removal error:', error);
        showAdminMessage(messageElement, 'Error removing photo: ' + error.message, 'error');
    }
}

// Update candidate details
async function updateCandidate() {
    const name = document.getElementById('editCandidateName').value.trim();
    const description = document.getElementById('editCandidateDescription').value.trim();
    const positionId = document.getElementById('editCandidatePosition').value;
    const messageElement = document.getElementById('candidateEditMessage');

    if (!name) {
        showAdminMessage(messageElement, 'Please enter a candidate name', 'error');
        return;
    }

    if (!positionId) {
        showAdminMessage(messageElement, 'Please select a position', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Updating candidate...', 'info');

    try {
        const { error } = await supabase
            .from('candidates')
            .update({
                name: name,
                description: description,
                position_id: positionId,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentEditingCandidateId);

        if (error) throw error;

        showAdminMessage(messageElement, 'Candidate updated successfully!', 'success');
        
        setTimeout(() => {
            searchCandidates();
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Candidate update error:', error);
        showAdminMessage(messageElement, 'Error updating candidate: ' + error.message, 'error');
    }
}

// Show add candidate form
function showAddCandidateForm() {
    document.getElementById('addCandidateForm').style.display = 'block';
    document.getElementById('candidateSearchResults').innerHTML = '';
    document.getElementById('addCandidateMessage').innerHTML = '';
    
    document.getElementById('newCandidateName').value = '';
    document.getElementById('newCandidateDescription').value = '';
    document.getElementById('newCandidatePosition').value = '';
    document.getElementById('newCandidatePhotoInput').value = '';
    
    document.getElementById('addCandidateForm').scrollIntoView({ behavior: 'smooth' });
}

// Create new candidate
async function createCandidate() {
    const name = document.getElementById('newCandidateName').value.trim();
    const description = document.getElementById('newCandidateDescription').value.trim();
    const positionId = document.getElementById('newCandidatePosition').value;
    const photoFile = document.getElementById('newCandidatePhotoInput').files[0];
    const messageElement = document.getElementById('addCandidateMessage');

    if (!name) {
        showAdminMessage(messageElement, 'Please enter a candidate name', 'error');
        return;
    }

    if (!positionId) {
        showAdminMessage(messageElement, 'Please select a position', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Creating candidate...', 'info');

    try {
        const { data: candidate, error: createError } = await supabase
            .from('candidates')
            .insert([{
                name: name,
                description: description,
                position_id: positionId,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (createError) throw createError;

        let pictureUrl = null;

        if (photoFile) {
            const maxSize = 2 * 1024 * 1024;
            if (photoFile.size > maxSize) {
                throw new Error('Photo file too large. Maximum size is 2MB.');
            }

            if (!photoFile.type.startsWith('image/')) {
                throw new Error('Please select a valid image file.');
            }

            const fileExt = photoFile.name.split('.').pop();
            const fileName = `${candidate.id}-${Date.now()}.${fileExt}`;
            const filePath = `candidate-photos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('candidate-photos')
                .upload(filePath, photoFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('candidate-photos')
                .getPublicUrl(filePath);

            pictureUrl = urlData.publicUrl;

            const { error: updateError } = await supabase
                .from('candidates')
                .update({ picture_url: pictureUrl })
                .eq('id', candidate.id);

            if (updateError) throw updateError;
        }

        showAdminMessage(messageElement, 'Candidate created successfully!', 'success');
        
        setTimeout(() => {
            document.getElementById('addCandidateForm').style.display = 'none';
            document.getElementById('newCandidateName').value = '';
            document.getElementById('newCandidateDescription').value = '';
            document.getElementById('newCandidatePosition').value = '';
            document.getElementById('newCandidatePhotoInput').value = '';
            
            loadAllCandidates();
        }, 1500);

    } catch (error) {
        console.error('Candidate creation error:', error);
        showAdminMessage(messageElement, 'Error creating candidate: ' + error.message, 'error');
    }
}

// Load all candidates
async function loadAllCandidates() {
    const listDiv = document.getElementById('allCandidatesList');
    listDiv.innerHTML = '<p class="message info">Loading candidates...</p>';

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .order('name');

        if (error) throw error;

        if (!candidates || candidates.length === 0) {
            listDiv.innerHTML = '<p class="message warning">No candidates found</p>';
            return;
        }

        let html = `
            <div class="candidates-table">
                <div class="table-header">
                    <span>Photo</span>
                    <span>Name</span>
                    <span>Position</span>
                    <span>Actions</span>
                </div>
        `;

        candidates.forEach(candidate => {
            html += `
                <div class="table-row">
                    <span class="photo-cell">
                        ${candidate.picture_url 
                            ? `<img src="${candidate.picture_url}" alt="${candidate.name}" class="candidate-thumb">`
                            : '<i class="fas fa-user-circle no-photo"></i>'
                        }
                    </span>
                    <span class="name-cell">${candidate.name}</span>
                    <span class="position-cell">${candidate.positions?.title || 'N/A'}</span>
                    <span class="actions-cell">
                        <button onclick="editCandidate('${candidate.id}')" class="secondary-btn btn-sm">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteCandidate('${candidate.id}')" class="danger-btn btn-sm">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </span>
                </div>
            `;
        });

        html += '</div>';
        listDiv.innerHTML = html;

    } catch (error) {
        console.error('Error loading candidates:', error);
        listDiv.innerHTML = '<p class="message error">Error loading candidates</p>';
    }
}

// Delete candidate
async function deleteCandidate(candidateId) {
    if (!confirm('WARNING: This will permanently delete the candidate and all their votes. This action cannot be undone. Are you sure?')) {
        return;
    }

    try {
        const { data: votes, error: votesError } = await supabase
            .from('votes')
            .select('id')
            .eq('candidate_id', candidateId)
            .limit(1);

        if (votesError) throw votesError;

        if (votes && votes.length > 0) {
            if (!confirm('This candidate has votes recorded. Deleting them will also delete all their votes. Continue?')) {
                return;
            }
        }

        const { error: deleteError } = await supabase
            .from('candidates')
            .delete()
            .eq('id', candidateId);

        if (deleteError) throw deleteError;

        alert('Candidate deleted successfully!');
        loadAllCandidates();

    } catch (error) {
        console.error('Error deleting candidate:', error);
        alert('Error deleting candidate: ' + error.message);
    }
}

// Cancel edit
function cancelEdit() {
    document.getElementById('candidateEditForm').style.display = 'none';
    currentEditingCandidateId = null;
    document.getElementById('candidateEditMessage').innerHTML = '';
}

// Cancel add
function cancelAdd() {
    document.getElementById('addCandidateForm').style.display = 'none';
    document.getElementById('addCandidateMessage').innerHTML = '';
}

// SYSTEM MANAGEMENT FUNCTIONS

// Restart election (superadmin only)
async function restartElection() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const password = prompt("Enter superadmin password to confirm election restart:");
    if (password !== "super123") {
        alert("Invalid password. Operation cancelled.");
        return;
    }

    if (!confirm("WARNING: This will delete ALL votes and reset voter status. This action cannot be undone. Are you absolutely sure?")) {
        return;
    }

    try {
        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteError) throw deleteError;

        const { error: updateError } = await supabase
            .from('voters')
            .update({ 
                has_voted: false,
                is_invalid: false 
            })
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (updateError) throw updateError;

        localStorage.removeItem('hasVotedOnThisDevice');

        alert("Election successfully restarted. All votes have been cleared.");
        location.reload();

    } catch (error) {
        console.error('Election restart error:', error);
        alert('Error restarting election: ' + error.message);
    }
}

// Export results
async function exportResults() {
    try {
        const { data: results, error } = await supabase
            .from('vote_results')
            .select('*');

        if (error) throw error;

        const csvContent = convertToCSV(results);
        downloadCSV(csvContent, 'uma-election-results.csv');
        
        alert('Results exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting results: ' + error.message);
    }
}

// Export full data
async function exportFullData() {
    try {
        const tempMessage = document.createElement('div');
        tempMessage.className = 'message info';
        tempMessage.textContent = 'Preparing full data export (this may take a moment)...';
        document.querySelector('main').insertBefore(tempMessage, document.querySelector('main').firstChild);

        async function getAllData(tableName, batchSize = 1000) {
            let allData = [];
            let from = 0;
            let hasMore = true;
            
            while (hasMore) {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .range(from, from + batchSize - 1);
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    allData = allData.concat(data);
                    from += batchSize;
                    
                    tempMessage.textContent = `Loading ${tableName}: ${allData.length} records...`;
                } else {
                    hasMore = false;
                }
            }
            
            return allData;
        }

        const [
            voters,
            votes,
            candidates,
            positions,
            results
        ] = await Promise.all([
            getAllData('voters'),
            getAllData('votes'), 
            getAllData('candidates'),
            getAllData('positions'),
            getAllData('vote_results')
        ]);

        let csvContent = "UMA ELECTION FULL DATA EXPORT\n";
        csvContent += `Generated: ${new Date().toLocaleString()}\n`;
        csvContent += `Exported by: ${window.adminApp.currentAdmin} (${window.adminApp.adminRole})\n`;
        csvContent += `Total Voters: ${voters.length}\n`;
        csvContent += `Total Votes: ${votes.length}\n\n`;
        
        csvContent += "VOTERS DATA\n";
        csvContent += `Total Records: ${voters.length}\n`;
        if (voters.length > 0) {
            csvContent += convertToCSV(voters);
        } else {
            csvContent += "No voter data\n";
        }
        csvContent += "\n\n";
        
        csvContent += "VOTES DATA\n";
        csvContent += `Total Records: ${votes.length}\n`;
        if (votes.length > 0) {
            csvContent += convertToCSV(votes);
        } else {
            csvContent += "No vote data\n";
        }
        csvContent += "\n\n";
        
        csvContent += "CANDIDATES DATA\n";
        csvContent += `Total Records: ${candidates.length}\n`;
        if (candidates.length > 0) {
            csvContent += convertToCSV(candidates);
        } else {
            csvContent += "No candidate data\n";
        }
        csvContent += "\n\n";
        
        csvContent += "POSITIONS DATA\n";
        csvContent += `Total Records: ${positions.length}\n`;
        if (positions.length > 0) {
            csvContent += convertToCSV(positions);
        } else {
            csvContent += "No position data\n";
        }
        csvContent += "\n\n";
        
        csvContent += "ELECTION RESULTS\n";
        csvContent += `Total Records: ${results.length}\n`;
        if (results.length > 0) {
            csvContent += convertToCSV(results);
        } else {
            csvContent += "No results data\n";
        }

        downloadCSV(csvContent, `uma-election-full-data-${new Date().toISOString().split('T')[0]}.csv`);
        
        tempMessage.remove();
        alert(`Full data exported successfully!\n\nSummary:\n- Voters: ${voters.length}\n- Votes: ${votes.length}\n- Candidates: ${candidates.length}\n- Positions: ${positions.length}`);
        
    } catch (error) {
        console.error('Full data export error:', error);
        alert('Error exporting full data: ' + error.message);
    }
}

// UTILITY FUNCTIONS

function showSection(sectionId) {
    document.querySelectorAll('main section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

function showAdminMessage(element, message, type) {
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
    }
}

function refreshAllData() {
    loadAdminData();
    const tempDiv = document.createElement('div');
    tempDiv.className = 'message success';
    tempDiv.textContent = 'Data refreshed successfully!';
    tempDiv.style.margin = '10px 0';
    document.querySelector('main').insertBefore(tempDiv, document.querySelector('main').firstChild);
    setTimeout(() => tempDiv.remove(), 3000);
}

function refreshResults() {
    loadResults();
}

function checkDatabaseStatus() {
    document.getElementById('databaseStatus').innerHTML = `
        <p class="success">Database connection: <strong>Active</strong></p>
        <p>Last checked: ${new Date().toLocaleTimeString()}</p>
    `;
}

function setupRealtimeUpdates() {
    window.adminApp.realtimeSubscription = supabase
        .channel('votes-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'votes' },
            () => {
                loadAdminStats();
                loadResults();
            }
        )
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'voters' },
            () => {
                loadAdminStats();
                loadResults();
                loadVoterStats();
                loadInvalidVoters();
            }
        )
        .subscribe();
}

function startSessionTimer() {
    const timerElement = document.getElementById('sessionTimer');
    setInterval(() => {
        const now = new Date();
        const diff = now - window.adminApp.sessionStartTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        timerElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }, 1000);
}

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            return `"${value !== null && value !== undefined ? value.toString().replace(/"/g, '""') : ''}"`;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Logout function
function logout() {
    if (window.adminApp.realtimeSubscription) {
        window.adminApp.realtimeSubscription.unsubscribe();
    }
    
    localStorage.removeItem('adminRole');
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('adminLoginTime');
    
    window.location.href = 'admin-login.html';
}

// Make functions globally available
window.showSection = showSection;
window.lookupVoter = lookupVoter;
window.selectVoterForAction = selectVoterForAction;
window.changeVote = changeVote;
window.showVotedVoters = showVotedVoters;
window.quickSelectVoter = quickSelectVoter;
window.viewId = viewId;
window.closeIdModal = closeIdModal;
window.restartElection = restartElection;
window.exportResults = exportResults;
window.exportFullData = exportFullData;
window.refreshAllData = refreshAllData;
window.refreshResults = refreshResults;
window.logout = logout;

// Invalid Votes Functions
window.markVoterAsInvalid = markVoterAsInvalid;
window.restoreVoter = restoreVoter;
window.loadInvalidVoters = loadInvalidVoters;

// Election Timer Functions
window.updateElectionTimer = updateElectionTimer;

// Candidate Management Functions
window.searchCandidates = searchCandidates;
window.editCandidate = editCandidate;
window.uploadCandidatePhoto = uploadCandidatePhoto;
window.removeCandidatePhoto = removeCandidatePhoto;
window.updateCandidate = updateCandidate;
window.showAddCandidateForm = showAddCandidateForm;
window.createCandidate = createCandidate;
window.loadAllCandidates = loadAllCandidates;
window.deleteCandidate = deleteCandidate;
window.cancelEdit = cancelEdit;
window.cancelAdd = cancelAdd;
