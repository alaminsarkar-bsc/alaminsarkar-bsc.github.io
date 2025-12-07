// modules/ContentModeration.js
class ContentModeration {
    constructor() {
        this.sensitiveKeywords = [
            'অশ্লীল', 'গালি', 'মন্দ', 'খারাপ', 'ঘৃণ্য', 'অসভ্য',
            'হিন্দু', 'বৌদ্ধ', 'খ্রিস্টান', 'ইহুদি', 'কাফির', 'মুরতাদ',
            'মূর্তি', 'idol', 'puja', 'প্রার্থনা', 'পূজা',
            'attack', 'violence', 'হামলা', 'সন্ত্রাস',
            'ঘৃণা', 'হেট', 'hate', 'বিদ্বেষ',
            'রাজনীতি', 'politics', 'দল', 'নেতা',
            'sex', 'sexual', 'যৌন', 'অশ্লীল',
            'scam', 'spam', 'স্ক্যাম', 'স্প্যাম',
            'alcohol', 'মদ', 'জুয়া', 'gambling'
        ];
        
        this.autoModerationEnabled = true;
        this.communityReportingEnabled = true;
        this.moderationStats = {
            totalScanned: 0,
            flaggedContent: 0,
            autoHidden: 0,
            manualReviews: 0
        };
    }

    // অটো কন্টেন্ট স্ক্যানিং
    async scanContent(text, contentType = 'prayer') {
        this.moderationStats.totalScanned++;
        
        const issues = [];
        
        // কীওয়ার্ড বেসড স্ক্যান
        const foundKeywords = this.sensitiveKeywords.filter(keyword => 
            text.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (foundKeywords.length > 0) {
            issues.push({
                type: 'SENSITIVE_KEYWORD',
                keywords: foundKeywords,
                severity: foundKeywords.length > 2 ? 'HIGH' : 'MEDIUM',
                message: `সংবেদনশীল শব্দ পাওয়া গেছে: ${foundKeywords.join(', ')}`
            });
        }

        // স্প্যাম ডিটেকশন
        const spamScore = this.calculateSpamScore(text);
        if (spamScore > 0.7) {
            issues.push({
                type: 'POTENTIAL_SPAM',
                score: spamScore,
                severity: 'HIGH',
                message: 'স্প্যাম কন্টেন্ট সনাক্ত করা হয়েছে'
            });
        }

        // টক্সিসিটি চেক
        const toxicityScore = await this.checkToxicity(text);
        if (toxicityScore > 0.6) {
            issues.push({
                type: 'TOXIC_CONTENT',
                score: toxicityScore,
                severity: 'HIGH',
                message: 'অনুপযুক্ত বা বিষাক্ত কন্টেন্ট'
            });
        }

        // লেংথ ভ্যালিডেশন
        const lengthIssues = this.validateContentLength(text, contentType);
        if (lengthIssues) {
            issues.push(lengthIssues);
        }

        const result = {
            hasIssues: issues.length > 0,
            issues: issues,
            approved: issues.length === 0,
            autoAction: this.determineAutoAction(issues),
            scanId: this.generateScanId(),
            timestamp: new Date().toISOString()
        };

        if (result.hasIssues) {
            this.moderationStats.flaggedContent++;
            if (result.autoAction === 'AUTO_HIDE') {
                this.moderationStats.autoHidden++;
            } else if (result.autoAction === 'FLAG_FOR_REVIEW') {
                this.moderationStats.manualReviews++;
            }
        }

        return result;
    }

    calculateSpamScore(text) {
        const spamIndicators = [
            text.length < 10, // খুব ছোট টেক্সট
            text.split(' ').length < 3, // খুব কম শব্দ
            (text.match(/http/g) || []).length > 2, // অনেক লিংক
            (text.match(/[0-9]{10,}/g) || []).length > 0, // ফোন নম্বর
            (text.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length > 10, // অনেক বিশেষ ক্যারেক্টার
            text === text.toUpperCase() && text.length > 20 // সব ক্যাপিটাল লেটার
        ];
        
        const trueIndicators = spamIndicators.filter(Boolean).length;
        return trueIndicators / spamIndicators.length;
    }

    async checkToxicity(text) {
        // সরলীকৃত টক্সিসিটি চেক
        const toxicWords = [
            'মন্দ', 'খারাপ', 'ঘৃণ্য', 'অসভ্য', 'নষ্ট', 'বাজে',
            'stupid', 'idiot', 'fool', 'bad', 'worst', 'hate'
        ];
        
        const toxicPatterns = [
            /\b(মর|মারা|খুন|হত্যা)\b/gi,
            /\b(গালি|অপমান|অশ্লীল)\b/gi,
            /\b(ধ্বংস|নাশ|বিনাশ)\b/gi
        ];

        let toxicityScore = 0;
        
        // টক্সিক শব্দ চেক
        const foundToxicWords = toxicWords.filter(word => 
            text.toLowerCase().includes(word.toLowerCase())
        );
        toxicityScore += foundToxicWords.length * 0.1;

        // টক্সিক প্যাটার্ন চেক
        const patternMatches = toxicPatterns.filter(pattern => 
            pattern.test(text)
        ).length;
        toxicityScore += patternMatches * 0.3;

        // ক্যাপিটাল লেটার এবং এক্সক্লেমেশন চেক
        const capitalRatio = (text.match(/[A-Z]/g) || []).length / text.length;
        const exclamationCount = (text.match(/!/g) || []).length;
        
        if (capitalRatio > 0.7 && text.length > 10) {
            toxicityScore += 0.2;
        }
        if (exclamationCount > 3) {
            toxicityScore += exclamationCount * 0.05;
        }

        return Math.min(toxicityScore, 1.0);
    }

    validateContentLength(text, contentType) {
        const limits = {
            'prayer': { min: 10, max: 2000 },
            'comment': { min: 1, max: 500 },
            'title': { min: 3, max: 100 }
        };

        const limit = limits[contentType] || limits['prayer'];
        
        if (text.length < limit.min) {
            return {
                type: 'TOO_SHORT',
                severity: 'MEDIUM',
                message: `কন্টেন্ট খুব ছোট। ন্যূনতম ${limit.min} অক্ষর প্রয়োজন।`
            };
        }
        
        if (text.length > limit.max) {
            return {
                type: 'TOO_LONG', 
                severity: 'LOW',
                message: `কন্টেন্ট খুব বড়। সর্বোচ্চ ${limit.max} অক্ষর অনুমোদিত।`
            };
        }
        
        return null;
    }

    determineAutoAction(issues) {
        const highSeverityIssues = issues.filter(issue => issue.severity === 'HIGH');
        const mediumSeverityIssues = issues.filter(issue => issue.severity === 'MEDIUM');
        
        if (highSeverityIssues.length >= 1) {
            return 'AUTO_HIDE';
        } else if (mediumSeverityIssues.length >= 2 || issues.length >= 3) {
            return 'FLAG_FOR_REVIEW';
        } else if (issues.length > 0) {
            return 'WARN_USER';
        }
        
        return 'APPROVE';
    }

    generateScanId() {
        return 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // মডারেশন স্ট্যাটস পাওয়ার জন্য
    getStats() {
        return {
            ...this.moderationStats,
            approvalRate: ((this.moderationStats.totalScanned - this.moderationStats.flaggedContent) / this.moderationStats.totalScanned * 100).toFixed(2)
        };
    }

    // কীওয়ার্ড লিস্ট আপডেট করার জন্য
    updateSensitiveKeywords(newKeywords) {
        this.sensitiveKeywords = [...new Set([...this.sensitiveKeywords, ...newKeywords])];
        return this.sensitiveKeywords;
    }

    // কীওয়ার্ড লিস্ট থেকে রিমুভ করার জন্য
    removeSensitiveKeywords(keywordsToRemove) {
        this.sensitiveKeywords = this.sensitiveKeywords.filter(
            keyword => !keywordsToRemove.includes(keyword)
        );
        return this.sensitiveKeywords;
    }

    // কন্টেন্ট manual approve করার জন্য
    async manuallyApproveContent(contentId, contentType) {
        // ডাটাবেসে কন্টেন্ট approved হিসেবে মার্ক করুন
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient
                .from(table)
                .update({ 
                    status: 'active',
                    moderation_status: 'APPROVED',
                    moderated_at: new Date().toISOString(),
                    moderated_by: 'admin'
                })
                .eq('id', contentId);

            if (!error) {
                console.log(`Content ${contentId} manually approved`);
                return { success: true };
            }
            return { success: false, error };
        } catch (error) {
            console.error('Error approving content:', error);
            return { success: false, error };
        }
    }

    // কন্টেন্ট manual reject করার জন্য
    async manuallyRejectContent(contentId, contentType, reason) {
        try {
            const table = contentType === 'prayer' ? 'prayers' : 'comments';
            const { error } = await supabaseClient
                .from(table)
                .update({ 
                    status: 'hidden',
                    moderation_status: 'REJECTED',
                    moderation_reason: reason,
                    moderated_at: new Date().toISOString(),
                    moderated_by: 'admin'
                })
                .eq('id', contentId);

            if (!error) {
                console.log(`Content ${contentId} rejected: ${reason}`);
                return { success: true };
            }
            return { success: false, error };
        } catch (error) {
            console.error('Error rejecting content:', error);
            return { success: false, error };
        }
    }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentModeration;
}