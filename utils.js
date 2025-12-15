// ====================================================================
// FILE: utils.js
// বিবরণ: হেল্পার ফাংশন, ফরম্যাটার, ইউটিলিটি ক্লাস, রিপোর্ট সিস্টেম এবং অফলাইন ম্যানেজার
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

// 4. REPORT SYSTEM CLASS
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

// 10. SKELETON LOADER TOGGLE
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

// 11. ARRAY SHUFFLER
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
        history.pushState(null, null, window.location.href);
    }
}

// 13. GLOBAL UPLOAD HELPERS (Shared for Online/Offline)
async function compressImageFile(imageFile) {
    if (typeof imageCompression === 'undefined') return imageFile;
    const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1920, useWebWorker: true, initialQuality: 0.7 };
    try {
        const compressedFile = await imageCompression(imageFile, options);
        return compressedFile;
    } catch (error) {
        console.error("Compression Error:", error);
        return imageFile;
    }
}

const uploadWithProgress = async (bucket, fileName, file, showUI = true) => {
    let container, progressBar, progressText;
    let interval;

    if (showUI) {
        container = document.getElementById('uploadProgressContainer');
        progressBar = document.getElementById('uploadProgressBar');
        progressText = document.getElementById('progressText');
        
        if (container) {
            container.style.display = 'block';
            let progress = 0;
            interval = setInterval(() => {
                if (progress < 90) {
                    progress += 10;
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;
                }
            }, 200);
        }
    }

    try {
        const { data, error } = await supabaseClient.storage
            .from(bucket)
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
        
        if (interval) clearInterval(interval);
        
        if (error) throw error;

        if (showUI && container) {
            progressBar.style.width = `100%`;
            progressText.textContent = `100%`;
            setTimeout(() => { container.style.display = 'none'; }, 1000);
        }

        return supabaseClient.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
    } catch (err) {
        if (interval) clearInterval(interval);
        if (showUI && container) container.style.display = 'none';
        throw err;
    }
};

// ==========================================
// 14. OFFLINE POST MANAGER (INDEXED DB)
// ==========================================
const DB_NAME = 'iPrayOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_posts';

// ডাটাবেজ ওপেন করা
function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// পোস্ট সেভ করা (অফলাইনে)
async function savePostOffline(postData, imageFile, videoFile, audioFile, recordedBlob) {
    const db = await openOfflineDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // ফাইলগুলোকে ব্লব হিসেবে সেভ করতে হবে
    const offlineData = {
        ...postData,
        timestamp: Date.now(),
        imageBlob: imageFile || null,
        videoBlob: videoFile || null,
        audioBlob: audioFile || null,
        recordedAudioBlob: recordedBlob || null
    };

    return new Promise((resolve, reject) => {
        const request = store.add(offlineData);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// সব অফলাইন পোস্ট পাওয়া
async function getOfflinePosts() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// পোস্ট ডিলিট করা (আপলোডের পর)
async function deleteOfflinePost(id) {
    const db = await openOfflineDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
}

// ==========================================
// 15. SYNC FUNCTION (অটোমেটিক আপলোড)
// ==========================================
async function syncOfflinePosts() {
    if (!navigator.onLine) return;

    const posts = await getOfflinePosts();
    if (posts.length === 0) return;

    console.log(`Syncing ${posts.length} offline posts...`);
    
    // টোস্ট মেসেজ দেখানো
    const toast = document.createElement('div');
    toast.className = 'notification info';
    toast.innerHTML = `<div class="notification-content"><span>ইন্টারনেট ফিরে এসেছে। ${posts.length}টি অফলাইন পোস্ট আপলোড হচ্ছে...</span></div>`;
    document.body.appendChild(toast);

    for (const post of posts) {
        try {
            let imageUrl = null, uploadedVideoUrl = null, audioFileUrl = null, videoThumbnailUrl = null;

            // ১. ইমেজ আপলোড
            if (post.imageBlob) {
                const compressed = await compressImageFile(post.imageBlob);
                imageUrl = await uploadWithProgress('post_images', `${post.author_uid}_img_${Date.now()}`, compressed, false);
            }

            // ২. ভিডিও আপলোড
            if (post.videoBlob) {
                uploadedVideoUrl = await uploadWithProgress('post_videos', `${post.author_uid}_vid_${Date.now()}`, post.videoBlob, false);
            }

            // ৩. অডিও আপলোড
            if (post.recordedAudioBlob) {
                audioFileUrl = await uploadWithProgress('audio_prayers', `audio-${post.author_uid}-${Date.now()}.webm`, post.recordedAudioBlob, false);
            } else if (post.audioBlob) {
                audioFileUrl = await uploadWithProgress('audio_prayers', `audio-${post.author_uid}-${Date.now()}.mp3`, post.audioBlob, false);
            }

            // ৪. মেইন ডাটা অবজেক্ট তৈরি
            const finalPostData = {
                author_uid: post.author_uid,
                title: post.title,
                details: post.details,
                youtube_url: post.youtube_url,
                image_url: imageUrl,
                uploaded_video_url: uploadedVideoUrl,
                audio_url: audioFileUrl,
                video_thumbnail_url: videoThumbnailUrl,
                is_poll: post.is_poll,
                poll_options: post.poll_options,
                poll_votes: post.poll_votes,
                is_fundraising: post.is_fundraising,
                organization_name: post.organization_name,
                goal_amount: post.goal_amount,
                current_amount: post.current_amount,
                payment_details: post.payment_details,
                is_anonymous: post.is_anonymous,
                status: 'active'
            };

            // ৫. ডাটাবেজে ইনসার্ট
            const { error } = await supabaseClient.from('prayers').insert([finalPostData]);
            
            if (!error) {
                // সফল হলে লোকাল ডিবি থেকে ডিলিট
                await deleteOfflinePost(post.id);
            } else {
                console.error("Sync insert error:", error);
            }

        } catch (err) {
            console.error("Sync failed for post:", post.id, err);
        }
    }

    toast.remove();
    alert("আপনার অফলাইন পোস্টগুলো সফলভাবে আপলোড হয়েছে!");
    
    // হোমপেজে থাকলে ফিড রিফ্রেশ
    if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
        window.location.reload();
    }
}

// উইন্ডো অবজেক্টে সিঙ্ক ফাংশন এক্সপোজ করা (যাতে main.js ব্যবহার করতে পারে)
window.syncOfflinePosts = syncOfflinePosts;
window.savePostOffline = savePostOffline;
window.uploadWithProgress = uploadWithProgress;
window.compressImageFile = compressImageFile;