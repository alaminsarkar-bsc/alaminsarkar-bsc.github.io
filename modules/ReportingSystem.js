// modules/ReportingSystem.js
class ReportingSystem {
    constructor() {
        this.reportCategories = {
            'SPAM': {
                name: 'স্প্যাম',
                description: 'অনাকাঙ্ক্ষিত বা পুনরাবৃত্তিমূলক কন্টেন্ট',
                priority: 'LOW'
            },
            'HARASSMENT': {
                name: 'উৎপীড়ন',
                description: 'ব্যক্তিগত আক্রমণ বা হয়রানি',
                priority: 'HIGH'
            },
            'HATE_SPEECH': {
                name: 'ঘৃণামূলক বক্তব্য',
                description: 'ধর্ম, বর্ণ, বা গোষ্ঠীর বিরুদ্ধে ঘৃণা',
                priority: 'HIGH'
            },
            'INAPPROPRIATE': {
                name: 'অনুপযুক্ত কন্টেন্ট',
                description: 'অশ্লীল বা অনুপযুক্ত বিষয়বস্তু',
                priority: 'MEDIUM'
            },
            'FALSE_INFORMATION': {
                name: 'ভুল তথ্য',
                description: 'মিথ্যা বা ভুল তথ্য প্রচার',
                priority: 'MEDIUM'
            },
            'COPYRIGHT': {
                name: 'কপিরাইট সমস্যা',
                description: 'কপিরাইটকৃত কন্টেন্ট ব্যবহার',
                priority: 'MEDIUM'
            },
            'OTHER': {
                name: 'অন্যান্য',
                description: 'অন্যান্য সমস্যা',
                priority: 'LOW'
            }
        };

        this.reportThresholds = {
            AUTO_HIDE: 3,
            URGENT_REVIEW: 5,
            USER_SUSPENSION: 10
        };

        this.stats = {
            totalReports: 0,
            resolvedReports: 0,
            pendingReports: 0
        };
    }

    async submitReport(contentId, contentType, reporterId, category, description = '') {
        if (!this.reportCategories[category]) {
            return { success: false, error: 'Invalid report category' };
        }

        const report = {
            id: this.generateReportId(),
            content_id: contentId,
            content_type: contentType, // 'prayer', 'comment'
            reporter_id: reporterId,
            category: category,
            description: description,
            status: 'PENDING',
            priority: this.reportCategories[category].priority,
            created_at: new Date().toISOString(),
            resolved_at: null,
            resolved_by: null,
            action_taken: null
        };

        try {
            // ডাটাবেসে রিপোর্ট সেভ করুন
            const { data, error } = await supabaseClient
                .from('content_reports')
                .insert([report])
                .select();

            if (error) {
                console.error('Error submitting report:', error);
                return { success: false, error: error.message };
            }

            this.stats.totalReports++;
            this.stats.pendingReports++;

            // রিপোর্ট থ্রেশহোল্ড চেক করুন
            await this.checkReportThreshold(contentId, contentType);

            // Admin-কে নোটিফাই করুন (যদি হাই প্রায়োরিটি হয়)
            if (this.reportCategories[category].priority === 'HIGH') {
                await this.notifyAdmins(report);
            }

            return { 
                success: true, 
                reportId: report.id,
                message: 'রিপোর্ট সফলভাবে জমা দেওয়া হয়েছে'
            };

        } catch (error) {
            console.error('Exception in submitReport:', error);
            return { success: false, error: error.message };
        }
    }

    async checkReportThreshold(contentId, contentType) {
        try {
            // কন্টেন্টের pending রিপোর্ট সংখ্যা চেক করুন
            const { count, error } = await supabaseClient
                .from('content_reports')
                .select('*', { count: 'exact', head: true })
                .eq('content_id', contentId)
                .eq('content_type', contentType)
                .eq('status', 'PENDING');

            if (error) {
                console.error('Error checking report threshold:', error);
                return;
            }

            const reportCount = count || 0;

            if (reportCount >= this.reportThresholds.AUTO_HIDE) {
                await this.autoHideContent(contentId, contentType);
            }

            if (reportCount >= this.reportThresholds.URGENT_REVIEW) {
                await this.flagForUrgentReview(contentId, contentType);
            }

            // ইউজার সাসপেনশন চেক
            if (reportCount >= this.reportThresholds.USER_SUSPENSION) {
                await this.checkUserSuspension(contentId, contentType);
            }

        } catch (error) {
            console.error('Exception in checkReportThreshold:', error);
        }
    }

    async autoHideContent(contentId, contentType) {
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient
                .from(table)
                .update({ 
                    status: 'hidden',
                    auto_moderated: true,
                    moderation_reason: 'Multiple user reports',
                    moderated_at: new Date().toISOString()
                })
                .eq('id', contentId);

            if (!error) {
                console.log(`Content ${contentId} auto-hidden due to multiple reports`);
                
                // রিপোর্টগুলো রিজল্ভ করুন
                await this.resolveReportsForContent(contentId, contentType, 'AUTO_HIDE');
                
                return { success: true };
            }
            
            return { success: false, error };
        } catch (error) {
            console.error('Error auto-hiding content:', error);
            return { success: false, error };
        }
    }

    async flagForUrgentReview(contentId, contentType) {
        try {
            const { error } = await supabaseClient
                .from('admin_alerts')
                .insert([{
                    content_id: contentId,
                    content_type: contentType,
                    alert_type: 'URGENT_REVIEW',
                    message: `Content has ${this.reportThresholds.URGENT_REVIEW}+ reports and needs urgent review`,
                    priority: 'HIGH',
                    created_at: new Date().toISOString()
                }]);

            if (!error) {
                console.log(`Urgent review flagged for content ${contentId}`);
                return { success: true };
            }
            
            return { success: false, error };
        } catch (error) {
            console.error('Error flagging for urgent review:', error);
            return { success: false, error };
        }
    }

    async checkUserSuspension(contentId, contentType) {
        try {
            // প্রথমে কন্টেন্টের মালিক বের করুন
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { data: content, error } = await supabaseClient
                .from(table)
                .select('author_uid')
                .eq('id', contentId)
                .single();

            if (error || !content) {
                return { success: false, error: 'Content not found' };
            }

            const userId = content.author_uid;

            // ইউজারের মোট রিপোর্টেড কন্টেন্ট চেক করুন
            const { count: userReportedContent } = await supabaseClient
                .from('content_reports')
                .select('*', { count: 'exact', head: true })
                .eq('content_type', contentType)
                .in('content_id', 
                    await this.getUserContentIds(userId, contentType)
                )
                .eq('status', 'PENDING');

            if (userReportedContent >= this.reportThresholds.USER_SUSPENSION) {
                await this.suspendUser(userId, 'Multiple content violations');
            }

        } catch (error) {
            console.error('Error checking user suspension:', error);
        }
    }

    async getUserContentIds(userId, contentType) {
        const table = contentType === 'prayer' ? 'prayers' : 'comments';
        const { data, error } = await supabaseClient
            .from(table)
            .select('id')
            .eq('author_uid', userId);

        if (error || !data) return [];
        return data.map(item => item.id);
    }

    async suspendUser(userId, reason) {
        try {
            const { error } = await supabaseClient
                .from('users')
                .update({
                    status: 'SUSPENDED',
                    suspension_reason: reason,
                    suspended_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (!error) {
                console.log(`User ${userId} suspended: ${reason}`);
                return { success: true };
            }
            
            return { success: false, error };
        } catch (error) {
            console.error('Error suspending user:', error);
            return { success: false, error };
        }
    }

    async resolveReportsForContent(contentId, contentType, action) {
        try {
            const { error } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: 'auto_moderation',
                    action_taken: action
                })
                .eq('content_id', contentId)
                .eq('content_type', contentType)
                .eq('status', 'PENDING');

            if (!error) {
                const resolvedCount = await this.getResolvedCount();
                this.stats.resolvedReports = resolvedCount;
                this.stats.pendingReports = this.stats.totalReports - resolvedCount;
                
                return { success: true };
            }
            
            return { success: false, error };
        } catch (error) {
            console.error('Error resolving reports:', error);
            return { success: false, error };
        }
    }

    async getResolvedCount() {
        const { count, error } = await supabaseClient
            .from('content_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'RESOLVED');

        return error ? 0 : count;
    }

    async notifyAdmins(report) {
        try {
            const { error } = await supabaseClient
                .from('admin_notifications')
                .insert([{
                    type: 'HIGH_PRIORITY_REPORT',
                    title: 'High Priority Content Report',
                    message: `New ${report.category} report for ${report.content_type}`,
                    data: report,
                    priority: 'HIGH',
                    created_at: new Date().toISOString()
                }]);

            if (!error) {
                console.log('Admin notified about high priority report');
            }
        } catch (error) {
            console.error('Error notifying admins:', error);
        }
    }

    generateReportId() {
        return 'report_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // রিপোর্ট স্ট্যাটস পাওয়ার জন্য
    getStats() {
        return { ...this.stats };
    }

    // পেন্ডিং রিপোর্টগুলো পাওয়ার জন্য
    async getPendingReports(limit = 50) {
        try {
            const { data, error } = await supabaseClient
                .from('content_reports')
                .select(`
                    *,
                    prayers: content_id (*, users!author_uid(display_name)),
                    comments: content_id (*, users!author_uid(display_name))
                `)
                .eq('status', 'PENDING')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: true })
                .limit(limit);

            if (error) {
                console.error('Error fetching pending reports:', error);
                return { success: false, error };
            }

            return { success: true, data: data || [] };
        } catch (error) {
            console.error('Exception in getPendingReports:', error);
            return { success: false, error };
        }
    }

    // রিপোর্ট রিজল্ভ করার জন্য
    async resolveReport(reportId, adminId, action, notes = '') {
        try {
            const { error } = await supabaseClient
                .from('content_reports')
                .update({
                    status: 'RESOLVED',
                    resolved_at: new Date().toISOString(),
                    resolved_by: adminId,
                    action_taken: action,
                    admin_notes: notes
                })
                .eq('id', reportId);

            if (!error) {
                // স্ট্যাটস আপডেট করুন
                const resolvedCount = await this.getResolvedCount();
                this.stats.resolvedReports = resolvedCount;
                this.stats.pendingReports = this.stats.totalReports - resolvedCount;

                return { success: true };
            }
            
            return { success: false, error };
        } catch (error) {
            console.error('Error resolving report:', error);
            return { success: false, error };
        }
    }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReportingSystem;
}