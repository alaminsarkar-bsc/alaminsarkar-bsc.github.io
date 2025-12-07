// modules/AdminModeration.js
class AdminModeration {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.stats = {
            totalUsers: 0,
            activeUsers: 0,
            suspendedUsers: 0,
            totalPrayers: 0,
            activePrayers: 0,
            hiddenPrayers: 0,
            totalComments: 0,
            reportedContent: 0
        };
    }

    async initialize() {
        await this.loadStats();
        await this.setupEventListeners();
        await this.loadPendingReports();
        this.setupRealtimeUpdates();
    }

    async loadStats() {
        try {
            // Users stats
            const { count: totalUsers } = await supabaseClient
                .from('users')
                .select('*', { count: 'exact', head: true });

            const { count: activeUsers } = await supabaseClient
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            const { count: suspendedUsers } = await supabaseClient
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'SUSPENDED');

            // Prayers stats
            const { count: totalPrayers } = await supabaseClient
                .from('prayers')
                .select('*', { count: 'exact', head: true });

            const { count: activePrayers } = await supabaseClient
                .from('prayers')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            const { count: hiddenPrayers } = await supabaseClient
                .from('prayers')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'hidden');

            // Comments stats
            const { count: totalComments } = await supabaseClient
                .from('comments')
                .select('*', { count: 'exact', head: true });

            // Reports stats
            const { count: reportedContent } = await supabaseClient
                .from('content_reports')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'PENDING');

            this.stats = {
                totalUsers: totalUsers || 0,
                activeUsers: activeUsers || 0,
                suspendedUsers: suspendedUsers || 0,
                totalPrayers: totalPrayers || 0,
                activePrayers: activePrayers || 0,
                hiddenPrayers: hiddenPrayers || 0,
                totalComments: totalComments || 0,
                reportedContent: reportedContent || 0
            };

            this.renderStats();
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    renderStats() {
        const statsContainer = document.getElementById('adminStats');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-info">
                    <div class="stat-number">${this.stats.totalUsers}</div>
                    <div class="stat-label">মোট ব্যবহারকারী</div>
                    <div class="stat-sub">সক্রিয়: ${this.stats.activeUsers} | নিষিদ্ধ: ${this.stats.suspendedUsers}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📝</div>
                <div class="stat-info">
                    <div class="stat-number">${this.stats.totalPrayers}</div>
                    <div class="stat-label">মোট দোয়া</div>
                    <div class="stat-sub">সক্রিয়: ${this.stats.activePrayers} | লুকানো: ${this.stats.hiddenPrayers}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">💬</div>
                <div class="stat-info">
                    <div class="stat-number">${this.stats.totalComments}</div>
                    <div class="stat-label">মোট কমেন্ট</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🚩</div>
                <div class="stat-info">
                    <div class="stat-number">${this.stats.reportedContent}</div>
                    <div class="stat-label">রিপোর্ট কন্টেন্ট</div>
                    <div class="stat-sub">রিভিউ প্রয়োজন</div>
                </div>
            </div>
        `;
    }

    async loadPendingReports(page = 1) {
        try {
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;

            const { data, error } = await supabaseClient
                .from('content_reports')
                .select(`
                    *,
                    prayers:content_id(*, users!author_uid(display_name, email)),
                    comments:content_id(*, users!author_uid(display_name, email))
                `)
                .eq('status', 'PENDING')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: true })
                .range(from, to);

            if (error) {
                throw error;
            }

            this.renderReports(data || []);
            this.setupReportActions();
            
        } catch (error) {
            console.error('Error loading pending reports:', error);
            this.showError('রিপোর্ট লোড করতে সমস্যা হয়েছে');
        }
    }

    renderReports(reports) {
        const container = document.getElementById('reportsContainer');
        if (!container) return;

        if (reports.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <div class="no-data-icon">✅</div>
                    <h3>কোনো পেন্ডিং রিপোর্ট নেই</h3>
                    <p>সকল রিপোর্ট রিজল্ভ করা হয়েছে</p>
                </div>
            `;
            return;
        }

        container.innerHTML = reports.map(report => {
            const content = report.prayers || report.comments;
            const contentType = report.prayers ? 'prayer' : 'comment';
            const author = content?.users || {};
            
            return `
                <div class="report-card" data-report-id="${report.id}" data-content-id="${report.content_id}" data-content-type="${contentType}">
                    <div class="report-header">
                        <div class="report-meta">
                            <span class="report-category ${report.priority.toLowerCase()}">${this.getCategoryName(report.category)}</span>
                            <span class="report-priority ${report.priority.toLowerCase()}">${report.priority}</span>
                            <span class="report-time">${this.formatTimeAgo(report.created_at)}</span>
                        </div>
                        <div class="report-actions">
                            <button class="btn btn-sm btn-view" data-action="view-content">কন্টেন্ট দেখুন</button>
                        </div>
                    </div>
                    
                    <div class="report-content">
                        <div class="content-preview">
                            <strong>লেখক:</strong> ${author.display_name || 'অজানা'}
                            ${contentType === 'prayer' ? 
                                `<br><strong>শিরোনাম:</strong> ${content?.title || 'N/A'}` : 
                                ''
                            }
                            <br><strong>কন্টেন্ট:</strong> 
                            <div class="content-text">${this.truncateText(contentType === 'prayer' ? content?.details : content?.text, 150)}</div>
                        </div>
                        
                        ${report.description ? `
                            <div class="report-description">
                                <strong>রিপোর্টার বিবরণ:</strong> ${report.description}
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="report-footer">
                        <div class="action-buttons">
                            <button class="btn btn-success btn-sm" data-action="approve">
                                <i class="fas fa-check"></i> অ্যাপ্রুভ
                            </button>
                            <button class="btn btn-warning btn-sm" data-action="hide">
                                <i class="fas fa-eye-slash"></i> লুকান
                            </button>
                            <button class="btn btn-danger btn-sm" data-action="delete">
                                <i class="fas fa-trash"></i> ডিলিট
                            </button>
                            <button class="btn btn-info btn-sm" data-action="view-user">
                                <i class="fas fa-user"></i> ইউজার
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupReportActions() {
        document.querySelectorAll('.report-card').forEach(card => {
            const reportId = card.dataset.reportId;
            const contentId = card.dataset.contentId;
            const contentType = card.dataset.contentType;

            card.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;

                    switch (action) {
                        case 'view-content':
                            await this.viewContent(contentId, contentType);
                            break;
                        case 'approve':
                            await this.approveContent(reportId, contentId, contentType);
                            break;
                        case 'hide':
                            await this.hideContent(reportId, contentId, contentType);
                            break;
                        case 'delete':
                            await this.deleteContent(reportId, contentId, contentType);
                            break;
                        case 'view-user':
                            await this.viewUser(contentId, contentType);
                            break;
                    }
                });
            });
        });
    }

    async viewContent(contentId, contentType) {
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { data, error } = await supabaseClient
                .from(table)
                .select('*')
                .eq('id', contentId)
                .single();

            if (error) throw error;

            this.showContentModal(data, contentType);
            
        } catch (error) {
            console.error('Error viewing content:', error);
            this.showError('কন্টেন্ট লোড করতে সমস্যা হয়েছে');
        }
    }

    showContentModal(content, contentType) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>${contentType === 'prayer' ? 'দোয়া ডিটেইলস' : 'কমেন্ট ডিটেইলস'}</h2>
                    <span class="close-btn">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="content-details">
                        ${contentType === 'prayer' ? `
                            <p><strong>শিরোনাম:</strong> ${content.title}</p>
                            <p><strong>বিস্তারিত:</strong></p>
                            <div class="content-text">${content.details}</div>
                        ` : `
                            <p><strong>কমেন্ট:</strong></p>
                            <div class="content-text">${content.text}</div>
                        `}
                        <p><strong>স্ট্যাটাস:</strong> ${content.status}</p>
                        <p><strong>তৈরির সময়:</strong> ${new Date(content.created_at).toLocaleString('bn-BD')}</p>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('.close-btn').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        document.body.appendChild(modal);
    }

    async approveContent(reportId, contentId, contentType) {
        if (!confirm('আপনি কি এই কন্টেন্ট অ্যাপ্রুভ করতে চান?')) return;

        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            
            // কন্টেন্ট অ্যাপ্রুভ করুন
            const { error: contentError } = await supabaseClient
                .from(table)
                .update({ 
                    status: 'active',
                    moderation_status: 'APPROVED',
                    moderated_at: new Date().toISOString()
                })
                .eq('id', contentId);

            if (contentError) throw contentError;

            // রিপোর্ট রিজল্ভ করুন
            const { error: reportError } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    action_taken: 'APPROVED'
                })
                .eq('id', reportId);

            if (reportError) throw reportError;

            this.showSuccess('কন্টেন্ট সফলভাবে অ্যাপ্রুভ করা হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
            
        } catch (error) {
            console.error('Error approving content:', error);
            this.showError('কন্টেন্ট অ্যাপ্রুভ করতে সমস্যা হয়েছে');
        }
    }

    async hideContent(reportId, contentId, contentType) {
        if (!confirm('আপনি কি এই কন্টেন্ট লুকাতে চান?')) return;

        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            
            // কন্টেন্ট হাইড করুন
            const { error: contentError } = await supabaseClient
                .from(table)
                .update({ 
                    status: 'hidden',
                    moderation_status: 'HIDDEN',
                    moderated_at: new Date().toISOString()
                })
                .eq('id', contentId);

            if (contentError) throw contentError;

            // রিপোর্ট রিজল্ভ করুন
            const { error: reportError } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    action_taken: 'HIDDEN'
                })
                .eq('id', reportId);

            if (reportError) throw reportError;

            this.showSuccess('কন্টেন্ট সফলভাবে লুকানো হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
            
        } catch (error) {
            console.error('Error hiding content:', error);
            this.showError('কন্টেন্ট লুকাতে সমস্যা হয়েছে');
        }
    }

    async deleteContent(reportId, contentId, contentType) {
        if (!confirm('আপনি কি এই কন্টেন্ট সম্পূর্ণ ডিলিট করতে চান? এই কাজটি undo করা যাবে না।')) return;

        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            
            // কন্টেন্ট ডিলিট করুন
            const { error: contentError } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', contentId);

            if (contentError) throw contentError;

            // রিপোর্ট রিজল্ভ করুন
            const { error: reportError } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    action_taken: 'DELETED'
                })
                .eq('id', reportId);

            if (reportError) throw reportError;

            this.showSuccess('কন্টেন্ট সফলভাবে ডিলিট করা হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
            
        } catch (error) {
            console.error('Error deleting content:', error);
            this.showError('কন্টেন্ট ডিলিট করতে সমস্যা হয়েছে');
        }
    }

    async viewUser(contentId, contentType) {
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { data: content, error } = await supabaseClient
                .from(table)
                .select('author_uid')
                .eq('id', contentId)
                .single();

            if (error || !content) {
                throw new Error('Content not found');
            }

            // ইউজার প্রোফাইল পেজে redirect করুন
            window.open(`/profile.html?id=${content.author_uid}`, '_blank');
            
        } catch (error) {
            console.error('Error viewing user:', error);
            this.showError('ইউজার লোড করতে সমস্যা হয়েছে');
        }
    }

    setupEventListeners() {
        // ট্যাব সুইচিং
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // রিফ্রেশ বাটন
        const refreshBtn = document.getElementById('refreshReports');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadPendingReports();
                this.loadStats();
            });
        }

        // সার্চ ফাংশনালিটি
        const searchInput = document.getElementById('adminSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchReports(e.target.value);
            });
        }
    }

    switchTab(tabName) {
        // সব ট্যাব হাইড করুন
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // সব ট্যাব বাটন ডি-এক্টিভেট করুন
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // সিলেক্টেড ট্যাব শো করুন
        const selectedTab = document.getElementById(`${tabName}Tab`);
        const selectedContent = document.getElementById(`${tabName}Content`);

        if (selectedTab && selectedContent) {
            selectedTab.classList.add('active');
            selectedContent.classList.add('active');
        }

        // ট্যাব-specific কন্টেন্ট লোড করুন
        switch (tabName) {
            case 'reports':
                this.loadPendingReports();
                break;
            case 'users':
                this.loadUsers();
                break;
            case 'content':
                this.loadAllContent();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    async loadUsers() {
        // ইউজার ম্যানেজমেন্ট ট্যাব ইম্প্লিমেন্ট করুন
        console.log('Loading users...');
    }

    async loadAllContent() {
        // সকল কন্টেন্ট ভিউ ইম্প্লিমেন্ট করুন
        console.log('Loading all content...');
    }

    async loadSettings() {
        // মডারেশন সেটিংস ইম্প্লিমেন্ট করুন
        console.log('Loading settings...');
    }

    searchReports(query) {
        const reports = document.querySelectorAll('.report-card');
        reports.forEach(report => {
            const text = report.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                report.style.display = 'block';
            } else {
                report.style.display = 'none';
            }
        });
    }

    setupRealtimeUpdates() {
        // রিয়েল-টাইম আপডেটের জন্য সাবস্ক্রিপশন
        supabaseClient
            .channel('admin-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'content_reports'
                },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        this.loadStats();
                        this.loadPendingReports();
                    }
                }
            )
            .subscribe();
    }

    // হেল্পার ফাংশন
    getCategoryName(category) {
        const categories = {
            'SPAM': 'স্প্যাম',
            'HARASSMENT': 'উৎপীড়ন',
            'HATE_SPEECH': 'ঘৃণামূলক বক্তব্য',
            'INAPPROPRIATE': 'অনুপযুক্ত',
            'FALSE_INFORMATION': 'ভুল তথ্য',
            'COPYRIGHT': 'কপিরাইট',
            'OTHER': 'অন্যান্য'
        };
        return categories[category] || category;
    }

    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'এইমাত্র';
        if (diffMins < 60) return `${diffMins} মিনিট আগে`;
        if (diffHours < 24) return `${diffHours} ঘন্টা আগে`;
        return `${diffDays} দিন আগে`;
    }

    truncateText(text, maxLength) {
        if (!text) return 'কোনো কন্টেন্ট নেই';
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        notification.querySelector('.notification-close').onclick = () => {
            notification.remove();
        };

        document.body.appendChild(notification);

        // অটো রিমুভ after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminModeration;
}