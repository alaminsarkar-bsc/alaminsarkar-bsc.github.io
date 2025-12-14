// ====================================
// FILE: utils.js
// বিবরণ: হেল্পার ফাংশন, ফরম্যাটার এবং ইউটিলিটি ক্লাস
// ====================================

// --- Throttle Function (স্ক্রল ইভেন্ট কমানোর জন্য) ---
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// --- Lazy Loading Image Observer ---
const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
                img.src = src;
                img.classList.add('lazy-loaded');
                img.removeAttribute('data-src'); 
            }
            observer.unobserve(img);
        }
    });
}, { rootMargin: '300px' });

// --- Auto Pause Media Observer ---
const mediaObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const mediaElement = entry.target;
        if (!entry.isIntersecting) {
            if (!mediaElement.paused) {
                mediaElement.pause();
            }
        }
    });
}, { threshold: 0.5 });

// --- Report System Class ---
class ReportSystem {
    constructor() {
        this.categories = {
            'SPAM': 'স্প্যাম',
            'HARASSMENT': 'উৎপীড়ন',
            'HATE_SPEECH': 'ঘৃণামূলক বক্তব্য',
            'INAPPROPRIATE': 'অনুপযুক্ত',
            'FALSE_INFORMATION': 'ভুল তথ্য',
            'OTHER': 'অন্যান্য'
        };
    }
    async submitReport(contentId, contentType, category, description = '') {
        if (!currentUser) { showLoginModal(); return false; }
        if (!contentId || !contentType || !category) { alert('তথ্য অসম্পূর্ণ।'); return false; }
        try {
            const { error } = await supabaseClient.from('content_reports').insert([{
                content_id: contentId,
                content_type: contentType,
                reporter_id: currentUser.id,
                category,
                description,
                status: 'PENDING',
                priority: this.getPriority(category)
            }]);
            if (error) throw error;
            alert('রিপোর্ট জমা দেওয়া হয়েছে।');
            return true;
        } catch (error) { 
            console.error("Report Error:", error);
            alert('রিপোর্ট জমা দিতে সমস্যা হয়েছে।'); 
            return false; 
        }
    }
    getPriority(category) {
        const high = ['HARASSMENT', 'HATE_SPEECH'];
        if (high.includes(category)) return 'HIGH';
        return ['INAPPROPRIATE', 'FALSE_INFORMATION'].includes(category) ? 'MEDIUM' : 'LOW';
    }
}
const reportSystem = new ReportSystem();

// --- Button Loading State ---
const setLoading = (button, isLoading) => { 
    if (!button) return; 
    if (isLoading) { 
        button.dataset.originalText = button.innerHTML; 
        button.innerHTML = '<div class="loader" style="width:16px;height:16px;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:rotation 1s linear infinite;"></div>'; 
        button.disabled = true; 
    } else { 
        if (button.dataset.originalText) button.innerHTML = button.dataset.originalText; 
        button.disabled = false; 
    } 
};

// --- YouTube URL Helper ---
const getYouTubeEmbedUrl = url => {
    if (!url) return null;
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match && match[1] ? `https://www.youtube.com/embed/${match[1]}` : null;
};

// --- Avatar Color Generator ---
const generateAvatarColor = name => {
    if (!name) return '#007BFF';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

// --- Time Ago Formatter ---
const timeAgo = dateString => {
    if (!dateString) return 'অজানা';
    try {
        const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
        if (seconds < 60) return 'এইমাত্র';
        const intervals = { 'বছর': 31536000, 'মাস': 2592000, 'দিন': 86400, 'ঘন্টা': 3600, 'মিনিট': 60 };
        for (const [key, value] of Object.entries(intervals)) {
            const counter = Math.floor(seconds / value);
            if (counter > 0) return `${counter} ${key} আগে`;
        }
        return 'এইমাত্র';
    } catch (error) { return 'অজানা'; }
};

// --- Linkify Text (Links & Hashtags) ---
const linkifyText = (text) => {
    if (!text) return '';
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    let linkedText = text.replace(urlRegex, (url) => {
        let fullUrl = url;
        if (!fullUrl.startsWith('http')) { fullUrl = 'http://' + fullUrl; }
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="post-link" onclick="event.stopPropagation();">${url}</a>`;
    });
    linkedText = linkedText.replace(hashtagRegex, `<span class="hashtag">#$1</span>`);
    return linkedText;
};

// --- Skeleton Loader Toggle ---
const showSkeletonLoader = (show, containerId = null) => { 
    const skeletonContainer = document.getElementById('skeletonContainer');
    const storySkeletonContainer = document.getElementById('storySkeletonContainer');
    const storyContainer = document.getElementById('storyContainer');
    
    if (containerId) {
        const target = document.getElementById(containerId);
        if (target) {
            if (show) {
                target.innerHTML = `
                    <div class="skeleton-card"><div class="skeleton-line" style="width: 60%;"></div><div class="skeleton-block" style="height: 150px;"></div></div>
                    <div class="skeleton-card"><div class="skeleton-line" style="width: 80%;"></div><div class="skeleton-block" style="height: 100px;"></div></div>
                `;
            } else {
                target.innerHTML = '';
            }
        }
        return;
    }

    if (show) {
        if(skeletonContainer) skeletonContainer.style.display = 'block';
        if(storySkeletonContainer) storySkeletonContainer.style.display = 'flex';
        if(storyContainer) storyContainer.style.display = 'none';
    } else {
        if(skeletonContainer) skeletonContainer.style.display = 'none';
        if(storySkeletonContainer) storySkeletonContainer.style.display = 'none';
        if(storyContainer) storyContainer.style.display = 'flex';
    }
};

// --- Array Shuffler ---
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// --- Show Login Modal ---
function showLoginModal() {
    document.getElementById('loginPage').style.display = 'flex';
    history.pushState(null, null, window.location.href);
}