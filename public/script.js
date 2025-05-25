class PostManager {
    constructor() {
        this.currentUser = null;
        this.posts = [];
        this.currentAction = null;
        this.currentPostId = null;
        this.discordStatus = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
        this.handleUrlParams();
    }

    setupEventListeners() {
        // Auth buttons
        document.getElementById('showLogin').addEventListener('click', () => this.showAuthModal('login'));
        document.getElementById('showSignup').addEventListener('click', () => this.showAuthModal('signup'));
        document.getElementById('confirmAuth').addEventListener('click', () => this.handleAuth());
        document.getElementById('cancelAuth').addEventListener('click', () => this.hideAuthModal());

        // Discord buttons
        document.getElementById('linkDiscordBtn').addEventListener('click', () => this.linkDiscordAccount());
        document.getElementById('cancelDiscordLink').addEventListener('click', () => this.hideDiscordModal());
        
        // Discord banner close
        document.getElementById('closeBanner').addEventListener('click', () => this.hideDiscordBanner());

        // Admin
        document.getElementById('adminBtn').addEventListener('click', () => this.goToAdminPanel());

        // Admin tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Post actions modal
        document.getElementById('confirmPostAction').addEventListener('click', () => this.executePostAction());
        document.getElementById('cancelPostAction').addEventListener('click', () => this.hidePostModal());

        // Post selector for admin conditions editing
        document.getElementById('editPostSelect').addEventListener('change', () => this.loadConditionsForm());
        
        // Admin controls
        document.getElementById('assignUserBtn').addEventListener('click', () => this.assignUserToPost());
        document.getElementById('removeHolderBtn').addEventListener('click', () => this.removeHolderFromPost());
    }

    handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Handle Discord OAuth2 results
        if (urlParams.has('success') && urlParams.get('success') === 'discord_linked') {
            const discordUsername = urlParams.get('discord');
            this.showSuccess(`✅ Discord account linked successfully! Welcome ${discordUsername}`);
            this.showDiscordBanner();
        } else if (urlParams.has('error')) {
            const error = urlParams.get('error');
            const discordUsername = urlParams.get('discord');
            
            switch (error) {
                case 'login_required':
                    this.showError('❌ Please log in to your account first before linking Discord');
                    break;
                case 'already_linked':
                    this.showError(`⚠️ Your Discord account is already linked as ${discordUsername}`);
                    break;
                case 'discord_already_linked':
                    this.showError('❌ This Discord account is already linked to another user');
                    break;
                case 'oauth_denied':
                    this.showError('❌ Discord authorization was canceled');
                    break;
                case 'link_failed':
                    this.showError('❌ Failed to link Discord account. Please try again.');
                    break;
                default:
                    this.showError('❌ Discord linking error: ' + error);
            }
        }
        
        // Clean up URL
        if (urlParams.has('success') || urlParams.has('error')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/me');
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                this.showAuthenticatedState();
                this.loadPosts();
                this.checkDiscordStatus();
            } else {
                this.showUnauthenticatedState();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.showUnauthenticatedState();
        }
    }

    async checkDiscordStatus() {
        console.log('🔍 Checking Discord status...');
        try {
            const response = await fetch('/auth/discord/status');
            console.log('📡 Discord status response:', response.status, response.statusText);
            
            if (response.ok) {
                this.discordStatus = await response.json();
                console.log('✅ Discord status received:', this.discordStatus);
                this.updateDiscordSection();
                
                // Show banner if Discord is linked and user hasn't seen it yet
                if (this.discordStatus.isLinked && !localStorage.getItem('discord_banner_seen')) {
                    this.showDiscordBanner();
                }
            } else {
                console.warn('⚠️ Discord status endpoint error:', response.status);
                // Still show Discord section even if status check fails
                this.discordStatus = { isLinked: false };
                this.updateDiscordSection();
            }
        } catch (error) {
            console.error('❌ Error checking Discord status:', error);
            // Still show Discord section even if status check fails
            this.discordStatus = { isLinked: false };
            this.updateDiscordSection();
        }
    }

    updateDiscordSection() {
        console.log('🔧 Updating Discord section...', {
            currentUser: !!this.currentUser,
            discordStatus: this.discordStatus
        });
        
        const discordSection = document.getElementById('discordSection');
        const discordStatus = document.getElementById('discordStatus');
        
        if (!discordSection) {
            console.error('❌ Discord section element not found!');
            return;
        }
        
        if (!discordStatus) {
            console.error('❌ Discord status element not found!');
            return;
        }
        
        if (!this.currentUser) {
            console.log('👤 No current user, hiding Discord section');
            discordSection.style.display = 'none';
            return;
        }
        
        console.log('✅ Showing Discord section');
        discordSection.style.display = 'block';
        
        if (this.discordStatus && this.discordStatus.isLinked) {
            console.log('🔗 Discord is linked:', this.discordStatus.discordUsername);
            discordStatus.innerHTML = `
                <div class="discord-linked">
                    <span class="discord-icon">🤖</span>
                    <span class="discord-info">
                        Discord: ${this.discordStatus.discordUsername}
                        <button class="discord-unlink-btn" onclick="postManager.unlinkDiscord()">Unlink</button>
                    </span>
                </div>
            `;
        } else {
            console.log('🔗 Discord not linked, showing link button');
            discordStatus.innerHTML = `
                <div class="discord-unlinked">
                    <button class="discord-link-btn" onclick="postManager.showDiscordModal()">
                        🤖 Link Discord Account
                    </button>
                </div>
            `;
        }
    }

    showDiscordModal() {
        document.getElementById('discordModal').classList.add('show');
    }

    hideDiscordModal() {
        document.getElementById('discordModal').classList.remove('show');
    }

    linkDiscordAccount() {
        this.hideDiscordModal();
        window.location.href = '/auth/discord';
    }

    async unlinkDiscord() {
        if (!confirm('Are you sure you want to unlink your Discord account?')) {
            return;
        }
        
        try {
            const response = await fetch('/auth/discord/unlink', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                this.discordStatus = { isLinked: false };
                this.updateDiscordSection();
                this.hideDiscordBanner();
                this.showSuccess('✅ Discord account unlinked successfully');
            } else {
                const error = await response.json();
                this.showError('❌ Failed to unlink Discord account: ' + error.message);
            }
        } catch (error) {
            this.showError('❌ Error unlinking Discord account: ' + error.message);
        }
    }

    showDiscordBanner() {
        const banner = document.getElementById('discordInfoBanner');
        banner.style.display = 'block';
    }

    hideDiscordBanner() {
        const banner = document.getElementById('discordInfoBanner');
        banner.style.display = 'none';
        localStorage.setItem('discord_banner_seen', 'true');
    }

    showAuthenticatedState() {
        console.log('🔐 Showing authenticated state for user:', this.currentUser);
        
        // Hide auth prompt, show posts
        document.getElementById('authPrompt').style.display = 'none';
        document.getElementById('postsSection').style.display = 'block';
        
        // Update header
        const authSection = document.getElementById('authSection');
        authSection.innerHTML = `
            <div class="user-info">
                <span>Welcome, ${this.currentUser.username}</span>
                <span class="user-level ${this.currentUser.userLevel}">${this.currentUser.userLevel}</span>
                <button class="logout-btn" onclick="postManager.logout()">Logout</button>
            </div>
        `;
        
        // Show upgrade & repair button for all logged in users
        document.getElementById('upgradeRepairBtn').style.display = 'inline-block';
        
        // Show admin button if user is admin or owner
        if (['admin', 'owner'].includes(this.currentUser.userLevel)) {
            document.getElementById('adminBtn').style.display = 'block';
        }
        
        // Force Discord section to show (debugging)
        console.log('🔧 Ensuring Discord section is visible...');
        const discordSection = document.getElementById('discordSection');
        if (discordSection) {
            discordSection.style.display = 'block';
        }
    }

    showUnauthenticatedState() {
        // Show auth prompt, hide posts
        document.getElementById('authPrompt').style.display = 'flex';
        document.getElementById('postsSection').style.display = 'none';
        
        // Update header
        const authSection = document.getElementById('authSection');
        authSection.innerHTML = '<span>Not signed in</span>';
        
        // Hide Discord section
        document.getElementById('discordSection').style.display = 'none';
        
        // Hide buttons
        document.getElementById('upgradeRepairBtn').style.display = 'none';
        document.getElementById('adminBtn').style.display = 'none';
    }

    showAuthModal(type) {
        const modal = document.getElementById('authModal');
        const title = document.getElementById('authModalTitle');
        const content = document.getElementById('authModalContent');
        
        this.currentAuthType = type;
        
        if (type === 'login') {
            title.textContent = 'Sign In';
            content.innerHTML = `
                <div class="auth-form">
                    <div class="form-group">
                        <label for="authUsername">Username:</label>
                        <input type="text" id="authUsername" required>
                    </div>
                    <div class="form-group">
                        <label for="authPassword">Password:</label>
                        <input type="password" id="authPassword" required>
                    </div>
                    <div class="switch-auth">
                        Don't have an account? <button onclick="postManager.showAuthModal('signup')">Sign up</button>
                    </div>
                </div>
            `;
        } else {
            title.textContent = 'Create Account';
            content.innerHTML = `
                <div class="auth-form">
                    <div class="form-group">
                        <label for="authUsername">Username:</label>
                        <input type="text" id="authUsername" required>
                    </div>
                    <div class="form-group">
                        <label for="authPassword">Password:</label>
                        <input type="password" id="authPassword" required>
                    </div>
                    <div class="admin-invite-section">
                        <div class="form-group">
                            <label for="adminInviteCode">Admin Invite Code (optional):</label>
                            <input type="password" id="adminInviteCode" placeholder="Leave blank for regular account">
                        </div>
                    </div>
                    <div class="switch-auth">
                        Already have an account? <button onclick="postManager.showAuthModal('login')">Sign in</button>
                    </div>
                </div>
            `;
        }
        
        modal.classList.add('show');
        document.getElementById('authUsername').focus();
    }

    hideAuthModal() {
        document.getElementById('authModal').classList.remove('show');
    }

    async handleAuth() {
        const username = document.getElementById('authUsername').value.trim();
        const password = document.getElementById('authPassword').value;
        const adminInviteCode = document.getElementById('adminInviteCode')?.value || '';
        
        if (!username || !password) {
            this.showError('Please fill in all required fields');
            return;
        }
        
        try {
            const endpoint = this.currentAuthType === 'login' ? '/api/auth/login' : '/api/auth/signup';
            const payload = { username, password };
            
            if (this.currentAuthType === 'signup' && adminInviteCode) {
                payload.adminInviteCode = adminInviteCode;
            }
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentUser = data.user;
                this.hideAuthModal();
                this.showAuthenticatedState();
                this.loadPosts();
                this.checkDiscordStatus();
                this.showSuccess(`Welcome ${this.currentAuthType === 'login' ? 'back' : 'to BB99 Siege War'}, ${data.user.username}!`);
            } else {
                this.showError(data.error || 'Authentication failed');
            }
        } catch (error) {
            this.showError('Error during authentication: ' + error.message);
        }
    }
    
    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            this.currentUser = null;
            this.discordStatus = null;
            this.showUnauthenticatedState();
            this.hideDiscordBanner();
            this.showSuccess('Logged out successfully');
        } catch (error) {
            this.showError('Error logging out: ' + error.message);
        }
    }

    goToAdminPanel() {
        // Open admin panel in new tab/window
        window.open('/admin', '_blank');
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
        } else if (tabName === 'discord') {
            this.loadDiscordAdminInfo();
        }
    }

    loadDiscordAdminInfo() {
        const statsContainer = document.getElementById('discordStats');
        if (statsContainer) {
            // For now, show basic info - could be expanded with real Discord metrics
            statsContainer.innerHTML = `
                <div class="discord-stat">
                    <strong>Status:</strong> ${this.discordStatus && this.discordStatus.isLinked ? 'Integrated' : 'Available'}
                </div>
                <div class="discord-stat">
                    <strong>Bot Commands:</strong> 5 available
                </div>
                <div class="discord-stat">
                    <strong>Your Account:</strong> ${this.discordStatus && this.discordStatus.isLinked ? 'Linked (' + this.discordStatus.discordUsername + ')' : 'Not linked'}
                </div>
            `;
        }
    }

    async loadPosts() {
        try {
            const response = await fetch('/api/boxes');
            if (!response.ok) {
                if (response.status === 503) {
                    // Database not ready, retry in 1 second
                    setTimeout(() => this.loadPosts(), 1000);
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            this.posts = await response.json();
            this.renderPosts();
        } catch (error) {
            this.showError('Error loading posts: ' + error.message);
            // Retry loading posts after a delay
            setTimeout(() => this.loadPosts(), 2000);
        }
    }

    renderPosts() {
        const container = document.getElementById('posts-container');
        container.innerHTML = '';

        this.posts.forEach(post => {
            const postElement = this.createPostElement(post);
            container.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'post';
        
        // Get the conditions that the current holder has selected
        const holderConditions = this.getHolderConditions(post);
        
        div.innerHTML = `
            <div class="post-header">
                <div class="post-number">Post ${post.id}</div>
            </div>
            
            <div class="post-status ${this.getPostStatusClass(post)}">
                ${this.getPostStatusText(post)}
            </div>

            <div class="post-conditions">
                <h4>Conditions:</h4>
                <div class="condition-display">
                    <span class="condition-checkmark">${holderConditions.includes('condition1') ? '✓' : ''}</span>
                    <span class="condition-text">${post.condition1}</span>
                </div>
                <div class="condition-display">
                    <span class="condition-checkmark">${holderConditions.includes('condition2') ? '✓' : ''}</span>
                    <span class="condition-text">${post.condition2}</span>
                </div>
                <div class="condition-display">
                    <span class="condition-checkmark">${holderConditions.includes('condition3') ? '✓' : ''}</span>
                    <span class="condition-text">${post.condition3}</span>
                </div>
                <div class="condition-display">
                    <span class="condition-checkmark">${holderConditions.includes('condition4') ? '✓' : ''}</span>
                    <span class="condition-text">${post.condition4}</span>
                </div>
            </div>

            <div class="post-actions">
                ${this.getPostActions(post)}
            </div>
        `;

        return div;
    }

    getHolderConditions(post) {
        // Parse the holder's conditions from the database
        if (post.holder_conditions) {
            try {
                return JSON.parse(post.holder_conditions);
            } catch (e) {
                console.error('Error parsing holder conditions:', e);
                return [];
            }
        }
        return [];
    }

    getPostStatusClass(post) {
        if (post.current_holder) return 'held';
        if (post.pending_applications) return 'applied';
        return 'empty';
    }

    getPostStatusText(post) {
        let status = '';
        
        if (post.current_holder) {
            status += `<div class="current-holder">Held by: ${post.current_holder}</div>`;
        }
        
        if (post.pending_applications) {
            const applications = post.pending_applications.split(',').filter(app => app);
            if (applications.length > 0) {
                status += `<div class="pending-applications">Applications: ${applications.join(', ')}</div>`;
            }
        }
        
        if (!post.current_holder && !post.pending_applications) {
            status = 'Available';
        }
        
        return status;
    }

    getPostActions(post) {
        if (!this.currentUser) return '<p>Please sign in to interact with posts</p>';

        const isCurrentHolder = post.current_holder === this.currentUser.username;
        const hasApplication = post.pending_applications && 
                              post.pending_applications.split(',').includes(this.currentUser.username);

        let actions = '';

        if (isCurrentHolder) {
            actions += `<button class="action-leave" onclick="postManager.initiateAction('leave', ${post.id})">Leave Post</button>`;
        } else if (hasApplication) {
            actions += `<button class="action-withdraw" onclick="postManager.initiateAction('withdraw', ${post.id})">Withdraw Application</button>`;
        } else {
            if (!post.current_holder) {
                actions += `<button class="action-hold" onclick="postManager.initiateAction('hold', ${post.id})">Hold Post</button>`;
            }
            actions += `<button class="action-apply" onclick="postManager.initiateAction('apply', ${post.id})">Apply for Post</button>`;
        }

        return actions;
    }

    initiateAction(action, postId) {
        if (!this.currentUser) {
            this.showError('Please sign in first');
            return;
        }

        this.currentAction = action;
        this.currentPostId = postId;

        if (action === 'leave' || action === 'withdraw') {
            this.executePostAction();
        } else {
            this.showPostModal(action, postId);
        }
    }

    showPostModal(action, postId) {
        const post = this.posts.find(p => p.id === postId);
        const modal = document.getElementById('postModal');
        const title = document.getElementById('postModalTitle');
        const content = document.getElementById('postModalContent');

        title.textContent = `${action === 'hold' ? 'Hold' : 'Apply for'} Post ${postId}`;
        
        content.innerHTML = `
            <p>Select at least one condition that applies:</p>
            <div class="post-conditions">
                <div class="condition">
                    <input type="checkbox" id="modal_cond1" value="condition1">
                    <label for="modal_cond1">${post.condition1}</label>
                </div>
                <div class="condition">
                    <input type="checkbox" id="modal_cond2" value="condition2">
                    <label for="modal_cond2">${post.condition2}</label>
                </div>
                <div class="condition">
                    <input type="checkbox" id="modal_cond3" value="condition3">
                    <label for="modal_cond3">${post.condition3}</label>
                </div>
                <div class="condition">
                    <input type="checkbox" id="modal_cond4" value="condition4">
                    <label for="modal_cond4">${post.condition4}</label>
                </div>
            </div>
        `;

        modal.classList.add('show');
    }

    hidePostModal() {
        document.getElementById('postModal').classList.remove('show');
        this.currentAction = null;
        this.currentPostId = null;
    }

    async executePostAction() {
        if (!this.currentAction || !this.currentPostId) return;

        try {
            let requestData = {};
            let url = `/api/boxes/${this.currentPostId}/${this.currentAction}`;

            if (this.currentAction === 'hold' || this.currentAction === 'apply') {
                const selectedConditions = Array.from(document.querySelectorAll('#postModal input[type="checkbox"]:checked'))
                    .map(cb => cb.value);

                if (selectedConditions.length === 0) {
                    this.showError('Please select at least one condition');
                    return;
                }

                requestData.conditions = selectedConditions;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (response.ok) {
                this.hidePostModal();
                this.loadPosts();
                this.showSuccess(`Action completed successfully`);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Action failed');
            }
        } catch (error) {
            this.showError('Error executing action: ' + error.message);
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
                    <strong>Box ${app.box_id} - ${app.username}</strong>
                    <small>${new Date(app.created_at).toLocaleString()}</small>
                </div>
                <div class="application-conditions">
                    <strong>Selected conditions:</strong> ${JSON.parse(app.conditions_met).join(', ')}
                </div>
                <div class="application-actions">
                    <button class="btn-accept" onclick="postManager.acceptApplication(${app.id})">Accept</button>
                    <button class="btn-reject" onclick="postManager.rejectApplication(${app.id})">Reject</button>
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
                this.loadPosts();
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

    // Admin functions for the separate admin page
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
                this.loadPosts();
                this.showSuccess('User assigned to post successfully');
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
        
        try {
            const response = await fetch(`/api/admin/boxes/${postId}/remove`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.loadPosts();
                this.showSuccess('Holder removed from post successfully');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to remove holder');
            }
        } catch (error) {
            this.showError('Error removing holder: ' + error.message);
        }
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
                <button class="save-conditions" onclick="postManager.saveConditions(${postId})">Save Conditions</button>
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
                this.loadPosts();
                this.showSuccess('Conditions updated successfully');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to update conditions');
            }
        } catch (error) {
            this.showError('Error updating conditions: ' + error.message);
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    // Debug function to manually trigger Discord section
    debugDiscord() {
        console.log('🔧 Debug Discord section manually...');
        console.log('Current user:', this.currentUser);
        console.log('Discord status:', this.discordStatus);
        
        // Force update
        this.discordStatus = { isLinked: false };
        this.updateDiscordSection();
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
}

// Initialize the application
const postManager = new PostManager();

// Handle Enter key in modal inputs
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        if (document.getElementById('authModal').classList.contains('show')) {
            postManager.handleAuth();
        } else if (document.getElementById('postModal').classList.contains('show')) {
            postManager.executePostAction();
        }
    }
});

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        if (e.target.id === 'authModal') {
            postManager.hideAuthModal();
        }
        if (e.target.id === 'postModal') {
            postManager.hidePostModal();
        }
        if (e.target.id === 'discordModal') {
            postManager.hideDiscordModal();
        }
        e.target.classList.remove('show');
    }
});
