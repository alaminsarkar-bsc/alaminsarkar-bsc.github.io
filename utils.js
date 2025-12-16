// ====================================================================
// FILE: utils.js
// বিবরণ: অ্যাপের সমস্ত হেল্পার ফাংশন, ফরম্যাটার, ইউটিলিটি ক্লাস এবং রিপোর্ট সিস্টেম
// এই ফাইলটি অ্যাপের বিভিন্ন ছোটখাটো লজিক এবং টুলস ম্যানেজ করে।
// ====================================================================

console.log("Utils Module Loaded Successfully");

// ====================================================================
// 1. পারফরম্যান্স অপ্টিমাইজেশন টুলস
// ====================================================================

/**
 * Throttle Function
 * স্ক্রল বা রিসাইজ ইভেন্টগুলো যাতে বারবার কল হয়ে অ্যাপ স্লো না করে,
 * তার জন্য এই ফাংশনটি ব্যবহার করা হয়।
 */
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

// ====================================================================
// 2. মিডিয়া এবং ইমেজ লোডিং হ্যান্ডলার
// ====================================================================

/**
 * Lazy Loading Image Observer
 * ছবিগুলো স্ক্রিনে আসার পরই লোড হবে। এতে ইন্টারনেট ডাটা বাঁচে এবং অ্যাপ ফাস্ট হয়।
 */
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
}, { rootMargin: '300px' }); // স্ক্রিনে আসার ৩০০ পিক্সেল আগেই লোড শুরু হবে

/**
 * Auto Pause Media Observer
 * ফিড স্ক্রল করার সময় ভিডিও স্ক্রিনের বাইরে চলে গেলে অটোমেটিক পজ হয়ে যাবে।
 */
const mediaObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const mediaElement = entry.target;
        
        // যদি ভিডিও স্ক্রিনের বাইরে চলে যায়
        if (!entry.isIntersecting) {
            if (!mediaElement.paused) {
                mediaElement.pause();
                console.log("Auto-paused video to save resources");
            }
        }
    });
}, { threshold: 0.5 }); // ভিডিওর ৫০% দেখা না গেলে পজ হবে

// ====================================================================
// 3. রিপোর্ট এবং মডারেশন সিস্টেম
// ====================================================================

/**
 * Report System Class
 * পোস্ট বা কমেন্ট রিপোর্ট করার সম্পূর্ণ লজিক এখানে থাকে।
 */
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

    // রিপোর্ট সাবমিট করার ফাংশন
    async submitReport(contentId, contentType, category, description = '') {
        // ১. ইউজার লগইন চেক
        if (!currentUser) { 
            showLoginModal(); 
            return false; 
        }
        
        // ২. ভ্যালিডেশন চেক
        if (!contentId || !contentType || !category) { 
            alert('তথ্য অসম্পূর্ণ। দয়া করে ক্যাটেগরি সিলেক্ট করুন।'); 
            return false; 
        }

        try {
            // ৩. ডাটাবেসে রিপোর্ট জমা দেওয়া
            const { error } = await supabaseClient
                .from('content_reports')
                .insert([{
                    content_id: contentId,
                    content_type: contentType,
                    reporter_id: currentUser.id,
                    category: category,
                    description: description,
                    status: 'PENDING',
                    priority: this.getPriority(category) // অটোমেটিক প্রায়োরিটি সেট হবে
                }]);

            if (error) throw error;
            
            alert('রিপোর্ট জমা দেওয়া হয়েছে। এডমিন শীঘ্রই ব্যবস্থা নেবেন।');
            return true;

        } catch (error) { 
            console.error("Report Error:", error);
            alert('রিপোর্ট জমা দিতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।'); 
            return false; 
        }
    }

    // রিপোর্টের গুরুত্ব (Priority) নির্ধারণ করার লজিক
    getPriority(category) {
        const highPriority = ['HARASSMENT', 'HATE_SPEECH'];
        
        if (highPriority.includes(category)) {
            return 'HIGH'; // খুব জরুরি
        }
        
        if (['INAPPROPRIATE', 'FALSE_INFORMATION'].includes(category)) {
            return 'MEDIUM'; // মাঝারি
        }
        
        return 'LOW'; // সাধারণ
    }
}

// গ্লোবাল রিপোর্ট সিস্টেম ইনস্ট্যান্স তৈরি
const reportSystem = new ReportSystem();

// ====================================================================
// 4. ইউজার ইন্টারফেস (UI) হেল্পার
// ====================================================================

/**
 * Button Loading State Toggler
 * বাটনে ক্লিক করলে লোডিং স্পিনার দেখানোর জন্য।
 * @param {HTMLElement} button - যে বাটনে লোডার দেখাবে
 * @param {boolean} isLoading - লোডিং চলছে কিনা (true/false)
 */
const setLoading = (button, isLoading) => { 
    if (!button) return; 
    
    if (isLoading) { 
        // অরিজিনাল টেক্সট সেভ করে রাখা
        button.dataset.originalText = button.innerHTML; 
        // লোডার সেট করা
        button.innerHTML = '<div class="loader" style="width:16px;height:16px;border:2px solid #fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:rotation 1s linear infinite;"></div>'; 
        button.disabled = true; 
    } else { 
        // অরিজিনাল টেক্সট ফেরত আনা
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText; 
        }
        button.disabled = false; 
    } 
};

/**
 * Show Skeleton Loader
 * ডাটা লোড হওয়ার আগে স্কেলেটন এনিমেশন দেখানোর জন্য।
 */
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
                    <div class="skeleton-card">
                        <div class="skeleton-header">
                            <div class="skeleton-avatar"></div>
                            <div class="skeleton-author-info">
                                <div class="skeleton-line" style="width: 50%;"></div>
                                <div class="skeleton-line" style="width: 30%;"></div>
                            </div>
                        </div>
                        <div class="skeleton-line" style="width: 90%;"></div>
                        <div class="skeleton-line" style="width: 70%;"></div>
                        <div class="skeleton-block" style="height: 150px;"></div>
                    </div>
                `;
            } else {
                target.innerHTML = '';
            }
        }
        return;
    }

    // হোম পেজের ফিড এবং স্টোরির জন্য ডিফল্ট স্কেলেটন
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

/**
 * Show Login Modal
 * ইউজার লগইন না থাকলে লগইন পপ-আপ দেখানোর জন্য।
 */
function showLoginModal() {
    const loginPage = document.getElementById('loginPage');
    if (loginPage) {
        loginPage.style.display = 'flex';
        // ব্যাক বাটন হ্যান্ডলিংয়ের জন্য হিস্ট্রি পুশ করা
        history.pushState(null, null, window.location.href);
    } else {
        console.error("Login modal element not found!");
    }
}

// ====================================================================
// 5. স্ট্রিং এবং টেক্সট ফরম্যাটার
// ====================================================================

/**
 * YouTube URL Parser
 * সাধারণ ইউটিউব লিংক থেকে এমবেড করার যোগ্য লিংক তৈরি করে।
 */
const getYouTubeEmbedUrl = url => {
    if (!url) return null;
    
    // বিভিন্ন ধরনের ইউটিউব লিংক সাপোর্ট করার জন্য রেজেক্স
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    
    return match && match[1] ? `https://www.youtube.com/embed/${match[1]}` : null;
};

/**
 * Linkify Text
 * টেক্সটের ভেতর লিংক (URL) এবং হ্যাশট্যাগ (#) থাকলে সেগুলোকে ক্লিকেবল লিংকে রূপান্তর করে।
 */
const linkifyText = (text) => {
    if (!text) return '';
    
    // URL Regex Pattern
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    
    // Hashtag Regex Pattern
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    
    // লিংক রিপ্লেস করা
    let linkedText = text.replace(urlRegex, (url) => {
        let fullUrl = url;
        if (!fullUrl.startsWith('http')) { 
            fullUrl = 'http://' + fullUrl; 
        }
        return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="post-link" onclick="event.stopPropagation();">${url}</a>`;
    });
    
    // হ্যাশট্যাগ রিপ্লেস করা (স্টাইলসহ)
    linkedText = linkedText.replace(hashtagRegex, `<span class="hashtag">#$1</span>`);
    
    return linkedText;
};

/**
 * Avatar Color Generator
 * ইউজারের ছবি না থাকলে নামের ওপর ভিত্তি করে একটি ইউনিক রঙ তৈরি করে।
 */
const generateAvatarColor = name => {
    if (!name) return '#007BFF';
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    
    return color;
};

/**
 * Time Ago Formatter (Bangla)
 * পোস্টের সময় দেখানোর জন্য (যেমন: ৫ মিনিট আগে, ১ দিন আগে)।
 */
const timeAgo = dateString => {
    if (!dateString) return 'অজানা';
    
    try {
        const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
        
        if (seconds < 60) return 'এইমাত্র';
        
        const intervals = { 
            'বছর': 31536000, 
            'মাস': 2592000, 
            'দিন': 86400, 
            'ঘন্টা': 3600, 
            'মিনিট': 60 
        };
        
        for (const [key, value] of Object.entries(intervals)) {
            const counter = Math.floor(seconds / value);
            if (counter > 0) {
                return `${counter} ${key} আগে`;
            }
        }
        
        return 'এইমাত্র';
    } catch (error) { 
        return 'অজানা'; 
    }
};

// ====================================================================
// 6. বিবিধ ফাংশন
// ====================================================================

/**
 * Array Shuffler
 * ফিশার-ইয়েটস অ্যালগরিদম ব্যবহার করে ফিড এলোমেলো করার জন্য।
 */
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};