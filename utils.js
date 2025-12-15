// ====================================================================
// FILE: utils.js
// বিবরণ: হেল্পার ফাংশন, ফরম্যাটার, ইউটিলিটি ক্লাস এবং রিপোর্ট সিস্টেম
// ====================================================================

console.log("Utils Module Loaded");

// 1. THROTTLE FUNCTION (স্ক্রল ইভেন্ট কমানোর জন্য)
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

// 2. LAZY LOADING IMAGE OBSERVER
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

// 3. AUTO PAUSE MEDIA OBSERVER (ফিড স্ক্রল করলে ভিডিও পজ হবে)
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

// 4. REPORT SYSTEM CLASS (এটি ছাড়া রিপোর্ট বাটন কাজ করবে না)
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
        if (!currentUser) { 
            showLoginModal(); 
            return false; 
        }
        
        if (!contentId || !contentType || !category) { 
            alert('তথ্য অসম্পূর্ণ।'); 
            return false; 
        }

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
            
            alert('রিপোর্ট জমা দেওয়া হয়েছে। এডমিন এটি যাচাই করবেন।');
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

// রিপোর্ট সিস্টেমের ইনস্ট্যান্স তৈরি (গ্লোবালি এক্সেস করার জন্য)
const reportSystem = new ReportSystem();

// 5. BUTTON LOADING STATE TOGGLER
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

// 6. YOUTUBE URL PARSER
const getYouTubeEmbedUrl = url => {
    if (!url) return null;
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match && match[1] ? `https://www.youtube.com/embed/${match[1]}` : null;
};

// 7. AVATAR COLOR GENERATOR
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

// 8. TIME AGO FORMATTER (Bangla)
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

// 9. LINKIFY TEXT (URL & Hashtags)
const linkifyText = (text) => {
    if (!text) return '';
    
    // URL Regex
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    
    // Hashtag Regex
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    
    let linkedText = text.replace(urlRegex, (url) => {
        let fullUrl = url;
        if (!fullUrl.startsWith('http')) { fullUrl = 'http://' + fullUrl; }
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="post-link" onclick="event.stopPropagation();">${url}</a>`;
    });
    
    linkedText = linkedText.replace(hashtagRegex, `<span class="hashtag">#$1</span>`);
    
    return linkedText;
};

// 10. SKELETON LOADER TOGGLE
const showSkeletonLoader = (show, containerId = null) => { 
    const skeletonContainer = document.getElementById('skeletonContainer');
    const storySkeletonContainer = document.getElementById('storySkeletonContainer');
    const storyContainer = document.getElementById('storyContainer');
    
    // নির্দিষ্ট কন্টেইনারের জন্য (যেমন প্রোফাইল পেজ)
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

    // হোম পেজের জন্য
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

// 11. ARRAY SHUFFLER (ফিশার-ইয়েটস অ্যালগরিদম)
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// 12. SHOW LOGIN MODAL
function showLoginModal() {
    const loginPage = document.getElementById('loginPage');
    if (loginPage) {
        loginPage.style.display = 'flex';
        // URL এ হ্যাশ বা স্টেট যোগ করা যেতে পারে ব্যাক বাটন হ্যান্ডল করার জন্য
        history.pushState(null, null, window.location.href);
    }
}