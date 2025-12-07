
// admin.js - SECURITY UPDATE: Role-based Access Control
// সম্পূর্ণ ভার্সন: আগের সব ফিচার + ডোনেশন সার্চ, ডিলিট ও প্রোগ্রেস ট্র্যাকিং আপডেট যুক্ত

const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

class AdminPanel {
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
            reportedContent: 0,
            scannedContent: 0,
            approvalRate: 0,
            totalReports: 0
        };
        this.keywords = [];
        this.settings = {};
    }

    /* -----------------------
       Initialization
       ----------------------- */
    async initialize() {
        await this.checkAdminAccess();
        await this.loadSettings();
        await this.loadStats();
        await this.loadAdvancedAnalytics();
        await this.setupEventListeners();
        await this.loadPendingReports();
        await this.loadKeywords();
        
        // ডিফল্ট ডোনেশন লোড (Settings Tab)
        await this.loadPaymentNumbersInput();
        
        this.setupRealtimeUpdates();
        this.hideLoading();
    }

    async checkAdminAccess() {
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            if (!session || !session.user) {
                this.redirectToLogin();
                return;
            }
            currentUser = session.user;

            // Check role from DB
            const { data: userProfile, error: profileError } = await supabaseClient
                .from('users')
                .select('role')
                .eq('id', currentUser.id)
                .single();

            if (profileError || !userProfile || userProfile.role !== 'admin') {
                this.showError('আপনার Admin এক্সেস নেই!');
                setTimeout(() => window.location.href = '/index.html', 3000);
                return;
            }

            const el = document.getElementById('adminUserName');
            if (el) el.textContent = currentUser.email || currentUser.user_email || 'Admin';
            this.showSuccess('এডমিন প্যানেলে স্বাগতম!');
        } catch (error) {
            console.error('Admin access check error:', error);
            this.showError('অ্যাক্সেস চেক করতে সমস্যা: ' + (error?.message || error));
            this.redirectToLogin();
        }
    }

    redirectToLogin() {
        window.location.href = '/index.html';
    }

    /* -----------------------
       Stats Logic
       ----------------------- */
    async loadStats() {
        try {
            this.showLoading('স্ট্যাটস লোড হচ্ছে...');
            const [{ count: totalUsers, error: usersError }, { data: suspendedUsers, error: suspendedError }, { count: totalPrayers, error: prayersError }, { count: activePrayers, error: activeError }, { count: hiddenPrayers, error: hiddenError }, { count: totalComments, error: commentsError }, { count: reportedContent, error: reportsError }, { count: totalReports, error: totalReportsError }] = await Promise.all([
                supabaseClient.from('users').select('*', { count: 'exact', head: true }),
                supabaseClient.from('users').select('id').eq('status', 'SUSPENDED'),
                supabaseClient.from('prayers').select('*', { count: 'exact', head: true }),
                supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
                supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).eq('status', 'hidden'),
                supabaseClient.from('comments').select('*', { count: 'exact', head: true }),
                supabaseClient.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
                supabaseClient.from('content_reports').select('*', { count: 'exact', head: true })
            ]);

            if (usersError) throw usersError;
            
            const resolvedReports = (totalReports || 0) - (reportedContent || 0);
            const approvalRate = (totalReports > 0) ? ((resolvedReports / totalReports) * 100).toFixed(0) : 0;

            this.stats = {
                totalUsers: totalUsers || 0,
                activeUsers: (totalUsers || 0) - (suspendedUsers?.length || 0),
                suspendedUsers: suspendedUsers?.length || 0,
                totalPrayers: totalPrayers || 0,
                activePrayers: activePrayers || 0,
                hiddenPrayers: hiddenPrayers || 0,
                totalComments: totalComments || 0,
                reportedContent: reportedContent || 0,
                scannedContent: (totalPrayers || 0) + (totalComments || 0),
                approvalRate: approvalRate,
                totalReports: totalReports || 0
            };

            this.renderStats();
            this.updateReportsBadge();
        } catch (error) {
            console.error('Error loading stats:', error);
            this.showError('স্ট্যাটস লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
        } finally {
            this.hideLoading();
        }
    }
    
    /* -----------------------
       Advanced Analytics
       ----------------------- */
    async loadAdvancedAnalytics() {
        this.showLoading('অ্যানালিটিক্স ডেটা লোড হচ্ছে...');
        try {
            await Promise.all([
                this.loadWeeklyAnalyticsChart(),
                this.loadKpiStats(),
                this.loadContentTrendChart(),
                this.loadModerationAnalytics()
            ]);
        } catch (error) {
            console.error('Error loading advanced analytics:', error);
        } finally {
            this.hideLoading();
        }
    }
    
    async loadKpiStats() {
        const kpiContainer = document.getElementById('kpiStats');
        if (!kpiContainer) return;

        try {
            const { data: activityData } = await supabaseClient.rpc('get_user_activity_stats');
            const dau = activityData?.dau || 0;
            const mau = activityData?.mau || 0;
            
            kpiContainer.innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-info">
                        <div class="stat-number">${dau}</div>
                        <div class="stat-label">দৈনিক সক্রিয় ব্যবহারকারী (DAU)</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="far fa-calendar-alt"></i></div>
                    <div class="stat-info">
                        <div class="stat-number">${mau}</div>
                        <div class="stat-label">মাসিক সক্রিয় ব্যবহারকারী (MAU)</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-sticky-note"></i></div>
                    <div class="stat-info">
                        <div class="stat-number">${this.stats.totalPrayers || 0}</div>
                        <div class="stat-label">মোট পোস্ট</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-comments"></i></div>
                    <div class="stat-info">
                        <div class="stat-number">${this.stats.totalComments || 0}</div>
                        <div class="stat-label">মোট কমেন্ট</div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error("KPI stats error:", error);
            kpiContainer.innerHTML = `<p style="color:red;">KPI লোড করা যায়নি।</p>`;
        }
    }

    async loadWeeklyAnalyticsChart() {
        try {
            const today = new Date();
            const sevenDaysAgo = new Date(today);
            sevenDaysAgo.setDate(today.getDate() - 7);
            const sevenDaysAgoISOString = sevenDaysAgo.toISOString().split('T')[0];

            const [usersData, postsData] = await Promise.all([
                supabaseClient.from('daily_new_users').select('date, new_users_count').gte('date', sevenDaysAgoISOString).order('date', { ascending: true }),
                supabaseClient.from('daily_new_posts').select('date, new_posts_count').gte('date', sevenDaysAgoISOString).order('date', { ascending: true })
            ]);

            const labels = [];
            const newUsers = [];
            const newPosts = [];
            
            const usersMap = new Map((usersData.data || []).map(d => [d.date, d.new_users_count]));
            const postsMap = new Map((postsData.data || []).map(d => [d.date, d.new_posts_count]));

            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(today.getDate() - i);
                const formattedDate = date.toISOString().split('T')[0];
                labels.push(date.toLocaleDateString('bn-BD', { month: 'long', day: 'numeric' }));
                newUsers.push(usersMap.get(formattedDate) || 0);
                newPosts.push(postsMap.get(formattedDate) || 0);
            }
            
            this.renderAnalyticsChart(labels, newUsers, newPosts);

        } catch (error) {
            console.error('Error loading analytics data:', error);
        }
    }
    
    async loadContentTrendChart() {
        const ctx = document.getElementById('contentTrendChart')?.getContext('2d');
        if (!ctx) return;
        
        const { count: prayersWithImage } = await supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).not('image_url', 'is', null);
        const { count: prayersWithVideo } = await supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).not('uploaded_video_url', 'is', null);
        const { count: prayersWithAudio } = await supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).not('audio_url', 'is', null);
        const textOnly = (this.stats.totalPrayers || 0) - (prayersWithImage || 0) - (prayersWithVideo || 0) - (prayersWithAudio || 0);

        if (window.myContentChart) window.myContentChart.destroy();
        
        window.myContentChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['শুধুমাত্র লেখা', 'ছবিসহ', 'ভিডিওসহ', 'অডিওসহ'],
                datasets: [{
                    label: 'কন্টেন্টের প্রকারভেদ',
                    data: [textOnly, prayersWithImage || 0, prayersWithVideo || 0, prayersWithAudio || 0],
                    backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } }
            }
        });
    }

    async loadModerationAnalytics() {
        const container = document.getElementById('moderationAnalyticsContainer');
        if (!container) return;

        const { data, error } = await supabaseClient.from('content_reports')
            .select('created_at, resolved_at')
            .eq('status', 'RESOLVED')
            .not('resolved_at', 'is', null);
            
        if (error) throw error;
        
        let totalDiff = 0;
        let count = 0;
        (data || []).forEach(report => {
            const created = new Date(report.created_at);
            const resolved = new Date(report.resolved_at);
            totalDiff += (resolved - created);
            count++;
        });

        const avgResolutionTime = count > 0 ? (totalDiff / count / 1000 / 60 / 60).toFixed(2) : 0; // in hours

        container.innerHTML = `
            <div class="info-item">
                <span class="info-label">মোট রিপোর্ট:</span>
                <span class="info-value">${this.stats.totalReports || 0}</span>
            </div>
            <div class="info-item">
                <span class="info-label">নিষ্পত্তি হয়েছে:</span>
                <span class="info-value">${(this.stats.totalReports || 0) - (this.stats.reportedContent || 0)}</span>
            </div>
            <div class="info-item">
                <span class="info-label">পেন্ডিং আছে:</span>
                <span class="info-value status-inactive">${this.stats.reportedContent || 0}</span>
            </div>
            <div class="info-item">
                <span class="info-label">গড় নিষ্পত্তি সময় (ঘন্টা):</span>
                <span class="info-value">${avgResolutionTime}</span>
            </div>
        `;
    }

    renderAnalyticsChart(labels, newUsers, newPosts) {
        const ctx = document.getElementById('analyticsChart')?.getContext('2d');
        if (!ctx) return;

        if (window.myAnalyticsChart) {
            window.myAnalyticsChart.destroy();
        }

        window.myAnalyticsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'নতুন ব্যবহারকারী',
                        data: newUsers,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'নতুন দোয়া',
                        data: newPosts,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
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
                    <div class="stat-label">পেন্ডিং রিপোর্ট</div>
                    <div class="stat-sub">রিভিউ প্রয়োজন</div>
                </div>
            </div>
        `;
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };
        updateElement('totalUsers', this.stats.totalUsers);
        updateElement('activeUsers', this.stats.activeUsers);
        updateElement('suspendedUsers', this.stats.suspendedUsers);
        updateElement('totalContent', this.stats.totalPrayers + this.stats.totalComments);
        updateElement('activeContent', this.stats.activePrayers);
        updateElement('hiddenContent', this.stats.hiddenPrayers);
        
        updateElement('scannedContent', this.stats.scannedContent);
        updateElement('flaggedContent', this.stats.reportedContent);
        updateElement('autoHidden', this.stats.hiddenPrayers);
        updateElement('approvalRate', this.stats.approvalRate + '%');
    }

    updateReportsBadge() {
        const badge = document.getElementById('reportsBadge');
        if (badge) {
            badge.textContent = this.stats.reportedContent;
            badge.style.display = this.stats.reportedContent > 0 ? 'flex' : 'none';
        }
    }

    // ==============================================
    // DONATION MANAGEMENT SECTION (NEW SUB-TAB LOGIC)
    // ==============================================
    
    // ** Sub-Tab Switcher **
    switchDonationSubTab(subTabName) {
        // Hide all donation views
        document.querySelectorAll('.donation-view').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.donation-sub-nav .sub-tab-btn').forEach(btn => btn.classList.remove('active'));

        // Show selected view
        const view = document.getElementById(`donation-${subTabName}-view`);
        if(view) view.style.display = 'block';
        
        const btn = document.getElementById(`subtab-${subTabName}`);
        if(btn) btn.classList.add('active');

        // Load appropriate data
        if (subTabName === 'settings') {
            this.loadPaymentNumbersInput();
        } else if (subTabName === 'pending') {
            this.loadDonationRequests('PENDING', 'adminDonationRequests-PENDING');
        } else if (subTabName === 'approved') {
            this.loadDonationRequests('APPROVED', 'adminDonationRequests-APPROVED');
        } else if (subTabName === 'rejected') {
            this.loadDonationRequests('REJECTED', 'adminDonationRequests-REJECTED');
        }
    }

    // 1. Load Payment Numbers and Checkboxes
    async loadPaymentNumbersInput() {
        const { data, error } = await supabaseClient
            .from('system_settings')
            .select('setting_value')
            .eq('setting_key', 'payment_numbers')
            .single();
            
        if (data && data.setting_value) {
            try {
                const nums = JSON.parse(data.setting_value);
                const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
                const setCheck = (id, isChecked) => { const el = document.getElementById(id); if(el) el.checked = !!isChecked; };

                setVal('adminBkash', nums.bkash); setCheck('activeBkash', nums.bkash_active);
                setVal('adminNagad', nums.nagad); setCheck('activeNagad', nums.nagad_active);
                setVal('adminRocket', nums.rocket); setCheck('activeRocket', nums.rocket_active);
                setVal('adminSureCash', nums.surecash); setCheck('activeSureCash', nums.surecash_active);
                setVal('adminTapTap', nums.taptap); setCheck('activeTapTap', nums.taptap_active);
                setVal('adminUpay', nums.upay); setCheck('activeUpay', nums.upay_active);
            } catch (e) { console.error("Error parsing payment numbers", e); }
        }
    }

    // 2. Save Payment Numbers
    async savePaymentNumbers() {
        const getVal = (id) => document.getElementById(id)?.value.trim() || '';
        const getCheck = (id) => document.getElementById(id)?.checked || false;

        const nums = {
            bkash: getVal('adminBkash'), bkash_active: getCheck('activeBkash'),
            nagad: getVal('adminNagad'), nagad_active: getCheck('activeNagad'),
            rocket: getVal('adminRocket'), rocket_active: getCheck('activeRocket'),
            surecash: getVal('adminSureCash'), surecash_active: getCheck('activeSureCash'),
            taptap: getVal('adminTapTap'), taptap_active: getCheck('activeTapTap'),
            upay: getVal('adminUpay'), upay_active: getCheck('activeUpay')
        };
        
        try {
            await this.saveSetting('payment_numbers', JSON.stringify(nums));
            this.showSuccess('পেমেন্ট সেটিংস সফলভাবে আপডেট করা হয়েছে!');
        } catch (error) { this.showError('সেটিংস সেভ করতে সমস্যা হয়েছে।'); }
    }

    // 3. Load Donation Requests (With Search)
    async loadDonationRequests(status, containerId, searchQuery = '') {
        const container = document.getElementById(containerId);
        if(!container) return;
        
        container.innerHTML = '<div class="loading-spinner"></div>';
        
        // Joined with prayers to show Campaign info
        let query = supabaseClient
            .from('donation_requests')
            // EDIT: Explicitly specifying the foreign key constraint to avoid ambiguity
            .select('*, users(display_name), prayers!donation_requests_prayer_id_fkey(title)')
            .eq('status', status)
            .order('created_at', { ascending: false })
            .limit(50);

        // যদি সার্চ কোয়েরি থাকে (TrxID দিয়ে)
        if (searchQuery) {
            query = query.ilike('trx_id', `%${searchQuery}%`);
        }

        const { data, error } = await query;

        if (error) {
            container.innerHTML = '<p style="color:red">ডাটা লোড করতে সমস্যা হয়েছে।</p>';
            return;
        }

        if (!data || data.length === 0) {
            container.innerHTML = `<p class="no-data">কোনো তথ্য পাওয়া যায়নি।</p>`;
            return;
        }

        container.innerHTML = data.map(d => {
            let actionButtons = '';
            let statusBadge = '';
            // ক্যাম্পেইন ইনফো দেখানো
            let campaignInfo = d.prayer_id 
                ? `<br><small style="color:#2980b9;"><i class="fas fa-link"></i> ক্যাম্পেইন: ${d.prayers?.title || 'Unknown'}</small>` 
                : '<br><small style="color:#666;">(জেনারেল ডোনেশন)</small>';

            // Dynamic Action Buttons based on Status
            if (d.status === 'PENDING') {
                statusBadge = `<span class="badge" style="background:#f39c12;">Pending</span>`;
                actionButtons = `
                    <button class="btn btn-sm btn-success" onclick="adminPanel.approveDonation(${d.id})">Approve</button>
                    <button class="btn btn-sm btn-warning" onclick="adminPanel.rejectDonation(${d.id})">Reject</button>
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteDonation(${d.id})">Delete</button>
                `;
            } else if (d.status === 'APPROVED') {
                statusBadge = `<span class="badge" style="background:#27ae60;">Approved</span>`;
                actionButtons = `
                    <button class="btn btn-sm btn-warning" onclick="adminPanel.rejectDonation(${d.id})" title="টাকা ফেরত নিন (Undo)">Reject (Undo)</button>
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteDonation(${d.id})">Delete</button>
                `;
            } else if (d.status === 'REJECTED') {
                statusBadge = `<span class="badge" style="background:#c0392b;">Rejected</span>`;
                actionButtons = `
                    <button class="btn btn-sm btn-success" onclick="adminPanel.approveDonation(${d.id})" title="টাকা যোগ করুন">Approve (Retry)</button>
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteDonation(${d.id})">Delete</button>
                `;
            }

            return `
                <div class="log-item ${d.status === 'REJECTED' ? 'danger' : (d.status === 'APPROVED' ? 'success' : 'warning')}">
                    <div class="log-header">
                        <span class="log-action">
                            <strong>${d.users?.display_name || 'Unknown'}</strong> (${d.payment_method.toUpperCase()})
                        </span>
                        <span style="font-weight:bold; font-size:15px;">৳ ${d.amount}</span>
                    </div>
                    <div class="log-details">
                        Sender: <strong>${d.sender_number}</strong> <br> 
                        TrxID: <strong>${d.trx_id}</strong>
                        ${campaignInfo}
                        <br><small>Time: ${new Date(d.created_at).toLocaleString('bn-BD')}</small>
                    </div>
                    <div class="log-header" style="margin-top:5px; border-top:1px solid #eee; padding-top:5px;">
                        ${statusBadge}
                        <div class="user-actions" style="justify-content:flex-end; gap:5px;">${actionButtons}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 4. Approve Donation Action (Updated: Adds amount to Campaign)
    async approveDonation(id) {
        if(!confirm('নিশ্চিত অ্যাপ্রুভ করবেন?')) return;
        
        this.showLoading('অ্যাপ্রুভ করা হচ্ছে...');

        try {
            // ১. রিকোয়েস্টের বিস্তারিত এবং prayer_id চেক করা
            const { data: request, error: fetchError } = await supabaseClient
                .from('donation_requests')
                .select('*')
                .eq('id', id)
                .single();
            
            if (fetchError) throw fetchError;

            // ২. রিকোয়েস্ট স্ট্যাটাস আপডেট
            const { error: updateError } = await supabaseClient
                .from('donation_requests')
                .update({ status: 'APPROVED' })
                .eq('id', id);
            
            if (updateError) throw updateError;

            // ৩. যদি prayer_id থাকে, তবে মূল ক্যাম্পেইনে টাকা যোগ করা
            if (request.prayer_id) {
                // বর্তমান এমাউন্ট আনা
                const { data: campaign, error: campError } = await supabaseClient
                    .from('prayers')
                    .select('current_amount')
                    .eq('id', request.prayer_id)
                    .single();
                
                if (!campError) {
                    const newAmount = (campaign.current_amount || 0) + parseFloat(request.amount);
                    // আপডেট করা
                    await supabaseClient
                        .from('prayers')
                        .update({ current_amount: newAmount })
                        .eq('id', request.prayer_id);
                }
            }

            this.showSuccess('সফলভাবে অ্যাপ্রুভ করা হয়েছে এবং ক্যাম্পেইনে টাকা যোগ হয়েছে!');
            await this.logAdminAction('APPROVE_DONATION', 'donation', id);
            this.refreshActiveDonationView();

        } catch (error) {
            this.showError('সমস্যা: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 5. Reject Donation Action (Updated: Subtracts amount if undoing)
    async rejectDonation(id) {
        if(!confirm('নিশ্চিত রিজেক্ট করবেন? যদি এটি আগে অ্যাপ্রুভ করা হয়ে থাকে, তবে টাকা বিয়োগ করা হবে।')) return;
        
        this.showLoading('রিজেক্ট করা হচ্ছে...');

        try {
            // ১. রিকোয়েস্ট চেক করা
            const { data: request, error: fetchError } = await supabaseClient
                .from('donation_requests')
                .select('*')
                .eq('id', id)
                .single();
            
            if (fetchError) throw fetchError;

            // ২. যদি এটি আগে APPROVED ছিল এবং prayer_id আছে, তবে টাকা কমানো (Undo Logic)
            if (request.status === 'APPROVED' && request.prayer_id) {
                const { data: campaign, error: campError } = await supabaseClient
                    .from('prayers')
                    .select('current_amount')
                    .eq('id', request.prayer_id)
                    .single();
                
                if (!campError) {
                    const newAmount = Math.max(0, (campaign.current_amount || 0) - parseFloat(request.amount));
                    await supabaseClient
                        .from('prayers')
                        .update({ current_amount: newAmount })
                        .eq('id', request.prayer_id);
                }
            }

            // ৩. স্ট্যাটাস রিজেক্ট করা
            const { error: updateError } = await supabaseClient
                .from('donation_requests')
                .update({ status: 'REJECTED' })
                .eq('id', id);
            
            if (updateError) throw updateError;

            this.showSuccess('সফলভাবে রিজেক্ট করা হয়েছে!');
            await this.logAdminAction('REJECT_DONATION', 'donation', id);
            this.refreshActiveDonationView();

        } catch (error) {
            this.showError('সমস্যা: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 6. Delete Donation Action
    async deleteDonation(id) {
        if(!confirm('সতর্কতা: আপনি কি এই রেকর্ডটি স্থায়ীভাবে ডিলিট করতে চান? এটি আর ফেরানো যাবে না।')) return;

        const { error } = await supabaseClient
            .from('donation_requests')
            .delete()
            .eq('id', id);

        if(!error) {
            this.showSuccess('রেকর্ড ডিলিট করা হয়েছে!');
            await this.logAdminAction('DELETE_DONATION', 'donation', id);
            this.refreshActiveDonationView();
        } else {
            this.showError('ডিলিট করতে সমস্যা: ' + error.message);
        }
    }

    // Helper: Refresh whatever donation view is currently active
    refreshActiveDonationView() {
        const activeView = document.querySelector('.donation-view[style*="block"]');
        if(!activeView) return; // or default handling

        if(activeView.id.includes('pending')) {
            const searchVal = document.getElementById('searchDonationPending')?.value;
            this.loadDonationRequests('PENDING', 'adminDonationRequests-PENDING', searchVal);
        } else if(activeView.id.includes('approved')) {
            const searchVal = document.getElementById('searchDonationApproved')?.value;
            this.loadDonationRequests('APPROVED', 'adminDonationRequests-APPROVED', searchVal);
        } else if(activeView.id.includes('rejected')) {
            const searchVal = document.getElementById('searchDonationRejected')?.value;
            this.loadDonationRequests('REJECTED', 'adminDonationRequests-REJECTED', searchVal);
        }
    }

    /* -----------------------
       Helper utilities
       ----------------------- */
    normalizeIdsForIn(ids) {
        if (!Array.isArray(ids)) return [];
        return ids.map(id => {
            if (id === null || id === undefined) return id;
            if (/^\d+$/.test(String(id))) return Number(id);
            return id;
        }).filter(Boolean);
    }

    async fetchUsersByIds(ids) {
        const uniq = Array.from(new Set(ids.filter(Boolean)));
        if (uniq.length === 0) return {};
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('id, display_name, photo_url, status')
                .in('id', uniq);
            if (error) throw error;
            const map = {};
            (data || []).forEach(u => {
                map[String(u.id)] = u;
            });
            return map;
        } catch (error) {
            console.warn('fetchUsersByIds error:', error);
            return {};
        }
    }
    
    async logAdminAction(action, targetType, targetId, details = {}) {
        if (!currentUser) return;
        try {
            await supabaseClient.from('admin_logs').insert({
                admin_id: currentUser.id,
                admin_email: currentUser.email,
                action: action,
                target_type: targetType,
                target_id: String(targetId),
                details: details
            });
        } catch (error) {
            console.error('Failed to log admin action:', error);
        }
    }

    /* -----------------------
       Reports
       ----------------------- */
    async loadPendingReports(page = 1) {
        try {
            this.showLoading('রিপোর্টস লোড হচ্ছে...');
            const from = (page - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;

            const { data: reports, error: reportsError } = await supabaseClient
                .from('content_reports')
                .select(`* , reporters:reporter_id(display_name, photo_url)`)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: false })
                .range(from, to);

            if (reportsError) throw reportsError;
            if (!reports || reports.length === 0) {
                this.renderReports([]);
                return;
            }

            const prayerIdsRaw = reports.filter(r => r.content_type === 'prayer').map(r => r.content_id);
            const commentIdsRaw = reports.filter(r => r.content_type === 'comment').map(r => r.content_id);

            const prayerIds = this.normalizeIdsForIn(prayerIdsRaw);
            const commentIds = this.normalizeIdsForIn(commentIdsRaw);

            let prayers = [], comments = [];

            if (prayerIds.length > 0) {
                const { data: prayerData, error: prayerError } = await supabaseClient
                    .from('prayers')
                    .select('*, author_uid')
                    .in('id', prayerIds);
                if (prayerError) throw prayerError;
                prayers = prayerData || [];
            }

            if (commentIds.length > 0) {
                const { data: commentData, error: commentError } = await supabaseClient
                    .from('comments')
                    .select('*, author_uid')
                    .in('id', commentIds);
                if (commentError) throw commentError;
                comments = commentData || [];
            }

            const prayerMap = new Map(prayers.map(p => [String(p.id), p]));
            const commentMap = new Map(comments.map(c => [String(c.id), c]));

            const reporterIds = reports.map(r => r.reporter_id).filter(Boolean);
            const authorIdsFromPrayers = prayers.map(p => p.author_uid).filter(Boolean);
            const authorIdsFromComments = comments.map(c => c.author_uid).filter(Boolean);
            const allUserIds = Array.from(new Set([...reporterIds, ...authorIdsFromPrayers, ...authorIdsFromComments].map(String)));

            const userMap = await this.fetchUsersByIds(allUserIds);

            const combined = reports.map(rep => {
                const content = rep.content_type === 'prayer' ? prayerMap.get(String(rep.content_id)) : commentMap.get(String(rep.content_id));
                const reporter = (rep.reporters && rep.reporters.display_name) ? rep.reporters : (userMap[String(rep.reporter_id)] || null);
                const author = content ? (userMap[String(content.author_uid)] || null) : null;
                return { ...rep, content, reporter, author };
            });

            this.renderReports(combined);
            this.setupReportActions(); 
        } catch (error) {
            console.error('Error loading pending reports:', error);
            this.showError('রিপোর্ট লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
            this.renderReports([]);
        } finally {
            this.hideLoading();
        }
    }

    renderReports(reports) {
        const container = document.getElementById('reportsContainer');
        if (!container) return;
        if (!Array.isArray(reports) || reports.length === 0) {
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
            const reporter = report.reporter || report.reporters || {};
            const content = report.content;
            const author = report.author || (content ? (content.author_uid ? { display_name: '[author]' } : {}) : {}) || {};
            const contentType = report.content_type;

            if (!content) {
                return `
                <div class="report-card" data-report-id="${report.id || ''}">
                    <div class="report-header">
                        <div class="report-meta"><span class="report-category low">ত্রুটি</span></div>
                    </div>
                    <div class="report-content">
                        <div class="content-preview" style="background-color: #ffe6e6;">
                            <strong>রিপোর্টেড কন্টেন্ট (ID: ${report.content_id}) খুঁজে পাওয়া যায়নি। সম্ভবত এটি মুছে ফেলা হয়েছে।</strong>
                        </div>
                    </div>
                    <div class="report-footer">
                         <div class="action-buttons">
                             <button class="btn btn-outline btn-sm" data-action="ignore" data-report-id="${report.id || ''}"><i class="fas fa-times"></i> উপেক্ষা করুন</button>
                         </div>
                    </div>
                </div>
                `;
            }

            const contentText = content.details || content.text || 'N/A';
            const authorName = (author && author.display_name) ? author.display_name : (content && content.is_anonymous ? 'Anonymous' : 'অজানা');
            const reporterName = reporter?.display_name || 'অজানা';

            return `
                <div class="report-card" data-report-id="${report.id || ''}" data-content-id="${report.content_id || ''}" data-content-type="${contentType || ''}" data-author-id="${content.author_uid || ''}">
                    <div class="report-header">
                        <div class="report-meta">
                            <span class="report-category ${String(report.priority || 'LOW').toLowerCase()}">${this.getCategoryName(report.category)}</span>
                            <span class="report-priority ${String(report.priority || 'LOW').toLowerCase()}">${report.priority || 'LOW'}</span>
                            <span class="report-time">${this.formatTimeAgo(report.created_at)}</span>
                        </div>
                        <div class="report-actions"><span class="content-type-badge">${contentType === 'prayer' ? 'দোয়া' : 'কমেন্ট'}</span></div>
                    </div>
                    <div class="report-content">
                        <div class="content-preview">
                            <strong>লেখক:</strong> ${authorName}<br>
                            <strong>রিপোর্টার:</strong> ${reporterName}<br>
                            ${contentType === 'prayer' ? `<strong>শিরোনাম:</strong> ${content.title || 'N/A'}<br>` : ''}
                            <strong>কন্টেন্ট:</strong>
                            <div class="content-text">${this.truncateText(contentText, 150)}</div>
                        </div>
                        ${report.description ? `<div class="report-description"><strong>রিপোর্টার বিবরণ:</strong> ${report.description}</div>` : ''}
                    </div>
                    <div class="report-footer">
                        <div class="action-buttons">
                            <button class="btn btn-success btn-sm" data-action="approve" data-report-id="${report.id || ''}"><i class="fas fa-check"></i> অ্যাপ্রুভ</button>
                            <button class="btn btn-warning btn-sm" data-action="hide-content" data-report-id="${report.id || ''}" data-content-id="${report.content_id || ''}" data-content-type="${contentType || ''}"><i class="fas fa-eye-slash"></i> লুকান</button>
                            <button class="btn btn-danger btn-sm" data-action="delete-content" data-report-id="${report.id || ''}" data-content-id="${report.content_id || ''}" data-content-type="${contentType || ''}"><i class="fas fa-trash"></i> ডিলিট</button>
                            <button class="btn btn-info btn-sm" data-action="ban-user" data-report-id="${report.id || ''}" data-user-id="${content.author_uid || ''}"><i class="fas fa-ban"></i> লেখককে ব্যান</button>
                            <button class="btn btn-outline btn-sm" data-action="ignore" data-report-id="${report.id || ''}"><i class="fas fa-times"></i> উপেক্ষা</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setupReportActions() {
        const container = document.getElementById('reportsContainer');
        if (!container) return;
        if (container._adminDelegatedClick) {
            container.removeEventListener('click', container._adminDelegatedClick);
            container._adminDelegatedClick = null;
        }
        const handler = async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            e.stopPropagation();
            const action = btn.dataset.action;
            const reportId = btn.dataset.reportId || btn.closest('.report-card')?.dataset.reportId;
            const contentId = btn.dataset.contentId || btn.closest('.report-card')?.dataset.contentId;
            const contentType = btn.dataset.contentType || btn.closest('.report-card')?.dataset.contentType;
            const userId = btn.dataset.userId || btn.closest('.report-card')?.dataset.authorId; 

            switch (action) {
                case 'approve':
                    await this.approveReport(reportId);
                    break;
                case 'hide-content':
                    await this.hideContent(reportId, contentId, contentType);
                    break;
                case 'delete-content':
                    await this.deleteContent(reportId, contentId, contentType);
                    break;
                case 'ban-user':
                    await this.banUserFromReport(reportId, userId);
                    break;
                case 'ignore':
                    await this.ignoreReport(reportId);
                    break;
                default:
                    console.warn('Unknown action', action);
            }
        };
        container.addEventListener('click', handler);
        container._adminDelegatedClick = handler;
    }

    async approveReport(reportId) {
        if (!reportId) return this.showError('রিপোর্ট আইডি পাওয়া যায়নি');
        if (!confirm('আপনি কি এই রিপোর্ট অ্যাপ্রুভ করতে চান? কন্টেন্ট অপরিবর্তিত থাকবে।')) return;
        try {
            const { error } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: currentUser.id,
                    action_taken: 'APPROVED'
                })
                .eq('id', reportId);
            if (error) throw error;
            await this.logAdminAction('APPROVE_REPORT', 'report', reportId);
            this.showSuccess('রিপোর্ট সফলভাবে অ্যাপ্রুভ করা হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
        } catch (error) {
            console.error('Error approving report:', error);
            this.showError('রিপোর্ট অ্যাপ্রুভ করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async hideContent(reportId, contentId, contentType) {
        if (!reportId || !contentId || !contentType) return this.showError('কন্টেন্ট লুকানোর জন্য প্রয়োজনীয় তথ্য নেই');
        if (!confirm('আপনি কি এই কন্টেন্ট লুকাতে চান?')) return;
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error: contentError } = await supabaseClient
                .from(table)
                .update({
                    status: 'hidden',
                    moderated_at: new Date().toISOString(),
                    moderated_by: currentUser.id
                })
                .eq('id', contentId);
            if (contentError) throw contentError;
            const { error: reportError } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: currentUser.id,
                    action_taken: 'CONTENT_HIDDEN'
                })
                .eq('id', reportId);
            if (reportError) throw reportError;
            await this.logAdminAction('HIDE_CONTENT', contentType, contentId, { from: 'report', reportId });
            this.showSuccess('কন্টেন্ট সফলভাবে লুকানো হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
        } catch (error) {
            console.error('Error hiding content:', error);
            this.showError('কন্টেন্ট লুকাতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async deleteContent(reportId, contentId, contentType) {
        if (!reportId || !contentId || !contentType) return this.showError('কন্টেন্ট ডিলিট করার জন্য প্রয়োজনীয় তথ্য নেই');
        if (!confirm('আপনি কি এই কন্টেন্ট সম্পূর্ণ ডিলিট করতে চান? এই কাজটি undo করা যাবে না।')) return;
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error: contentError } = await supabaseClient
                .from(table)
                .delete()
                .eq('id', contentId);
            if (contentError) throw contentError;
            const { error: reportError } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: currentUser.id,
                    action_taken: 'CONTENT_DELETED'
                })
                .eq('id', reportId);
            if (reportError) throw reportError;
            await this.logAdminAction('DELETE_CONTENT', contentType, contentId, { from: 'report', reportId });
            this.showSuccess('কন্টেন্ট সফলভাবে ডিলিট করা হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
        } catch (error) {
            console.error('Error deleting content:', error);
            this.showError('কন্টেন্ট ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async banUserFromReport(reportId, userId) {
        if (!userId) return this.showError('ব্যবহারকারীর আইডি পাওয়া যাচ্ছে না');
        if (!confirm('আপনি কি এই কন্টেন্টের লেখককে নিষিদ্ধ করতে চান?')) return;
        try {
            const { error } = await supabaseClient
                .from('users')
                .update({
                    status: 'SUSPENDED',
                    suspended_at: new Date().toISOString(),
                    suspended_by: currentUser.id
                })
                .eq('id', userId);
            if (error) throw error;

            if (reportId) {
                const { error: reportError } = await supabaseClient
                    .from('content_reports')
                    .update({
                        status: 'RESOLVED',
                        resolved_at: new Date().toISOString(),
                        resolved_by: currentUser.id,
                        action_taken: 'USER_BANNED'
                    })
                    .eq('id', reportId);
                if (reportError) throw reportError;
            }
            await this.logAdminAction('BAN_USER', 'user', userId, { from: 'report', reportId });
            this.showSuccess('ব্যবহারকারী সফলভাবে নিষিদ্ধ করা হয়েছে');
            await Promise.all([this.loadUsers(), this.loadBannedUsers(), this.loadPendingReports(), this.loadStats()]);
        } catch (error) {
            console.error('Error banning user from report:', error);
            this.showError('ব্যবহারকারী নিষিদ্ধ করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async ignoreReport(reportId) {
        if (!reportId) return this.showError('রিপোর্ট আইডি পাওয়া যায়নি');
        if (!confirm('আপনি কি এই রিপোর্ট উপেক্ষা করতে চান?')) return;
        try {
            const { error } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: currentUser.id,
                    action_taken: 'IGNORED'
                })
                .eq('id', reportId);
            if (error) throw error;
            await this.logAdminAction('IGNORE_REPORT', 'report', reportId);
            this.showSuccess('রিপোর্ট উপেক্ষা করা হয়েছে');
            await this.loadPendingReports();
            await this.loadStats();
        } catch (error) {
            console.error('Error ignoring report:', error);
            this.showError('রিপোর্ট উপেক্ষা করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    /* -----------------------
       Users management
       ----------------------- */
    async loadUsers() {
        try {
            this.showLoading('ব্যবহারকারী লোড হচ্ছে...');
            const { data: users, error } = await supabaseClient
                .from('users')
                .select('*')
                .not('status', 'eq', 'SUSPENDED') 
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            this.renderUsers(users || []);
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('ব্যবহারকারী লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
            this.renderUsers([]);
        } finally {
            this.hideLoading();
        }
    }

    renderUsers(users) {
        const container = document.getElementById('usersList');
        if (!container) return;
        if (!Array.isArray(users) || users.length === 0) {
            container.innerHTML = '<p class="no-data">কোনো সক্রিয় ব্যবহারকারী পাওয়া যায়নি</p>';
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-avatar">${user.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}</div>
                    <div class="user-details">
                        <h4>${user.display_name || 'নাম নেই'}</h4>
                        <p>স্ট্যাটাস: <span class="status-${(user.status || 'active').toLowerCase()}">${user.status || 'active'}</span></p>
                        <p>যোগদান: ${user.created_at ? new Date(user.created_at).toLocaleDateString('bn-BD') : 'N/A'}</p>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-sm btn-info" onclick="adminPanel.viewUserProfile('${user.id}')" title="প্রোফাইল দেখুন"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-info" onclick="adminPanel.warnUser('${user.id}', '${user.display_name || 'নাম নেই'}')" title="সতর্ক করুন"><i class="fas fa-exclamation-triangle"></i></button>
                    ${user.status === 'SUSPENDED' ? `
                        <button class="btn btn-sm btn-success" onclick="adminPanel.unsuspendUser('${user.id}')" title="আনব্যান করুন"><i class="fas fa-check"></i></button>
                    ` : `
                        <button class="btn btn-sm btn-warning" onclick="adminPanel.suspendUser('${user.id}')" title="নিষিদ্ধ করুন"><i class="fas fa-ban"></i></button>
                    `}
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteUser('${user.id}')" title="ডিলিট করুন"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }
    
    async loadBannedUsers() {
        try {
            this.showLoading('নিষিদ্ধ ব্যবহারকারী লোড হচ্ছে...');
            const { data: users, error } = await supabaseClient
                .from('users')
                .select('*')
                .eq('status', 'SUSPENDED') 
                .order('suspended_at', { ascending: false })
                .limit(100);
            
            if (error) throw error;
            this.renderBannedUsers(users || []);
        } catch (error) {
            console.error('Error loading banned users:', error);
            this.showError('নিষিদ্ধ ব্যবহারকারী লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
            this.renderBannedUsers([]);
        } finally {
            this.hideLoading();
        }
    }

    renderBannedUsers(users) {
        const container = document.getElementById('bannedUsersList');
        if (!container) return;
        if (!Array.isArray(users) || users.length === 0) {
            container.innerHTML = '<p class="no-data">কোনো নিষিদ্ধ ব্যবহারকারী পাওয়া যায়নি</p>';
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <div class="user-avatar">${user.display_name ? user.display_name.charAt(0).toUpperCase() : 'U'}</div>
                    <div class="user-details">
                        <h4>${user.display_name || 'নাম নেই'}</h4>
                        <p>স্ট্যাটাস: <span class="status-suspended">SUSPENDED</span></p>
                        <p>নিষিদ্ধ হয়েছেন: ${user.suspended_at ? new Date(user.suspended_at).toLocaleString('bn-BD') : 'N/A'}</p>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn btn-sm btn-info" onclick="adminPanel.viewUserProfile('${user.id}')" title="প্রোফাইল দেখুন"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-info" onclick="adminPanel.warnUser('${user.id}', '${user.display_name || 'নাম নেই'}')" title="সতর্ক করুন"><i class="fas fa-exclamation-triangle"></i></button>
                    <button class="btn btn-sm btn-success" onclick="adminPanel.unsuspendUser('${user.id}')" title="আনব্যান করুন"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="adminPanel.deleteUser('${user.id}')" title="ডিলিট করুন"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    }

    async warnUser(userId, userName) {
        if (!userId) return this.showError('ইউজার আইডি পাওয়া যায়নি।');

        const modal = document.getElementById('warningModal');
        if (!modal) return this.showError('সতর্ক করার মডাল খুঁজে পাওয়া যায়নি।');

        document.getElementById('warnUserId').value = userId;
        document.getElementById('warnUserName').textContent = userName;
        document.getElementById('warningReason').value = '';
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 7);
        const timezoneOffset = defaultDate.getTimezoneOffset() * 60000;
        const localISOTime = new Date(defaultDate - timezoneOffset).toISOString().slice(0, 16);
        document.getElementById('warningResolveAt').value = localISOTime;

        modal.style.display = 'flex';
    }


    async suspendUser(userId) {
        if (!userId) return this.showError('ইউজার আইডি নেই');
        if (!confirm('আপনি কি এই ব্যবহারকারীকে নিষিদ্ধ করতে চান?')) return;
        try {
            const { error } = await supabaseClient
                .from('users')
                .update({
                    status: 'SUSPENDED',
                    suspended_at: new Date().toISOString(),
                    suspended_by: currentUser.id
                })
                .eq('id', userId);
            if (error) throw error;
            await this.logAdminAction('BAN_USER', 'user', userId);
            this.showSuccess('ব্যবহারকারী সফলভাবে নিষিদ্ধ করা হয়েছে');
            await Promise.all([this.loadUsers(), this.loadBannedUsers(), this.loadStats()]);
        } catch (error) {
            console.error('Error suspending user:', error);
            this.showError('ব্যবহারকারী নিষিদ্ধ করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async unsuspendUser(userId) {
        if (!userId) return this.showError('ইউজার আইডি নেই');
        if (!confirm('আপনি কি এই ব্যবহারকারীকে আনব্যান করতে চান?')) return; 
        try {
            const { error } = await supabaseClient
                .from('users')
                .update({
                    status: 'active',
                    suspended_at: null,
                    suspended_by: null
                })
                .eq('id', userId);
            if (error) throw error;
            await this.logAdminAction('UNBAN_USER', 'user', userId);
            this.showSuccess('ব্যবহারকারী সফলভাবে আনবান করা হয়েছে');
            await Promise.all([this.loadUsers(), this.loadBannedUsers(), this.loadStats()]);
        } catch (error) {
            console.error('Error unsuspending user:', error);
            this.showError('ব্যবহারকারী আনবান করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async deleteUser(userId) {
        if (!userId) return this.showError('ইউজার আইডি নেই');
        if (!confirm('আপনি কি এই ব্যবহারকারী সম্পূর্ণ ডিলিট করতে চান? এই কাজটি undo করা যাবে না।')) return;
        try {
            const { error } = await supabaseClient
                .from('users')
                .delete()
                .eq('id', userId);
            if (error) throw error;
            await this.logAdminAction('DELETE_USER', 'user', userId);
            this.showSuccess('ব্যবহারকারী সফলভাবে ডিলিট করা হয়েছে');
            await Promise.all([this.loadUsers(), this.loadBannedUsers(), this.loadStats()]);
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showError('ব্যবহারকারী ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async viewUserProfile(userId) {
        if (!userId) return;
        window.open(`/profile.html?id=${userId}`, '_blank');
    }
    
    async loadWarnedUsers() {
        try {
            this.showLoading('সতর্কতালিকা লোড হচ্ছে...');
            const { data, error } = await supabaseClient
                .from('user_warnings')
                .select(`id, reason, created_at, resolve_at, user:users(id, display_name)`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.renderWarnedUsers(data || []);
        } catch(error) {
            console.error('Error loading warned users:', error);
            this.showError('সতর্কতালিকা লোড করতে সমস্যা হয়েছে।');
            this.renderWarnedUsers([]);
        } finally {
            this.hideLoading();
        }
    }

    renderWarnedUsers(warnings) {
        const container = document.getElementById('warnedUsersContainer');
        if (!container) return;

        if (!warnings || warnings.length === 0) {
            container.innerHTML = `<p class="no-data">বর্তমানে কোনো ব্যবহারকারীকে সতর্ক করা হয়নি।</p>`;
            return;
        }

        container.innerHTML = warnings.map(warning => {
            let resolveAtHTML = '<small style="color: #e74c3c;">স্থায়ী</small>';
            if (warning.resolve_at) {
                const resolveDate = new Date(warning.resolve_at);
                if (resolveDate > new Date()) {
                    resolveAtHTML = `<small style="color: #27ae60;">মুছে যাবে: ${resolveDate.toLocaleString('bn-BD')}</small>`;
                } else {
                    resolveAtHTML = `<small style="color: #666;">মেয়াদোত্তীর্ণ</small>`;
                }
            }

            return `
                <div class="log-item warning">
                    <div class="log-header">
                        <span class="log-action">
                            <a href="/profile.html?id=${warning.user?.id}" target="_blank" style="text-decoration: none; color: inherit;">
                                <strong>${warning.user?.display_name}</strong>
                            </a>
                        </span>
                        <span class="log-meta">${new Date(warning.created_at).toLocaleString('bn-BD')}</span>
                    </div>
                    <div class="log-details">
                        <strong>সতর্কতার কারণ:</strong> ${warning.reason}
                    </div>
                    <div class="log-details" style="margin-top: 0.5rem;">
                        <strong>সময়সীমা:</strong> ${resolveAtHTML}
                    </div>
                    <div class="user-actions" style="margin-top: 0.5rem;">
                        <button class="btn btn-sm btn-success" onclick="adminPanel.removeWarning('${warning.id}')" title="সতর্কবার্তা এখনই সরান">
                            <i class="fas fa-check"></i> সমাধান
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async removeWarning(warningId) {
        if (!warningId) return this.showError('সতর্কবার্তা আইডি পাওয়া যায়নি।');
        if (!confirm('আপনি কি এই সতর্কবার্তাটি মুছে ফেলতে চান? এটি ব্যবহারকারীর প্রোফাইল থেকেও মুছে যাবে।')) return;

        try {
            const { error } = await supabaseClient
                .from('user_warnings')
                .delete()
                .eq('id', warningId);
            
            if (error) throw error;

            await this.logAdminAction('REMOVE_WARNING', 'warning', warningId);
            this.showSuccess('সতর্কবার্তা সফলভাবে মুছে ফেলা হয়েছে।');
            await this.loadWarnedUsers();
        } catch (error) {
            console.error('Error removing warning:', error);
            this.showError('সতর্কবার্তা মুছতে সমস্যা হয়েছে।');
        }
    }

    /* -----------------------
       Hidden Posts Management
       ----------------------- */
    async loadHiddenPosts() {
        try {
            this.showLoading('লুকানো পোস্ট লোড হচ্ছে...');
            const { data, error } = await supabaseClient
                .from('prayers')
                .select('*, author:author_uid(display_name, id)')
                .eq('status', 'hidden')
                .order('moderated_at', { ascending: false });

            if (error) throw error;
            
            this.renderHiddenPosts(data || []);
        } catch (error) {
            console.error('Error loading hidden posts:', error);
            this.showError('লুকানো পোস্ট লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
            this.renderHiddenPosts([]);
        } finally {
            this.hideLoading();
        }
    }

    renderHiddenPosts(posts) {
        const container = document.getElementById('hiddenPostsContainer');
        if (!container) return;

        if (!posts || posts.length === 0) {
            container.innerHTML = `<div class="no-data"><h3>কোনো লুকানো পোস্ট নেই</h3><p>রিপোর্ট থেকে কোনো পোস্ট লুকালে এখানে দেখা যাবে।</p></div>`;
            return;
        }

        container.innerHTML = posts.map(item => `
            <div class="content-item" data-content-id="${item.id}" data-content-type="prayer">
                <div class="content-header">
                    <div class="content-info">
                        <div class="content-title">
                            ${item.title || 'শিরোনাম নেই'}
                            <span class="content-type prayer">দোয়া</span>
                        </div>
                        <div class="content-author">
                           লেখক: ${item.author?.display_name || 'অজানা'}
                        </div>
                    </div>
                    <div class="content-status hidden">
                        hidden
                    </div>
                </div>
                <div class="content-body">
                    ${this.truncateText(item.details || 'কোনো বিস্তারিত নেই', 200)}
                </div>
                <div class="content-footer">
                    <div class="content-meta">
                        <span>লুকানো হয়েছে: ${item.moderated_at ? new Date(item.moderated_at).toLocaleString('bn-BD') : 'N/A'}</span>
                    </div>
                    <div class="content-actions">
                        <button class="btn btn-sm btn-success" data-action="unhide-post" data-content-id="${item.id}" data-content-type="prayer">
                            <i class="fas fa-eye"></i> পুনরায় দেখান
                        </button>
                        <button class="btn btn-sm btn-danger" data-action="delete-direct-hidden" data-content-id="${item.id}" data-content-type="prayer">
                            <i class="fas fa-trash"></i> ডিলিট করুন
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        this.setupHiddenPostsActions();
    }
    
    setupHiddenPostsActions() {
        const container = document.getElementById('hiddenPostsContainer');
        if (!container) return;

        if (container._adminHiddenPostClick) {
            container.removeEventListener('click', container._adminHiddenPostClick);
            container._adminHiddenPostClick = null;
        }

        const handler = async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const contentId = btn.dataset.contentId;
            const contentType = btn.dataset.contentType;

            if (!contentId || !contentType) return;

            if (action === 'unhide-post') {
                await this.unhidePost(contentId, contentType);
            } else if (action === 'delete-direct-hidden') {
                if (!confirm('আপনি কি এই কন্টেন্ট সম্পূর্ণ ডিলিট করতে চান? এই কাজটি undo করা যাবে না।')) return;
                try {
                    const table = contentType === 'prayer' ? 'prayers' : 'comments';
                    const { error } = await supabaseClient.from(table).delete().eq('id', contentId);
                    if (error) throw error;
                    await this.logAdminAction('DELETE_CONTENT', contentType, contentId, { from: 'hidden_posts_tab' });
                    this.showSuccess('কন্টেন্ট সফলভাবে ডিলিট করা হয়েছে');
                    await this.loadHiddenPosts();
                    await this.loadStats();
                } catch (error) {
                    console.error('Error deleting from hidden tab:', error);
                    this.showError('কন্টেন্ট ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || error));
                }
            }
        };

        container.addEventListener('click', handler);
        container._adminHiddenPostClick = handler;
    }

    async unhidePost(contentId, contentType) {
        if (!contentId || !contentType) return this.showError('কন্টেন্ট আইডি বা টাইপ নেই');
        if (!confirm('আপনি কি এই পোস্টটি পুনরায় প্রদর্শন করতে চান?')) return;
        
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient
                .from(table)
                .update({
                    status: 'active',
                    moderated_at: null,
                    moderated_by: null
                })
                .eq('id', contentId);
                
            if (error) throw error;
            await this.logAdminAction('UNHIDE_CONTENT', contentType, contentId);
            this.showSuccess('পোস্টটি সফলভাবে পুনরায় প্রদর্শন করা হয়েছে');
            await this.loadHiddenPosts();
            await this.loadStats();
        } catch (error) {
            console.error('Error unhiding post:', error);
            this.showError('পোস্টটি দেখাতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }
    
    async loadAdminLogs() {
        try {
            this.showLoading('অ্যাক্টিভিটি লগ লোড হচ্ছে...');
            const { data, error } = await supabaseClient
                .from('admin_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50); 

            if (error) throw error;
            this.renderAdminLogs(data || []);
        } catch(error) {
            console.error('Error loading admin logs:', error);
            this.showError('অ্যাডমিন লগ লোড করতে সমস্যা হয়েছে।');
            this.renderAdminLogs([]);
        } finally {
            this.hideLoading();
        }
    }

    renderAdminLogs(logs) {
        const container = document.getElementById('adminLogsContainer');
        if (!container) return;

        if (!logs || logs.length === 0) {
            container.innerHTML = `<p class="no-data">কোনো অ্যাক্টিভিটি লগ পাওয়া যায়নি।</p>`;
            return;
        }

        container.innerHTML = logs.map(log => {
            const actionMap = {
                'BAN_USER': { text: 'ব্যবহারকারীকে নিষিদ্ধ করেছেন', class: 'danger' },
                'UNBAN_USER': { text: 'ব্যবহারকারীকে আনব্যান করেছেন', class: 'success' },
                'DELETE_USER': { text: 'ব্যবহারকারীকে ডিলিট করেছেন', class: 'danger' },
                'WARN_USER': { text: 'ব্যবহারকারীকে সতর্ক করেছেন', class: 'warning' },
                'REMOVE_WARNING': { text: 'সতর্কবার্তা মুছেছেন', class: 'success' },
                'HIDE_CONTENT': { text: 'কন্টেন্ট লুকিয়েছেন', class: 'warning' },
                'UNHIDE_CONTENT': { text: 'কন্টেন্ট পুনরায় দেখিয়েছেন', class: 'success' },
                'DELETE_CONTENT': { text: 'কন্টেন্ট ডিলিট করেছেন', class: 'danger' },
                'APPROVE_REPORT': { text: 'রিপোর্ট অ্যাপ্রুভ করেছেন', class: 'success' },
                'IGNORE_REPORT': { text: 'রিপোর্ট উপেক্ষা করেছেন', class: 'warning' },
                'ADD_KEYWORD': { text: 'নতুন কীওয়ার্ড যোগ করেছেন', class: 'success' },
                'REMOVE_KEYWORD': { text: 'কীওয়ার্ড ডিঅ্যাক্টিভেট করেছেন', class: 'warning' },
                'UPDATE_SETTINGS': { text: 'সেটিংস পরিবর্তন করেছেন', class: 'info' },
                'FEATURE_POST': { text: 'পোস্ট ফিচার্ড করেছেন', class: 'success' },
                'UNFEATURE_POST': { text: 'পোস্ট আন-ফিচার্ড করেছেন', class: 'warning' },
                'GLOBAL_ANNOUNCEMENT': { text: 'গ্লোবাল অ্যানাউন্সমেন্ট পাঠিয়েছেন', class: 'danger' },
                'APPROVE_DONATION': { text: 'ডোনেশন অ্যাপ্রুভ করেছেন', class: 'success' },
                'REJECT_DONATION': { text: 'ডোনেশন রিজেক্ট করেছেন', class: 'danger' },
                'DELETE_DONATION': { text: 'ডোনেশন ডিলিট করেছেন', class: 'danger' },
                'DEFAULT': { text: log.action, class: '' }
            };

            const actionInfo = actionMap[log.action] || actionMap['DEFAULT'];

            return `
                <div class="log-item ${actionInfo.class}">
                    <div class="log-header">
                        <span class="log-action">${actionInfo.text}</span>
                        <span class="log-meta">${new Date(log.created_at).toLocaleString('bn-BD')}</span>
                    </div>
                    <div class="log-details">
                        <strong>অ্যাডমিন:</strong> ${log.admin_email} <br>
                        <strong>টার্গেট:</strong> ${log.target_type} (ID: ${log.target_id})
                    </div>
                </div>
            `;
        }).join('');
    }

    /* -----------------------
       Moderation keywords
       ----------------------- */
    async loadKeywords() {
        try {
            this.showLoading('কীওয়ার্ড লোড হচ্ছে...');
            const { data, error } = await supabaseClient
                .from('moderation_keywords')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            this.keywords = data || [];
            this.renderKeywords();
        } catch (error) {
            console.error('Error loading keywords:', error);
            this.keywords = [];
            this.renderKeywords();
        } finally {
            this.hideLoading();
        }
    }

    renderKeywords() {
        const container = document.getElementById('keywordsList');
        if (!container) return;
        if (this.keywords.length === 0) {
            container.innerHTML = '<p class="no-keywords">কোনো কীওয়ার্ড যোগ করা হয়নি</p>';
            return;
        }
        container.innerHTML = this.keywords.map(keyword => `
            <div class="keyword-tag">
                <span class="keyword-text">${keyword.keyword}</span>
                <span class="keyword-category">${keyword.category}</span>
                <span class="remove-keyword" onclick="adminPanel.removeKeyword('${keyword.id}')">&times;</span>
            </div>
        `).join('');
    }

    async addKeyword() {
        const input = document.getElementById('newKeyword');
        if (!input) return this.showError('কীওয়ার্ড ইনপুট নেই');
        const keyword = input.value.trim();
        if (!keyword) {
            this.showError('দয়া করে একটি কীওয়ার্ড লিখুন');
            return;
        }
        try {
            const { error } = await supabaseClient
                .from('moderation_keywords')
                .insert({
                    keyword: keyword,
                    category: 'INAPPROPRIATE',
                    severity: 'MEDIUM',
                    created_by: currentUser.id
                });
            if (error) throw error;
            await this.logAdminAction('ADD_KEYWORD', 'keyword', keyword);
            input.value = '';
            this.showSuccess('কীওয়ার্ড সফলভাবে যোগ করা হয়েছে');
            await this.loadKeywords();
        } catch (error) {
            console.error('Error adding keyword:', error);
            this.showError('কীওয়ার্ড যোগ করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async removeKeyword(keywordId) {
        if (!keywordId) return this.showError('কীওয়ার্ড আইডি নেই');
        if (!confirm('আপনি কি এই কীওয়ার্ড ডিলিট করতে চান?')) return;
        try {
            const { error } = await supabaseClient
                .from('moderation_keywords')
                .update({ is_active: false })
                .eq('id', keywordId);
            if (error) throw error;
            await this.logAdminAction('REMOVE_KEYWORD', 'keyword', keywordId);
            this.showSuccess('কীওয়ার্ড সফলভাবে ডিলিট করা হয়েছে');
            await this.loadKeywords();
        } catch (error) {
            console.error('Error removing keyword:', error);
            this.showError('কীওয়ার্ড ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    /* -----------------------
       Settings
       ----------------------- */
    async loadSettings() {
        try {
            this.showLoading('সেটিংস লোড হচ্ছে...');
            const { data, error } = await supabaseClient.from('system_settings').select('*');
            if (error) {
                this.settings = this.getDefaultSettings();
                this.renderSettings();
                return;
            }
            this.settings = {};
            (data || []).forEach(s => {
                this.settings[s.setting_key] = this.parseSettingValue(s.setting_value, s.setting_type);
            });
            
            // Load sensitivity_level from localStorage if it exists
            const savedSensitivity = localStorage.getItem('sensitivity_level');
            if (savedSensitivity) {
                this.settings.sensitivity_level = savedSensitivity;
            }

            this.renderSettings();
        } catch (error) {
            console.error('Error loading settings:', error);
            this.settings = this.getDefaultSettings();
            this.renderSettings();
        } finally {
            this.hideLoading();
        }
    }

    getDefaultSettings() {
        return {
            'auto_moderation': true,
            'sensitivity_level': 'medium',
            'email_notifications': true,
            'push_notifications': false,
            'site_name': 'iPray',
            'site_description': 'iPray-এ আপনাকে স্বাগতম। এটি শুধু একটি অ্যাপ নয়, এটি আমাদের বিশ্বাসের উঠোন।'
        };
    }

    parseSettingValue(value, type) {
        if (type === 'boolean') return value === 'true';
        if (type === 'number') return parseInt(value);
        return value;
    }

    renderSettings() {
        const renderToggle = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!value;
        };
        const renderSelect = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };
        const renderText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };
        renderToggle('autoModerationToggle', this.settings.auto_moderation);
        renderToggle('emailNotifications', this.settings.email_notifications);
        renderToggle('pushNotifications', this.settings.push_notifications);
        renderSelect('sensitivityLevel', this.settings.sensitivity_level);
        renderText('siteName', this.settings.site_name);
        renderText('siteDescription', this.settings.site_description);
    }

    async saveGeneralSettings() {
        const siteName = document.getElementById('siteName').value;
        const siteDescription = document.getElementById('siteDescription').value;

        try {
            this.showLoading('সেটিংস সেভ করা হচ্ছে...');
            await Promise.all([
                this.saveSetting('site_name', siteName),
                this.saveSetting('site_description', siteDescription)
            ]);
            await this.logAdminAction('UPDATE_SETTINGS', 'general', 'site_name/description');
            this.showSuccess('সাধারণ সেটিংস সফলভাবে সেভ করা হয়েছে');
        } catch (error) {
            console.error('Error saving general settings:', error);
            this.showError('সাধারণ সেটিংস সেভ করতে সমস্যা হয়েছে।');
        } finally {
            this.hideLoading();
        }
    }

    async saveSetting(key, value) {
        try {
            // Save sensitivity_level to localStorage as well
            if (key === 'sensitivity_level') {
                localStorage.setItem('sensitivity_level', value);
            }
            
            const { error } = await supabaseClient
                .from('system_settings')
                .upsert({
                    setting_key: key,
                    setting_value: value.toString(),
                    setting_type: (typeof value === 'boolean' ? 'boolean' : (typeof value === 'number' ? 'number' : 'string')),
                    updated_by: currentUser.id,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'setting_key' }); 
            if (error) throw error;
            this.settings[key] = value;
        } catch (error) {
            console.error('Error saving setting:', key, error);
            throw error; 
        }
    }
    
    // ===================================
    // আপডেটেড: Global Announcement Function
    // ===================================
    async sendGlobalAnnouncement() {
        const titleInput = document.getElementById('announcementTitle');
        const messageInput = document.getElementById('announcementMessage');
        const title = titleInput.value.trim();
        const message = messageInput.value.trim();

        if (!title || !message) {
            this.showError('শিরোনাম এবং বার্তা উভয়ই প্রয়োজন।');
            return;
        }
        
        if (!confirm(`আপনি কি সত্যিই সকল ব্যবহারকারীকে এই অ্যানাউন্সমেন্টটি পাঠাতে চান?\n\nশিরোনাম: ${title}\nবার্তা: ${message}`)) {
            return;
        }

        this.showLoading('অ্যানাউন্সমেন্ট পাঠানো হচ্ছে...');
        try {
            // সরাসরি insert করার পরিবর্তে ডাটাবেজ ফাংশন (RPC) কল করা হচ্ছে
            const { error } = await supabaseClient.rpc('send_global_announcement', {
                title: title,
                message: message
            });

            if (error) throw error; // যদি কোনো error হয়, সেটি এখানে ধরা পড়বে

            await this.logAdminAction('GLOBAL_ANNOUNCEMENT', 'system', 'all_users', { title: title });
            this.showSuccess('সকল ব্যবহারকারীকে সফলভাবে অ্যানাউন্সমেন্ট পাঠানো হয়েছে।');
            titleInput.value = '';
            messageInput.value = '';

        } catch (error) {
            console.error('Error sending global announcement:', error);
            this.showError('অ্যানাউন্সমেন্ট পাঠাতে সমস্যা হয়েছে: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    /* -----------------------
       Cache / Export
       ----------------------- */
    async clearCache() {
        if (!confirm('আপনি কি সকল ক্যাশে পরিষ্কার করতে চান?')) return;
        try {
            if (typeof caches !== 'undefined') {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            localStorage.clear();
            this.showSuccess('ক্যাশে সফলভাবে পরিষ্কার করা হয়েছে');
        } catch (error) {
            console.error('Error clearing cache:', error);
            this.showError('ক্যাশে পরিষ্কার করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async exportData() {
        try {
            this.showLoading('ডেটা এক্সপোর্ট হচ্ছে...');
            const [users, prayers, reports] = await Promise.all([
                supabaseClient.from('users').select('*'),
                supabaseClient.from('prayers').select('*'),
                supabaseClient.from('content_reports').select('*')
            ]);
            const exportData = {
                users: users.data || [],
                prayers: prayers.data || [],
                reports: reports.data || [],
                export_date: new Date().toISOString(),
                exported_by: currentUser?.email || currentUser?.user_email || currentUser?.id || 'unknown'
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `doa-angina-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showSuccess('ডেটা সফলভাবে এক্সপোর্ট করা হয়েছে');
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showError('ডেটা এক্সপোর্ট করতে সমস্যা হয়েছে: ' + (error?.message || error));
        } finally {
            this.hideLoading();
        }
    }

    /* -----------------------
       Event listeners & tabs
       ----------------------- */
    async setupEventListeners() {
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                // সাব-ট্যাব বাটন এড়াানোর জন্য চেক
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });

        document.getElementById('refreshStats')?.addEventListener('click', () => this.loadStats());
        document.getElementById('refreshAnalytics')?.addEventListener('click', () => this.loadAdvancedAnalytics());
        document.getElementById('refreshReports')?.addEventListener('click', () => this.loadPendingReports());
        document.getElementById('refreshHiddenPosts')?.addEventListener('click', () => this.loadHiddenPosts());
        document.getElementById('refreshBannedUsers')?.addEventListener('click', () => this.loadBannedUsers());
        document.getElementById('refreshLogsBtn')?.addEventListener('click', () => this.loadAdminLogs());
        document.getElementById('refreshWarnedUsersBtn')?.addEventListener('click', () => this.loadWarnedUsers());
        document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => await this.logout());
        document.getElementById('addKeywordBtn')?.addEventListener('click', () => this.addKeyword());
        
        document.getElementById('saveGeneralSettingsBtn')?.addEventListener('click', () => this.saveGeneralSettings());
        document.getElementById('systemHealthBtn')?.addEventListener('click', () => this.checkSystemHealth());
        document.getElementById('sendAnnouncementBtn')?.addEventListener('click', () => this.sendGlobalAnnouncement());

        // নতুন বাটন ইভেন্ট লিসেনার
        document.getElementById('savePaymentNumbersBtn')?.addEventListener('click', () => this.savePaymentNumbers());
        
        // ডোনেশন রিফ্রেশ লজিক (Current View Refresh)
        document.getElementById('refreshDonations')?.addEventListener('click', () => {
            const activeView = document.querySelector('.donation-view[style*="block"]');
            if(activeView) {
                const id = activeView.id;
                if(id.includes('settings')) {
                    this.loadPaymentNumbersInput();
                } else if(id.includes('pending')) {
                    const searchVal = document.getElementById('searchDonationPending')?.value || '';
                    this.loadDonationRequests('PENDING', 'adminDonationRequests-PENDING', searchVal);
                } else if(id.includes('approved')) {
                    const searchVal = document.getElementById('searchDonationApproved')?.value || '';
                    this.loadDonationRequests('APPROVED', 'adminDonationRequests-APPROVED', searchVal);
                } else if(id.includes('rejected')) {
                    const searchVal = document.getElementById('searchDonationRejected')?.value || '';
                    this.loadDonationRequests('REJECTED', 'adminDonationRequests-REJECTED', searchVal);
                }
            } else {
                // Default fallback
                this.loadPaymentNumbersInput();
            }
        });

        // সার্চ বক্স ইভেন্ট লিসেনার (Real-time Search)
        document.getElementById('searchDonationPending')?.addEventListener('input', (e) => {
            this.loadDonationRequests('PENDING', 'adminDonationRequests-PENDING', e.target.value);
        });
        document.getElementById('searchDonationApproved')?.addEventListener('input', (e) => {
            this.loadDonationRequests('APPROVED', 'adminDonationRequests-APPROVED', e.target.value);
        });
        document.getElementById('searchDonationRejected')?.addEventListener('input', (e) => {
            this.loadDonationRequests('REJECTED', 'adminDonationRequests-REJECTED', e.target.value);
        });

        document.getElementById('autoModerationToggle')?.addEventListener('change', (e) => this.saveSetting('auto_moderation', e.target.checked));
        document.getElementById('emailNotifications')?.addEventListener('change', (e) => this.saveSetting('email_notifications', e.target.checked));
        document.getElementById('pushNotifications')?.addEventListener('change', (e) => this.saveSetting('push_notifications', e.target.checked));
        document.getElementById('sensitivityLevel')?.addEventListener('change', (e) => this.saveSetting('sensitivity_level', e.target.value));
        document.getElementById('clearCacheBtn')?.addEventListener('click', () => this.clearCache());
        document.getElementById('exportDataBtn')?.addEventListener('click', () => this.exportData());

        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleQuickAction(action);
            });
        });
        
        // *** FIX: Use event delegation for clickable moderation stats ***
        const moderationContent = document.getElementById('moderationContent');
        if (moderationContent) {
            moderationContent.addEventListener('click', (e) => {
                const clickableItem = e.target.closest('.stat-item.clickable');
                if (clickableItem) {
                    const action = clickableItem.dataset.action;
                    if (action) {
                        this.handleQuickAction(action);
                    }
                }
            });
        }

        document.getElementById('newKeyword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addKeyword();
        });
        
        const submitWarningBtn = document.getElementById('submitWarningBtn');
        if (submitWarningBtn) {
            submitWarningBtn.addEventListener('click', async () => {
                const userId = document.getElementById('warnUserId').value;
                const reason = document.getElementById('warningReason').value.trim();
                const resolveAtInput = document.getElementById('warningResolveAt').value;

                if (!reason) {
                    alert('দয়া করে সতর্ক করার কারণ উল্লেখ করুন।');
                    return;
                }

                let resolveAt = null;
                if (resolveAtInput) {
                    resolveAt = new Date(resolveAtInput).toISOString();
                }

                try {
                    this.showLoading('সতর্কবার্তা পাঠানো হচ্ছে...');
                    const { error } = await supabaseClient
                        .from('user_warnings')
                        .insert({
                            user_id: userId,
                            admin_id: currentUser.id,
                            reason: reason,
                            resolve_at: resolveAt
                        });

                    if (error) throw error;

                    await this.logAdminAction('WARN_USER', 'user', userId, { reason: reason, resolve_at: resolveAt });
                    this.showSuccess('ব্যবহারকারীকে সফলভাবে সতর্ক করা হয়েছে।');
                    
                    document.getElementById('warningModal').style.display = 'none';
                    
                } catch (error) {
                    console.error('Error warning user:', error);
                    this.showError('ব্যবহারকারীকে সতর্ক করতে সমস্যা হয়েছে।');
                } finally {
                    this.hideLoading();
                }
            });
        }

        this.setupReportActions();
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        // শুধুমাত্র মেইন ট্যাব বাটনগুলো রিসেট করব
        document.querySelectorAll('.admin-nav > .admin-tab').forEach(tab => tab.classList.remove('active'));

        const selectedTab = document.querySelector(`.admin-nav > [data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(`${tabName}Content`);
        
        if (selectedTab) selectedTab.classList.add('active');
        if (selectedContent) selectedContent.classList.add('active');

        switch (tabName) {
            case 'analytics': this.loadAdvancedAnalytics(); break;
            case 'reports': this.loadPendingReports(); break;
            case 'users': this.loadUsers(); break;
            case 'warned-users': this.loadWarnedUsers(); break;
            case 'banned-users': this.loadBannedUsers(); break;
            case 'content': this.loadAllContent(); break;
            case 'hidden-posts': this.loadHiddenPosts(); break;
            case 'admin-logs': this.loadAdminLogs(); break;
            case 'moderation': this.loadKeywords(); break;
            case 'donations': 
                // ডোনেশন ট্যাবে আসলে ডিফল্ট 'Settings' দেখাবে
                this.switchDonationSubTab('settings');
                break;
        }
    }

    handleQuickAction(action) {
        switch (action) {
            case 'view-analytics': this.switchTab('analytics'); break;
            case 'view-reports': this.switchTab('reports'); break;
            case 'view-users': this.switchTab('users'); break;
            case 'view-flagged-content': this.switchTab('reports'); break;
            case 'view-hidden-content': this.switchTab('hidden-posts'); break;
            case 'system-health': this.checkSystemHealth(); break;
            case 'view-donations': this.switchTab('donations'); break; // নতুন কুইক অ্যাকশন
            default: console.warn('Unknown quick action:', action);
        }
    }

    async checkSystemHealth() {
        this.showLoading('সিস্টেম হেলথ চেক করা হচ্ছে...');
        try {
            await Promise.all([
                supabaseClient.from('users').select('count', { count: 'exact', head: true }),
                supabaseClient.from('prayers').select('count', { count: 'exact', head: true }),
                supabaseClient.from('content_reports').select('count', { count: 'exact', head: true })
            ]);
            this.showSuccess('সিস্টেম হেলথ চেক সম্পন্ন: সবকিছু ঠিক আছে!');
        } catch (error) {
            console.error('checkSystemHealth error:', error);
            this.showError('সিস্টেম হেলথ চেকে সমস্যা: ' + (error?.message || error));
        } finally {
            this.hideLoading();
        }
    }

    setupRealtimeUpdates() {
        try {
            supabaseClient
                .channel('admin-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports' }, (payload) => {
                    console.log('Realtime update payload:', payload);
                    this.loadStats();
                    if (document.querySelector('#reportsContent')?.classList.contains('active')) this.loadPendingReports();
                })
                .subscribe()
                .catch(err => console.warn('Realtime subscribe error:', err));
        } catch (err) {
            console.warn('setupRealtimeUpdates error:', err);
        }
    }

    async logout() {
        try { await supabaseClient.auth.signOut(); } catch (err) { console.warn('signOut err', err); } finally { window.location.href = '/index.html'; }
    }

    getCategoryName(category) {
        const categories = {
            'SPAM': 'স্প্যাম',
            'HARASSMENT': 'উৎপীড়ন',
            'HATE_SPEECH': 'ঘৃণামূলক বক্তব্য',
            'INAPPROPRIATE': 'অনুপযুক্ত',
            'FALSE_INFORMATION': 'ভুল তথ্য',
            'OTHER': 'অন্যান্য'
        };
        return categories[category] || category || 'অন্যান্য';
    }

    formatTimeAgo(dateString) {
        if (!dateString) return 'অজানা';
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

    showLoading(message = 'লোড হচ্ছে...') {
        const loading = document.getElementById('adminLoading');
        if (!loading) return;
        loading.style.display = 'flex';
        const p = loading.querySelector('p');
        if (p) p.textContent = message;
    }

    hideLoading() {
        const loading = document.getElementById('adminLoading');
        if (!loading) return;
        loading.style.display = 'none';
    }

    showSuccess(message) { this.showNotification(message, 'success'); }
    showError(message) { this.showNotification(message, 'error'); }

    showNotification(message, type = 'info') {
        document.querySelectorAll('.notification').forEach(n => n.remove());
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;
        notification.querySelector('.notification-close').onclick = () => notification.remove();
        document.body.appendChild(notification);
        setTimeout(() => { if (notification.parentNode) notification.remove(); }, 5000);
    }

    /* -----------------------
       Content (All content view)
       ----------------------- */
    async loadAllContent() {
        try {
            this.showLoading('কন্টেন্ট লোড হচ্ছে...');
            const { data: prayers, error } = await supabaseClient
                .from('prayers')
                .select('*, author_uid, is_featured') 
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            const authorIds = (prayers || []).map(p => p.author_uid).filter(Boolean).map(String);
            const userMap = await this.fetchUsersByIds(authorIds);
            const prayersWithAuthor = (prayers || []).map(p => ({ ...p, author: userMap[String(p.author_uid)] || null }));
            this.renderAllContent(prayersWithAuthor, []);
        } catch (error) {
            console.error('Error loading all content:', error);
            this.showError('কন্টেন্ট লোড করতে সমস্যা হয়েছে: ' + (error?.message || error));
            this.renderAllContent([], []);
        } finally {
            this.hideLoading();
        }
    }

    renderAllContent(prayers, comments) {
        const container = document.getElementById('contentList');
        if (!container) return;
        const allContent = [
            ...((Array.isArray(prayers) ? prayers : []).map(p => ({ ...p, type: 'prayer' })))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (allContent.length === 0) {
            container.innerHTML = '<p class="no-data">কোনো কন্টেন্ট পাওয়া যায়নি</p>';
            return;
        }

        container.innerHTML = allContent.map(item => `
            <div class="content-item" data-content-id="${item.id}" data-content-type="${item.type}">
                <div class="content-header">
                    <div class="content-info">
                        <div class="content-title">
                            ${item.type === 'prayer' ? (item.title || 'শিরোনাম নেই') : 'কমেন্ট'}
                            <span class="content-type ${item.type}">${item.type === 'prayer' ? 'দোয়া' : 'কমেন্ট'}</span>
                        </div>
                        <div class="content-author">
                            ${item.author?.display_name || item.users?.display_name || 'অজানা'}
                        </div>
                    </div>
                    <div class="content-status ${item.status || ''}">
                        ${item.status || 'active'}
                    </div>
                </div>
                <div class="content-body">
                    ${item.type === 'prayer' ? (item.details || 'কোনো বিস্তারিত নেই') : (item.text || 'কোনো টেক্সট নেই')}
                </div>
                <div class="content-footer">
                    <div class="content-meta">
                        <span>${item.created_at ? new Date(item.created_at).toLocaleString('bn-BD') : 'N/A'}</span>
                        ${item.type === 'prayer' ? `<span>আমিন: ${item.ameen_count || 0}</span><span>লাভ: ${item.love_count || 0}</span>` : ''}
                    </div>
                    <div class="content-actions">
                        ${item.type === 'prayer' ? `
                            <button 
                                class="btn btn-sm btn-feature ${item.is_featured ? 'featured' : ''}" 
                                data-action="toggle-feature" 
                                data-content-id="${item.id}" 
                                data-is-featured="${item.is_featured}"
                                title="${item.is_featured ? 'আন-ফিচার করুন' : 'ফিচার করুন'}"
                            >
                                <i class="fas fa-star"></i>
                            </button>
                        ` : ''}
                        ${item.status === 'active' ? `
                            <button class="btn btn-sm btn-warning" data-action="hide-direct" data-content-id="${item.id}" data-content-type="${item.type}">লুকান</button>
                        ` : `
                            <button class="btn btn-sm btn-success" data-action="unhide-direct" data-content-id="${item.id}" data-content-type="${item.type}">দেখান</button>
                        `}
                        <button class="btn btn-sm btn-danger" data-action="delete-direct" data-content-id="${item.id}" data-content-type="${item.type}">ডিলিট</button>
                    </div>
                </div>
            </div>
        `).join('');

        this.setupContentActionDelegation();
    }

    setupContentActionDelegation() {
        const container = document.getElementById('contentList');
        if (!container) return;
        if (container._adminContentClick) {
            container.removeEventListener('click', container._adminContentClick);
            container._adminContentClick = null;
        }
        const handler = async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const contentId = btn.dataset.contentId || btn.closest('.content-item')?.dataset.contentId;
            const contentType = btn.dataset.contentType || btn.closest('.content-item')?.dataset.contentType;
            if (!contentId || !contentType) return;
            switch (action) {
                case 'hide-direct': await this.hideContentDirect(contentId, contentType); break;
                case 'unhide-direct': await this.unhideContentDirect(contentId, contentType); break;
                case 'delete-direct': await this.deleteContentDirect(contentId, contentType); break;
                case 'toggle-feature':
                    const isFeatured = btn.dataset.isFeatured === 'true';
                    await this.toggleFeaturedStatus(contentId, isFeatured);
                    break;
                default: break;
            }
        };
        container.addEventListener('click', handler);
        container._adminContentClick = handler;
    }
    
    async toggleFeaturedStatus(contentId, isCurrentlyFeatured) {
        if (!contentId) return this.showError('কন্টেন্ট আইডি পাওয়া যায়নি।');
        const newStatus = !isCurrentlyFeatured;
        const actionText = newStatus ? 'ফিচার' : 'আন-ফিচার';

        try {
            const { error } = await supabaseClient
                .from('prayers')
                .update({ is_featured: newStatus })
                .eq('id', contentId);
            
            if (error) throw error;

            const logAction = newStatus ? 'FEATURE_POST' : 'UNFEATURE_POST';
            await this.logAdminAction(logAction, 'prayer', contentId);
            
            this.showSuccess(`পোস্ট সফলভাবে ${actionText} করা হয়েছে।`);
            await this.loadAllContent(); 

        } catch (error) {
            console.error('Error toggling featured status:', error);
            this.showError(`পোস্ট ${actionText} করতে সমস্যা হয়েছে।`);
        }
    }

    async hideContentDirect(contentId, contentType) {
        if (!contentId || !contentType) return this.showError('কন্টেন্ট আইডি বা টাইপ নেই');
        if (!confirm('আপনি কি এই কন্টেন্ট লুকাতে চান?')) return;
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient.from(table).update({
                status: 'hidden',
                moderated_at: new Date().toISOString(),
                moderated_by: currentUser.id
            }).eq('id', contentId);
            if (error) throw error;
            await this.logAdminAction('HIDE_CONTENT', contentType, contentId);
            this.showSuccess('কন্টেন্ট সফলভাবে লুকানো হয়েছে');
            await this.loadAllContent();
        } catch (error) {
            console.error('hideContentDirect error:', error);
            this.showError('কন্টেন্ট লুকাতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async unhideContentDirect(contentId, contentType) {
        if (!contentId || !contentType) return this.showError('কন্টেন্ট আইডি বা টাইপ নেই');
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient.from(table).update({
                status: 'active',
                moderated_at: new Date().toISOString(),
                moderated_by: currentUser.id
            }).eq('id', contentId);
            if (error) throw error;
            await this.logAdminAction('UNHIDE_CONTENT', contentType, contentId);
            this.showSuccess('কন্টেন্ট সফলভাবে দেখানো হয়েছে');
            await this.loadAllContent();
        } catch (error) {
            console.error('unhideContentDirect error:', error);
            this.showError('কন্টেন্ট দেখাতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }

    async deleteContentDirect(contentId, contentType) {
        if (!contentId || !contentType) return this.showError('কন্টেন্ট আইডি বা টাইপ নেই');
        if (!confirm('আপনি কি এই কন্টেন্ট সম্পূর্ণ ডিলিট করতে চান?')) return;
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient.from(table).delete().eq('id', contentId);
            if (error) throw error;
            await this.logAdminAction('DELETE_CONTENT', contentType, contentId);
            this.showSuccess('কন্টেন্ট সফলভাবে ডিলিট করা হয়েছে');
            await this.loadAllContent();
        } catch (error) {
            console.error('deleteContentDirect error:', error);
            this.showError('কন্টেন্ট ডিলিট করতে সমস্যা হয়েছে: ' + (error?.message || error));
        }
    }
}

/* -----------------------
   Bootstrap
   ----------------------- */
let adminPanel;
document.addEventListener('DOMContentLoaded', async () => {
    adminPanel = new AdminPanel();
    await adminPanel.initialize();
});
