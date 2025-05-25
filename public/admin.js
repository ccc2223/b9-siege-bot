class AdminManager {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.users = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
    }

    setupEventListeners() {
        // Admin tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Post selector for admin conditions editing
        document.getElementById('editPostSelect').addEventListener('change', () => this.loadConditionsForm());
        
        // Admin controls
        document.getElementById('assignUserBtn').addEventListener('click', () => this.assignUserToPost());
        document.getElementById('removeHolderBtn').addEventListener('click', () => this.removeHolderFromPost());
        
        // Import conditions controls
        document.getElementById('previewImportBtn').addEventListener('click', () => this.previewImport());
        document.getElementById('executeImportBtn').addEventListener('click', () => this.executeImport());
        document.getElementById('clearImportBtn').addEventListener('click', () => this.clearImportText());
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/me');
            const data = await response.json();
            
            if (data.authenticated && ['admin', 'owner'].includes(data.user.userLevel)) {
                this.currentUser = data.user;
                this.showAdminInterface();
                this.loadInitialData();
            } else {
                this.showAccessDenied();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.showAccessDenied();
        }
    }

    showAdminInterface() {
        // Update header
        const authSection = document.getElementById('authSection');
        authSection.innerHTML = `
            <div class="user-info">
                <span>${this.currentUser.username}</span>
                <span class="user-level ${this.currentUser.userLevel}">${this.currentUser.userLevel}</span>
            </div>
        `;
        
        // Show admin content
        document.getElementById('adminContent').style.display = 'block';
        document.getElementById('accessDenied').style.display = 'none';
    }

    showAccessDenied() {
        document.getElementById('adminContent').style.display = 'none';
        document.getElementById('accessDenied').style.display = 'block';
    }

    loadInitialData() {
        this.loadApplications();
        this.loadPostSelectOptions();
        this.loadUsers();
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');

        // Load content if needed
        if (tabName === 'applications') {
            this.loadApplications();
        } else if (tabName === 'conditions') {
            this.loadConditionsForm();
        } else if (tabName === 'importConditions') {
            // Import conditions tab doesn't need special loading
            // The form is static and ready to use
        } else if (tabName === 'manageAssets') {
            this.loadAssets();
        } else if (tabName === 'users') {
            this.loadUsers();
        } else if (tabName === 'postManagement') {
            this.loadPostManagementData();
        }
    }

    async loadApplications() {
        try {
            const response = await fetch('/api/admin/applications');
            const applications = await response.json();
            this.renderApplications(applications);
        } catch (error) {
            this.showError('Error loading applications: ' + error.message);
        }
    }

    renderApplications(applications) {
        const container = document.getElementById('applicationsList');
        
        if (applications.length === 0) {
            container.innerHTML = '<p>No pending applications</p>';
            return;
        }

        container.innerHTML = applications.map(app => `
            <div class="application-item">
                <div class="application-header">
                    <strong>Post ${app.box_id} - ${app.username}</strong>
                    <small>${new Date(app.created_at).toLocaleString()}</small>
                </div>
                <div class="application-conditions">
                    <strong>Selected conditions:</strong> ${JSON.parse(app.conditions_met).join(', ')}
                </div>
                <div class="application-actions">
                    <button class="btn-accept" onclick="adminManager.acceptApplication(${app.id})">Accept</button>
                    <button class="btn-reject" onclick="adminManager.rejectApplication(${app.id})">Reject</button>
                </div>
            </div>
        `).join('');
    }

    async acceptApplication(applicationId) {
        try {
            const response = await fetch(`/api/admin/applications/${applicationId}/accept`, {
                method: 'POST'
            });

            if (response.ok) {
                this.loadApplications();
                this.showSuccess('Application accepted');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to accept application');
            }
        } catch (error) {
            this.showError('Error accepting application: ' + error.message);
        }
    }

    async rejectApplication(applicationId) {
        try {
            const response = await fetch(`/api/admin/applications/${applicationId}/reject`, {
                method: 'POST'
            });

            if (response.ok) {
                this.loadApplications();
                this.showSuccess('Application rejected');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to reject application');
            }
        } catch (error) {
            this.showError('Error rejecting application: ' + error.message);
        }
    }

    loadPostSelectOptions() {
        const selects = ['editPostSelect', 'assignPostSelect', 'removePostSelect'];
        
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Select a post...</option>';
                
                for (let i = 1; i <= 18; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Post ${i}`;
                    select.appendChild(option);
                }
            }
        });
    }

    async loadConditionsForm() {
        const postId = document.getElementById('editPostSelect').value;
        const form = document.getElementById('conditionsForm');

        if (!postId) {
            form.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/boxes/${postId}`);
            const post = await response.json();

            form.innerHTML = `
                <div class="condition-input">
                    <label for="editCond1">Condition 1:</label>
                    <input type="text" id="editCond1" value="${post.condition1}">
                </div>
                <div class="condition-input">
                    <label for="editCond2">Condition 2:</label>
                    <input type="text" id="editCond2" value="${post.condition2}">
                </div>
                <div class="condition-input">
                    <label for="editCond3">Condition 3:</label>
                    <input type="text" id="editCond3" value="${post.condition3}">
                </div>
                <div class="condition-input">
                    <label for="editCond4">Condition 4:</label>
                    <input type="text" id="editCond4" value="${post.condition4}">
                </div>
                <button class="save-conditions" onclick="adminManager.saveConditions(${postId})">Save Conditions</button>
            `;
        } catch (error) {
            this.showError('Error loading post conditions: ' + error.message);
        }
    }

    async saveConditions(postId) {
        const conditions = {
            condition1: document.getElementById('editCond1').value.trim(),
            condition2: document.getElementById('editCond2').value.trim(),
            condition3: document.getElementById('editCond3').value.trim(),
            condition4: document.getElementById('editCond4').value.trim()
        };

        if (!conditions.condition1 || !conditions.condition2 || !conditions.condition3 || !conditions.condition4) {
            this.showError('All conditions must be filled');
            return;
        }

        try {
            const response = await fetch(`/api/admin/boxes/${postId}/conditions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conditions)
            });

            if (response.ok) {
                this.showSuccess('Conditions updated successfully');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to update conditions');
            }
        } catch (error) {
            this.showError('Error updating conditions: ' + error.message);
        }
    }

    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users');
            const users = await response.json();
            this.users = users;
            this.renderUsers(users);
            this.updateUserSelects();
        } catch (error) {
            this.showError('Error loading users: ' + error.message);
        }
    }

    renderUsers(users) {
        const container = document.getElementById('usersList');
        
        if (users.length === 0) {
            container.innerHTML = '<p>No users found</p>';
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-info-admin">
                    <strong>${user.username}</strong>
                    <div class="user-meta">
                        ID: ${user.id} | Joined: ${new Date(user.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div class="user-actions">
                    ${this.currentUser.userLevel === 'owner' ? `
                        <button class="level-btn user ${user.user_level === 'user' ? 'current' : ''}" 
                                onclick="adminManager.updateUserLevel(${user.id}, 'user')"
                                ${user.user_level === 'user' ? 'disabled' : ''}>User</button>
                        <button class="level-btn admin ${user.user_level === 'admin' ? 'current' : ''}" 
                                onclick="adminManager.updateUserLevel(${user.id}, 'admin')"
                                ${user.user_level === 'admin' ? 'disabled' : ''}>Admin</button>
                        <button class="level-btn owner ${user.user_level === 'owner' ? 'current' : ''}" 
                                onclick="adminManager.updateUserLevel(${user.id}, 'owner')"
                                ${user.user_level === 'owner' ? 'disabled' : ''}>Owner</button>
                    ` : `
                        <span class="user-level ${user.user_level}">${user.user_level}</span>
                    `}
                </div>
            </div>
        `).join('');
    }

    async updateUserLevel(userId, newLevel) {
        if (!confirm(`Are you sure you want to change this user's level to ${newLevel}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/owner/users/${userId}/level`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userLevel: newLevel })
            });

            if (response.ok) {
                this.loadUsers();
                this.showSuccess(`User level updated to ${newLevel}`);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to update user level');
            }
        } catch (error) {
            this.showError('Error updating user level: ' + error.message);
        }
    }

    updateUserSelects() {
        const select = document.getElementById('assignUserSelect');
        if (select) {
            select.innerHTML = '<option value="">Select User...</option>';
            
            this.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.username} (${user.user_level})`;
                select.appendChild(option);
            });
        }
    }

    loadPostManagementData() {
        this.updateUserSelects();
    }

    async assignUserToPost() {
        const postId = document.getElementById('assignPostSelect').value;
        const userId = document.getElementById('assignUserSelect').value;
        
        if (!postId || !userId) {
            this.showError('Please select both a post and a user');
            return;
        }
        
        // For now, assign with all conditions - could be made configurable
        const conditions = ['condition1', 'condition2', 'condition3', 'condition4'];
        
        try {
            const response = await fetch(`/api/admin/boxes/${postId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: parseInt(userId), conditions })
            });
            
            if (response.ok) {
                this.showSuccess('User assigned to post successfully');
                // Reset selects
                document.getElementById('assignPostSelect').value = '';
                document.getElementById('assignUserSelect').value = '';
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to assign user');
            }
        } catch (error) {
            this.showError('Error assigning user: ' + error.message);
        }
    }
    
    async removeHolderFromPost() {
        const postId = document.getElementById('removePostSelect').value;
        
        if (!postId) {
            this.showError('Please select a post');
            return;
        }
        
        if (!confirm(`Are you sure you want to remove the holder from Post ${postId}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/boxes/${postId}/remove`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showSuccess('Holder removed from post successfully');
                document.getElementById('removePostSelect').value = '';
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to remove holder');
            }
        } catch (error) {
            this.showError('Error removing holder: ' + error.message);
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        const existing = document.querySelector('.message');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.textContent = message;
        
        document.body.appendChild(div);
        
        setTimeout(() => {
            div.remove();
        }, 5000);

        // Add CSS for message positioning
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.right = '20px';
        div.style.zIndex = '10000';
        div.style.padding = '15px 20px';
        div.style.borderRadius = '4px';
        div.style.maxWidth = '300px';
        div.style.wordWrap = 'break-word';
        
        if (type === 'error') {
            div.style.backgroundColor = '#f8d7da';
            div.style.color = '#721c24';
            div.style.border = '1px solid #f5c6cb';
        } else {
            div.style.backgroundColor = '#d4edda';
            div.style.color = '#155724';
            div.style.border = '1px solid #c3e6cb';
        }
    }

    // Import Conditions Methods
    clearImportText() {
        document.getElementById('conditionsImportText').value = '';
        this.hideImportPreview();
        this.hideImportErrors();
        document.getElementById('executeImportBtn').disabled = true;
    }

    hideImportPreview() {
        document.getElementById('importPreview').style.display = 'none';
    }

    hideImportErrors() {
        document.getElementById('importErrors').style.display = 'none';
    }

    showImportPreview(changes) {
        const previewDiv = document.getElementById('importPreview');
        const contentDiv = document.getElementById('previewContent');
        
        contentDiv.innerHTML = changes.map(change => `
            <div class="preview-item">
                <strong>Post ${change.postId}:</strong>
                <ul>
                    <li>Condition 1: ${change.condition1}</li>
                    <li>Condition 2: ${change.condition2}</li>
                    <li>Condition 3: ${change.condition3}</li>
                    <li>Condition 4: None of the above/Unsure (unchanged)</li>
                </ul>
            </div>
        `).join('');
        
        previewDiv.style.display = 'block';
    }

    showImportErrors(errors) {
        const errorsDiv = document.getElementById('importErrors');
        const contentDiv = document.getElementById('errorContent');
        
        contentDiv.innerHTML = errors.map(error => `<div class="error-item">• ${error}</div>`).join('');
        errorsDiv.style.display = 'block';
    }

    parseImportText(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        const posts = [];
        const errors = [];
        
        let currentPost = null;
        let conditionCount = 0;
        
        lines.forEach((line, index) => {
            if (line.toLowerCase().startsWith('post ')) {
                // Save previous post if complete
                if (currentPost && conditionCount === 3) {
                    posts.push(currentPost);
                } else if (currentPost) {
                    errors.push(`Post ${currentPost.postId}: Expected 3 conditions, got ${conditionCount}`);
                }
                
                // Start new post
                const postMatch = line.match(/^post\s+(\d+)$/i);
                if (postMatch) {
                    const postId = parseInt(postMatch[1]);
                    if (postId >= 1 && postId <= 18) {
                        currentPost = { postId, conditions: [] };
                        conditionCount = 0;
                    } else {
                        errors.push(`Invalid post number: ${postId} (must be 1-18)`);
                        currentPost = null;
                    }
                } else {
                    errors.push(`Invalid post format on line ${index + 1}: "${line}"`);
                    currentPost = null;
                }
            } else if (currentPost && conditionCount < 3) {
                // Add condition to current post
                currentPost.conditions.push(line);
                conditionCount++;
            } else if (currentPost && conditionCount >= 3) {
                errors.push(`Post ${currentPost.postId}: Too many conditions (expected 3)`);
            } else {
                errors.push(`Unexpected line ${index + 1}: "${line}"`);
            }
        });
        
        // Save final post if complete
        if (currentPost && conditionCount === 3) {
            posts.push(currentPost);
        } else if (currentPost) {
            errors.push(`Post ${currentPost.postId}: Expected 3 conditions, got ${conditionCount}`);
        }
        
        // Convert to expected format
        const changes = posts.map(post => ({
            postId: post.postId,
            condition1: post.conditions[0],
            condition2: post.conditions[1],
            condition3: post.conditions[2]
        }));
        
        return { changes, errors };
    }

    previewImport() {
        const text = document.getElementById('conditionsImportText').value.trim();
        
        if (!text) {
            this.showError('Please enter text to import');
            return;
        }
        
        const { changes, errors } = this.parseImportText(text);
        
        this.hideImportPreview();
        this.hideImportErrors();
        
        if (errors.length > 0) {
            this.showImportErrors(errors);
            document.getElementById('executeImportBtn').disabled = true;
            return;
        }
        
        if (changes.length === 0) {
            this.showError('No valid posts found in the text');
            document.getElementById('executeImportBtn').disabled = true;
            return;
        }
        
        this.showImportPreview(changes);
        document.getElementById('executeImportBtn').disabled = false;
    }

    async executeImport() {
        const text = document.getElementById('conditionsImportText').value.trim();
        const { changes, errors } = this.parseImportText(text);
        
        if (errors.length > 0 || changes.length === 0) {
            this.showError('Cannot import: Please fix errors first');
            return;
        }
        
        try {
            const response = await fetch('/api/admin/boxes/bulk-import-conditions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changes })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showImportSuccess(result.changes);
                this.clearImportText();
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to import conditions');
            }
        } catch (error) {
            this.showError('Error importing conditions: ' + error.message);
        }
    }

    showImportSuccess(changes) {
        const modal = document.getElementById('successModal');
        const content = document.getElementById('successContent');
        
        content.innerHTML = `
            <p><strong>Successfully updated ${changes.length} post(s):</strong></p>
            ${changes.map(change => `
                <div class="success-item">
                    <strong>Post ${change.postId}</strong>
                    <ul>
                        <li>Condition 1: ${change.condition1}</li>
                        <li>Condition 2: ${change.condition2}</li>
                        <li>Condition 3: ${change.condition3}</li>
                        <li>Condition 4: None of the above/Unsure (unchanged)</li>
                    </ul>
                </div>
            `).join('')}
        `;
        
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    hideSuccessModal() {
        const modal = document.getElementById('successModal');
        modal.classList.remove('show');
        modal.style.display = 'none';
    }

    // === ASSET MANAGEMENT METHODS ===

    async loadAssets() {
        try {
            const response = await fetch('/api/assets');
            const assets = await response.json();
            this.renderAssets(assets);
        } catch (error) {
            this.showError('Error loading assets: ' + error.message);
        }
    }

    renderAssets(assets) {
        const container = document.getElementById('assetsList');
        
        if (assets.length === 0) {
            container.innerHTML = '<p>No assets found</p>';
            return;
        }

        // Group assets by category
        const assetsByCategory = this.groupAssetsByCategory(assets);
        
        container.innerHTML = Object.keys(assetsByCategory).map(category => `
            <div class="asset-category-admin">
                <h4 class="category-title">${category}</h4>
                ${assetsByCategory[category].map(asset => this.renderAssetManagementItem(asset)).join('')}
            </div>
        `).join('');
    }

    groupAssetsByCategory(assets) {
        return assets.reduce((groups, asset) => {
            const category = asset.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(asset);
            return groups;
        }, {});
    }

    renderAssetManagementItem(asset) {
        const statusDisplay = asset.status || 'available';
        const statusClass = statusDisplay === 'available' ? 'available' : statusDisplay;
        
        return `
            <div class="asset-item">
                <div class="asset-item-info">
                    <div class="asset-item-name">${asset.name}</div>
                    <div class="asset-item-category">${asset.category}</div>
                </div>
                <div class="asset-item-status">
                    <span class="current-status ${statusClass}">${statusDisplay}</span>
                    <div class="asset-actions">
                        <select id="assetStatus_${asset.id}">
                            <option value="">Available</option>
                            <option value="repair" ${asset.status === 'repair' ? 'selected' : ''}>Repair</option>
                            <option value="upgrade" ${asset.status === 'upgrade' ? 'selected' : ''}>Upgrade</option>
                        </select>
                        <button class="btn-update-asset" onclick="adminManager.updateAssetStatus(${asset.id})">Update</button>
                        <button class="btn-clear-asset" onclick="adminManager.clearAssetStatus(${asset.id})">Clear</button>
                    </div>
                </div>
            </div>
        `;
    }

    async updateAssetStatus(assetId) {
        const selectElement = document.getElementById(`assetStatus_${assetId}`);
        const newStatus = selectElement.value || null;
        
        try {
            const response = await fetch(`/api/admin/assets/${assetId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (response.ok) {
                this.loadAssets();
                this.showSuccess(`Asset status updated successfully`);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to update asset status');
            }
        } catch (error) {
            this.showError('Error updating asset status: ' + error.message);
        }
    }

    async clearAssetStatus(assetId) {
        try {
            const response = await fetch(`/api/admin/assets/${assetId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: null })
            });
            
            if (response.ok) {
                this.loadAssets();
                this.showSuccess('Asset status cleared successfully');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to clear asset status');
            }
        } catch (error) {
            this.showError('Error clearing asset status: ' + error.message);
        }
    }
}

// Initialize the admin application
const adminManager = new AdminManager();