
const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================================
// 1. GLOBAL VARIABLES
// ====================================
let currentUser = null;
let prayersSubscription = null;
let allFetchedPrayers = new Map();
let isVideoFeedActive = false;
const ADMIN_USERS = ['bm15.telecom@gmail.com', 'alaminsarkar.bsc@gmail.com'];

// Feed &Pagination State
let currentPage = 0;
const prayersPerPage = 8; 
let isLoadingMore = false;
let noMorePrayers = false;
let shuffledPrayerIds = [];
let isFeedInitialized = false;
let fundraisingPosts = [];
let currentFundraisingIndex = 0;
let currentFeedType = 'for_you'; 
let savedPostIds = new Set();
let filteredUserId = null;
let feedObserver = null;

// Donation Variables
let activeDonationCampaignId = null;
let adminPaymentNumbers = {};

// Video Tracking
const viewedVideosSession = new Set();

// NEW: User Reaction Cache
let userLovedPrayers = new Set();
let userAmeenedPrayers = new Set();

// ====================================
// 2. STORY EDITOR STATE (ADVANCED)
// ====================================
let storyGroups = []; 
let storyEditorState = {
    mode: 'text', // 'text' | 'media'
    mediaFile: null,      // Uploaded file
    mediaBlob: null,      // Recorded video blob
    bgColor: 'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    textColor: '#ffffff',
    isRecording: false,
    isMuted: false,       // Mute state
    recordingTimer: null, // JS Interval
    mediaRecorder: null,
    recordedChunks: [],
    stream: null,
    maxDuration: 30       // 30 Seconds limit
};

let storyViewerState = {
    isOpen: false,
    currentUserIndex: 0,
    currentStoryIndex: 0,
    storyTimeout: null,
    isPaused: false
};

const STORY_GRADIENTS = [
    'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    'linear-gradient(135deg, #000000 0%, #434343 100%)',
    'linear-gradient(135deg, #FF0099 0%, #493240 100%)',
    'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)'
];
let currentGradientIndex = 0;

// ====================================
// 3. HELPER FUNCTIONS
// ====================================

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

const getYouTubeEmbedUrl = url => {
    if (!url) return null;
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match && match[1] ? `https://www.youtube.com/embed/${match[1]}` : null;
};

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

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

function showLoginModal() {
    document.getElementById('loginPage').style.display = 'flex';
    history.pushState(null, null, window.location.href);
}

// ====================================
// 4. APP INITIALIZATION & AUTH
// ====================================
document.addEventListener('DOMContentLoaded', () => initializeApp());

async function initializeApp() {
    try {
        setupEventListeners();
        setupNavigationLogic(); 
        setupSingleMediaPlayHandler();
        setupStoryEditor(); 
        
        const appContainer = document.getElementById('appContainer');
        if(appContainer) appContainer.style.display = 'block';

        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            document.getElementById('loginPage').style.display = 'none';
            await handleUserLoggedIn(session.user);
        } else {
            handleUserLoggedOut();
        }

        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                document.getElementById('loginPage').style.display = 'none';
                await handleUserLoggedIn(session.user);
            } else if (event === 'SIGNED_OUT') {
                handleUserLoggedOut();
            }
        });
    } catch (error) { console.error('🚨 Init Error:', error); }
}

async function handleUserLoggedIn(user) {
    try {
        let { data: profile, error } = await supabaseClient.from('users').select('*').eq('id', user.id).single();
        
        if (error && error.code === 'PGRST116') {
            const { data: newProfile } = await supabaseClient.from('users').insert([{ 
                id: user.id, 
                email: user.email, 
                display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture
            }]).select().single();
            // Note: Fixed potential undefined error here by checking error in next step if needed
            if (error) throw error;
            profile = newProfile;
        } else if (error) throw error;
        
        if (profile && profile.status === 'SUSPENDED') {
            alert('আপনার অ্যাকাউন্টটি সাসপেন্ড করা হয়েছে।');
            await supabaseClient.auth.signOut();
            return;
        }
        
        currentUser = { ...user, profile };
        
        // [UPDATED] হেডারে প্রোফাইল ছবি আপডেট করা
        updateHeaderProfileIcon(profile.photo_url);

        // [FIXED] ফেচ ইউজার রিয়্যাকশনস যোগ করা হয়েছে
        await Promise.all([
            fetchSavedPostIds(),
            fetchUserReactions() // NEW: Fetch user's reaction history
        ]);

        const pageId = document.body.id;
        if (pageId === 'home-page') {
            await initHomePage();
        } else if (pageId === 'profile-page') {
            await initProfilePage();
        }
        
        showAdminUI();
        loadNotifications();
        
    } catch (err) {
        console.error('🚨 Login Handler Error:', err);
        handleUserLoggedOut();
    }
}

function handleUserLoggedOut() {
    currentUser = null;
    savedPostIds.clear(); 
    // [FIXED] রিয়্যাকশন ক্যাশে ক্লিয়ার করা হয়েছে
    userLovedPrayers.clear();
    userAmeenedPrayers.clear();
    
    // [UPDATED] হেডারের ছবি রিসেট করা
    updateHeaderProfileIcon(null);

    const pageId = document.body.id;
    
    if (pageId === 'profile-page') {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('id')) { 
             window.location.href = '/index.html'; 
             return;
        }
        initProfilePage(); 
    }

    document.getElementById('loginPage').style.display = 'none';
    
    showAdminUI();
    if (prayersSubscription) { supabaseClient.removeChannel(prayersSubscription); prayersSubscription = null; }
    
    if (pageId === 'home-page') {
        renderStoriesList(document.getElementById('storyContainer')); 
        initHomePage();
    }
    updateNotificationBadge(0);
}

function showAdminUI() {
    const isAdmin = currentUser && ADMIN_USERS.includes(currentUser.email);
    const adminLink = document.getElementById('adminLink');
    const campaignAdminLink = document.getElementById('campaignAdminLink');
    
    if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
    if (campaignAdminLink) campaignAdminLink.style.display = isAdmin ? 'block' : 'none';
}

async function fetchSavedPostIds() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('saved_posts').select('post_id').eq('user_id', currentUser.id);
        if (error) throw error;
        savedPostIds = new Set(data.map(item => item.post_id));
    } catch (error) { console.error("Saved posts error:", error); }
}

// [FIXED] NEW FUNCTION: Fetch user's reaction history
async function fetchUserReactions() {
    if (!currentUser) return;
    
    try {
        // Get all prayers where user has loved
        const { data: lovedPrayers, error: loveError } = await supabaseClient
            .from('prayers')
            .select('id')
            .contains('loved_by', [currentUser.id]);
        
        if (loveError) throw loveError;
        
        // Get all prayers where user has ameened
        const { data: ameenedPrayers, error: ameenError } = await supabaseClient
            .from('prayers')
            .select('id')
            .contains('ameened_by', [currentUser.id]);
        
        if (ameenError) throw ameenError;
        
        // Store in global variables
        userLovedPrayers = new Set(lovedPrayers?.map(p => p.id) || []);
        userAmeenedPrayers = new Set(ameenedPrayers?.map(p => p.id) || []);
        
        console.log('User reactions loaded:', {
            loved: userLovedPrayers.size,
            ameened: userAmeenedPrayers.size
        });
        
    } catch (error) {
        console.error("Error fetching user reactions:", error);
    }
}

async function createNotification(userId, actorId, type, content, targetUrl) { 
    if (userId === actorId) return; 
    try { 
        await supabaseClient.from('notifications').insert({ user_id: userId, actor_id: actorId, type, content, target_url: targetUrl }); 
    } catch (error) { console.error('Notification create error:', error); } 
}

// ====================================
// 5. PROFILE PAGE LOGIC (UPDATED WITH COVER & PIC UPLOAD)
// ====================================
async function initProfilePage() {
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('id');

    if (!userId && currentUser) {
        userId = currentUser.id;
    } else if (!userId && !currentUser) {
        showLoginModal();
        return;
    }

    filteredUserId = userId; 
    const myPostsContainer = document.getElementById('myPostsContainer');
    
    document.getElementById('profileName').textContent = 'লোড হচ্ছে...';
    showSkeletonLoader(true, 'myPostsContainer');

    try {
        const { data: userProfile, error } = await supabaseClient
            .from('users')
            .select('*, cover_photo_url') 
            .eq('id', userId)
            .single();
            
        if (error) throw error;
        if (!userProfile) throw new Error("ব্যবহারকারী পাওয়া যায়নি।");

        document.getElementById('profileName').textContent = userProfile.display_name || 'নাম নেই';
        document.getElementById('profileAddress').textContent = userProfile.address || 'কোনো বায়ো নেই';
        
        const avatarEl = document.getElementById('profileAvatar');
        if (userProfile.photo_url) {
            avatarEl.innerHTML = `<img src="${userProfile.photo_url}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            avatarEl.textContent = (userProfile.display_name || 'U').charAt(0).toUpperCase();
            avatarEl.style.backgroundColor = generateAvatarColor(userProfile.display_name);
            avatarEl.innerHTML = (userProfile.display_name || 'U').charAt(0).toUpperCase();
        }

        const coverEl = document.getElementById('profileCoverDisplay');
        if (userProfile.cover_photo_url) {
            coverEl.src = userProfile.cover_photo_url;
            coverEl.style.display = 'block';
        } else {
            coverEl.style.display = 'none';
        }

        const [postsCount, followersCount, followingCount] = await Promise.all([
            supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).eq('author_uid', userId).eq('status', 'active'),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
        ]);

        document.getElementById('postCount').innerHTML = `<strong>${postsCount.count || 0}</strong> পোস্ট`;
        document.getElementById('followersCount').innerHTML = `<strong>${followersCount.count || 0}</strong> অনুসারী`;
        document.getElementById('followingCount').innerHTML = `<strong>${followingCount.count || 0}</strong> অনুসরণ`;

        const editBtn = document.getElementById('editProfileBtn');
        const followBtn = document.getElementById('followBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        
        const changeCoverBtn = document.getElementById('changeCoverBtn');
        const changeProfilePicBtn = document.getElementById('changeProfilePicBtn');
        
        editBtn.style.display = 'none';
        followBtn.style.display = 'none';
        signOutBtn.style.display = 'none';
        if(changeCoverBtn) changeCoverBtn.style.display = 'none';
        if(changeProfilePicBtn) changeProfilePicBtn.style.display = 'none';

        if (currentUser && currentUser.id === userId) {
            editBtn.style.display = 'inline-block';
            signOutBtn.style.display = 'inline-block';
            if(changeCoverBtn) changeCoverBtn.style.display = 'flex'; 
            if(changeProfilePicBtn) changeProfilePicBtn.style.display = 'flex';
            
            document.querySelectorAll('.tab-btn[data-tab="saved"], .tab-btn[data-tab="hidden"]').forEach(btn => btn.style.display = 'inline-block');
            
            setupProfileImageUploads(); 
        } else {
            followBtn.style.display = 'inline-block';
            followBtn.dataset.userId = userId;
            
            if (currentUser) {
                const { data: isFollowing } = await supabaseClient.from('followers').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single();
                if (isFollowing) {
                    followBtn.textContent = 'আনফলো';
                    followBtn.classList.add('following');
                } else {
                    followBtn.textContent = 'অনুসরণ করুন';
                    followBtn.classList.remove('following');
                }
            }
            document.querySelectorAll('.tab-btn[data-tab="saved"], .tab-btn[data-tab="hidden"]').forEach(btn => btn.style.display = 'none');
        }

        const warningsSection = document.getElementById('warnings-section');
        if (currentUser && currentUser.id === userId) {
            const { data: warnings } = await supabaseClient.from('user_warnings').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            if (warnings && warnings.length > 0) {
                const list = document.getElementById('warnings-list');
                list.innerHTML = warnings.map(w => `
                    <div style="background: white; padding: 10px; border-radius: 5px; border-left: 3px solid red; font-size: 14px;">
                        <strong>কারণ:</strong> ${w.reason}<br><small style="color: #666;">তারিখ: ${new Date(w.created_at).toLocaleDateString()}</small>
                    </div>`).join('');
                warningsSection.style.display = 'block';
            } else { warningsSection.style.display = 'none'; }
        } else { warningsSection.style.display = 'none'; }

        setupProfileTabs(userId);
        fetchMyPosts('active', userId);

    } catch (err) {
        console.error("Profile Load Error:", err);
        document.getElementById('profileName').textContent = 'ইউজার পাওয়া যায়নি';
        myPostsContainer.innerHTML = '<p style="text-align:center;">তথ্য লোড করতে সমস্যা হয়েছে।</p>';
    }
}

function setupProfileTabs(userId) {
    const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
    tabs.forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        newTab.addEventListener('click', (e) => {
            document.querySelectorAll('.profile-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            const tabName = e.target.dataset.tab; 
            const container = document.getElementById('myPostsContainer');
            container.innerHTML = '';
            showSkeletonLoader(true, 'myPostsContainer');
            
            currentPage = 0;
            noMorePrayers = false;
            fetchAndRenderPrayers(container, tabName, userId, true);
        });
    });
}

// ====================================
// 6. NOTIFICATION LOGIC
// ====================================
async function loadNotifications() { 
    if (!currentUser) return; 
    try { 
        const { count, error } = await supabaseClient.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false).eq('user_id', currentUser.id); 
        if (error) throw error; 
        updateNotificationBadge(count); 
        const { data: allNotifications, error: allError } = await supabaseClient.from('notifications').select('*, actor:actor_id(display_name, photo_url)').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20); 
        if (allError) throw allError; 
        renderNotifications(allNotifications); 
    } catch (error) { console.error('Load notifications error:', error); } 
}

function renderNotifications(notifications) { 
    const list = document.getElementById('notification-list-modal'); 
    if (!list) return; 
    if (!notifications || notifications.length === 0) { 
        list.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--light-text);">কোনো নোটিফিকেশন নেই।</p>'; 
        return; 
    } 
    list.innerHTML = notifications.map(n => ` 
        <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-url="${n.target_url}" data-type="${n.type}"> 
            <div class="avatar" style="background-color: ${generateAvatarColor(n.actor?.display_name || '?')}"> 
                ${n.actor?.photo_url ? `<img src="${n.actor.photo_url}" alt="">` : (n.actor?.display_name?.charAt(0) || '?')} 
            </div> 
            <div class="notification-content" style="flex: 1;"> 
                <p>${n.content}</p> 
                <small>${timeAgo(n.created_at)}</small> 
            </div>
            <button class="delete-notif-btn" data-id="${n.id}" title="ডিলিট করুন"><i class="fas fa-trash-alt"></i></button>
        </div> 
    `).join(''); 
}

function updateNotificationBadge(count) { 
    const badge = document.getElementById('notification-badge'); 
    if (badge) { 
        badge.textContent = count > 9 ? '9+' : count; 
        badge.style.display = count > 0 ? 'block' : 'none'; 
    } 
}

async function markNotificationAsRead(notificationId) { 
    try { await supabaseClient.from('notifications').update({ is_read: true }).eq('id', notificationId); loadNotifications(); } catch (error) { console.error('Mark read error:', error); } 
}

async function markAllAsRead() { 
    try { await supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false); loadNotifications(); } catch (error) { console.error('Mark all read error:', error); } 
}

async function deleteNotification(notificationId) {
    if(!confirm("আপনি কি এই নোটিফিকেশনটি ডিলিট করতে চান?")) return;
    try {
        const { error } = await supabaseClient.from('notifications').delete().eq('id', notificationId);
        if(error) throw error;
        const item = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
        if(item) item.remove();
        loadNotifications(); 
    } catch (error) { console.error("Delete notification error:", error); alert("ডিলিট করতে সমস্যা হয়েছে।"); }
}

async function clearAllNotifications() {
    if(!confirm("আপনি কি সব নোটিফিকেশন মুছে ফেলতে চান?")) return;
    try {
        const { error } = await supabaseClient.from('notifications').delete().eq('user_id', currentUser.id);
        if(error) throw error;
        loadNotifications();
        alert("সব নোটিফিকেশন মুছে ফেলা হয়েছে।");
    } catch (error) { console.error("Clear all error:", error); alert("সব ডিলিট করতে সমস্যা হয়েছে।"); }
}

// ====================================
// 7. NAVIGATION LOGIC
// ====================================
function setupNavigationLogic() {
    document.querySelectorAll('.nav-tab').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const isHomePage = document.body.id === 'home-page';

            // ১. যদি এটি পোস্ট করার বাটন বা প্রোফাইল পেজের লিংক হয়, তবে স্বাভাবিক কাজ করতে দিন
            if (link.id === 'addPostLink' || href?.includes('post.html') || href?.includes('profile.html')) {
                return; 
            }

            // ২. ফিক্স: যদি আমরা প্রোফাইল পেজে থাকি এবং ইউজার ব্যাক/হোম বাটনে ক্লিক করে
            // তাহলে জাভাস্ক্রিপ্ট আটকাতে বারণ করা হচ্ছে, যাতে index.html এ চলে যায়।
            if (!isHomePage && (href === '/index.html' || href === './index.html' || href === 'index.html')) {
                return; 
            }

            // ৩. শুধুমাত্র হোম পেজেই ফিড সুইচ করার জন্য ডিফল্ট একশন আটকানো হবে
            e.preventDefault();
            
            document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
            link.classList.add('active');
            
            if(link.id === 'videoFeedBtn') { 
                isVideoFeedActive = true; 
                initHomePage(); 
            } else { 
                isVideoFeedActive = false; 
                initHomePage(); 
            }
        });
    });
}

function handleHomeFeedSwitch() { isVideoFeedActive = false; currentFeedType = 'for_you'; filteredUserId = null; refreshFeed(); }
function handleVideoFeedSwitch() { isVideoFeedActive = true; currentFeedType = 'for_you'; filteredUserId = null; refreshFeed(); }
function handleFollowingFeedSwitch() { 
    if (!currentUser) { showLoginModal(); return; } 
    isVideoFeedActive = false; filteredUserId = null; 
    currentFeedType = (currentFeedType === 'for_you') ? 'following' : 'for_you'; 
    refreshFeed(); 
}

function refreshFeed() { 
    currentPage = 0; 
    noMorePrayers = false; 
    allFetchedPrayers.clear(); 
    const container = document.getElementById('feedContainer'); 
    if (container) { 
        container.innerHTML = ''; 
        fetchAndRenderPrayers(container, 'active', null, true); 
    } 
}

// ====================================
// 8. ADVANCED STORY EDITOR
// ====================================
function setupStoryEditor() {
    document.getElementById('createStoryBtn')?.addEventListener('click', (e) => { e.preventDefault(); if(!currentUser) { showLoginModal(); return; } openProStoryEditor(); });
    document.getElementById('closeStoryEditorBtn')?.addEventListener('click', closeStoryEditor);
    document.getElementById('tabTextBtn')?.addEventListener('click', () => switchEditorTab('text'));
    document.getElementById('tabMediaBtn')?.addEventListener('click', () => switchEditorTab('media'));
    document.getElementById('storyBgColorBtn')?.addEventListener('click', cycleBgColor);
    document.getElementById('openCameraBtn')?.addEventListener('click', initCamera);
    document.getElementById('recordBtn')?.addEventListener('click', toggleRecording);
    document.getElementById('storyMuteBtn')?.addEventListener('click', toggleMute);
    document.getElementById('resetMediaBtn')?.addEventListener('click', resetMediaState);
    document.getElementById('storyFileUpload')?.addEventListener('change', handleFileSelect);
    document.getElementById('publishStoryBtn')?.addEventListener('click', publishProStory);
}

function openProStoryEditor() {
    const modal = document.getElementById('storyCreateModal');
    if(!modal) return;
    resetEditorState();
    modal.style.display = 'flex';
    switchEditorTab('text'); 
}

function switchEditorTab(mode) {
    storyEditorState.mode = mode;
    document.querySelectorAll('.editor-tab-btn').forEach(b => b.classList.remove('active'));
    
    if(mode === 'text') {
        document.getElementById('tabTextBtn').classList.add('active');
        document.getElementById('textCanvas').style.display = 'flex';
        document.getElementById('mediaCanvas').style.display = 'none';
        document.getElementById('textModeTools').style.display = 'flex';
        
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
        stopCamera();
    } else {
        document.getElementById('tabMediaBtn').classList.add('active');
        document.getElementById('textCanvas').style.display = 'none';
        document.getElementById('mediaCanvas').style.display = 'flex';
        document.getElementById('textModeTools').style.display = 'none';
        
        document.getElementById('mediaPlaceholder').style.display = 'flex';
        document.getElementById('liveCameraFeed').style.display = 'none';
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
    }
}

async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        storyEditorState.stream = stream;
        const video = document.getElementById('liveCameraFeed');
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('mediaPlaceholder').style.display = 'none';
        document.getElementById('recordingArea').style.display = 'flex'; 
        document.getElementById('storyMuteBtn').style.display = 'flex'; 
        document.getElementById('storyImgPreview').style.display = 'none';
        document.getElementById('storyVidPreview').style.display = 'none';
    } catch (e) { console.warn("Camera error:", e); alert("ক্যামেরা চালু করা যাচ্ছে না। অনুমতি দিন।"); }
}

function stopCamera() {
    if(storyEditorState.stream) {
        storyEditorState.stream.getTracks().forEach(track => track.stop());
        storyEditorState.stream = null;
    }
    document.getElementById('liveCameraFeed').style.display = 'none';
}

function toggleRecording() {
    if (storyEditorState.isRecording) stopRecording();
    else startRecording();
}

function startRecording() {
    if (!storyEditorState.stream) return;
    storyEditorState.isRecording = true;
    storyEditorState.recordedChunks = [];
    document.getElementById('recordBtn').classList.add('recording');
    storyEditorState.stream.getAudioTracks().forEach(track => { track.enabled = !storyEditorState.isMuted; });
    try {
        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        storyEditorState.mediaRecorder = new MediaRecorder(storyEditorState.stream, options);
    } catch (e) { storyEditorState.mediaRecorder = new MediaRecorder(storyEditorState.stream); }
    storyEditorState.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) storyEditorState.recordedChunks.push(e.data); };
    storyEditorState.mediaRecorder.onstop = () => {
        const blob = new Blob(storyEditorState.recordedChunks, { type: 'video/webm' });
        storyEditorState.mediaBlob = blob;
        const videoURL = URL.createObjectURL(blob);
        const previewVid = document.getElementById('storyVidPreview');
        previewVid.src = videoURL; previewVid.style.display = 'block'; previewVid.controls = true;
        document.getElementById('liveCameraFeed').style.display = 'none';
        stopCamera();
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
        document.getElementById('resetMediaBtn').style.display = 'flex'; 
    };
    storyEditorState.mediaRecorder.start();
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI; 
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    let startTime = Date.now();
    const maxTime = storyEditorState.maxDuration * 1000; 
    storyEditorState.recordingTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / maxTime;
        const offset = circumference - (progress * circumference);
        circle.style.strokeDashoffset = offset;
        if (elapsed >= maxTime) stopRecording();
    }, 100);
}

function stopRecording() {
    if (!storyEditorState.isRecording) return;
    storyEditorState.isRecording = false;
    clearInterval(storyEditorState.recordingTimer);
    if (storyEditorState.mediaRecorder) storyEditorState.mediaRecorder.stop();
    document.getElementById('recordBtn').classList.remove('recording');
    const circle = document.querySelector('.progress-ring__circle');
    circle.style.strokeDashoffset = 226; 
}

function toggleMute() {
    storyEditorState.isMuted = !storyEditorState.isMuted;
    const btn = document.getElementById('storyMuteBtn');
    if(storyEditorState.isMuted) { btn.innerHTML = '<i class="fas fa-microphone-slash" style="color:red;"></i>'; } else { btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    storyEditorState.mediaFile = file;
    const url = URL.createObjectURL(file);
    stopCamera();
    document.getElementById('mediaPlaceholder').style.display = 'none';
    document.getElementById('resetMediaBtn').style.display = 'flex';
    const imgPrev = document.getElementById('storyImgPreview');
    const vidPrev = document.getElementById('storyVidPreview');
    if (file.type.startsWith('video/')) {
        imgPrev.style.display = 'none'; vidPrev.src = url; vidPrev.style.display = 'block'; vidPrev.play();
    } else {
        vidPrev.style.display = 'none'; vidPrev.pause(); imgPrev.src = url; imgPrev.style.display = 'block';
    }
}

function resetMediaState() {
    storyEditorState.mediaFile = null; storyEditorState.mediaBlob = null;
    document.getElementById('storyImgPreview').style.display = 'none';
    document.getElementById('storyVidPreview').style.display = 'none';
    document.getElementById('storyVidPreview').src = "";
    document.getElementById('mediaPlaceholder').style.display = 'flex';
    document.getElementById('resetMediaBtn').style.display = 'none';
}

function cycleBgColor() {
    currentGradientIndex = (currentGradientIndex + 1) % STORY_GRADIENTS.length;
    const bg = STORY_GRADIENTS[currentGradientIndex];
    document.getElementById('textCanvas').style.background = bg;
    storyEditorState.bgColor = bg;
}

function resetEditorState() {
    storyEditorState = { mode: 'text', mediaFile: null, mediaBlob: null, bgColor: STORY_GRADIENTS[0], isRecording: false, isMuted: false, recordingTimer: null, mediaRecorder: null, recordedChunks: [], stream: null, maxDuration: 30 };
    document.getElementById('storyTextInput').innerText = '';
    document.getElementById('storyCaptionInput').value = '';
    resetMediaState();
}

function closeStoryEditor() {
    stopCamera(); stopRecording(); document.getElementById('storyCreateModal').style.display = 'none';
}

async function publishProStory() {
    const btn = document.getElementById('publishStoryBtn');
    setLoading(btn, true);
    try {
        let mediaUrl = null; let type = 'text_image'; let textContent = ''; let blobToUpload = null;
        if (storyEditorState.mode === 'text') {
            const element = document.getElementById('textCanvas');
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            blobToUpload = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            textContent = document.getElementById('storyTextInput').innerText;
            type = 'text_image';
        } else {
            if (storyEditorState.mediaBlob) { blobToUpload = storyEditorState.mediaBlob; type = 'video'; } else if (storyEditorState.mediaFile) { blobToUpload = storyEditorState.mediaFile; type = storyEditorState.mediaFile.type.startsWith('video/') ? 'video' : 'image'; }
            textContent = document.getElementById('storyCaptionInput').value.trim();
        }
        if (!blobToUpload) throw new Error("কোনো কন্টেন্ট নেই।");
        const ext = type === 'video' ? 'webm' : 'jpg';
        const fileName = `story_${currentUser.id}_${Date.now()}.${ext}`;
        const { data, error } = await supabaseClient.storage.from('post_images').upload(fileName, blobToUpload);
        if (error) throw error;
        mediaUrl = supabaseClient.storage.from('post_images').getPublicUrl(data.path).data.publicUrl;
        const { error: insertError } = await supabaseClient.from('stories').insert([{
            user_id: currentUser.id, media_url: mediaUrl, media_type: type, text_content: textContent, background_color: storyEditorState.bgColor, duration: type === 'video' ? 30000 : 5000
        }]);
        if (insertError) throw insertError;
        alert("স্টোরি আপলোড সফল হয়েছে!");
        closeStoryEditor();
        fetchAndRenderStories();
    } catch (error) { console.error("Publish Error:", error); alert("সমস্যা হয়েছে: " + error.message); } finally { setLoading(btn, false); }
}

// ====================================
// 9. STORY VIEWER
// ====================================
async function fetchAndRenderStories() {
    const container = document.getElementById('storyContainer');
    if(!container) return;
    renderStoriesList(container);
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: stories, error } = await supabaseClient.from('stories').select('*, users:user_id(id, display_name, photo_url)').gt('created_at', yesterday).order('created_at', { ascending: true });
        if (error) throw error;
        const groups = {};
        stories.forEach(story => {
            const uid = story.user_id;
            if (!groups[uid]) { groups[uid] = { user: story.users, items: [] }; }
            groups[uid].items.push(story);
        });
        storyGroups = Object.values(groups);
        if (currentUser) {
            const myIndex = storyGroups.findIndex(g => g.user.id === currentUser.id);
            if (myIndex > -1) { const myGroup = storyGroups.splice(myIndex, 1)[0]; storyGroups.unshift(myGroup); }
        }
        renderStoriesList(container);
    } catch (error) { console.error("Fetch Stories Error:", error); }
}

function renderStoriesList(container) {
    if (!container) return;
    container.innerHTML = '';
    const addItem = document.createElement('div');
    addItem.className = 'story-item my-story';
    addItem.onclick = openProStoryEditor; 
    let myAvatar = '';
    if (currentUser && currentUser.profile?.photo_url) { myAvatar = `<img src="${currentUser.profile.photo_url}" style="width:100%;height:100%;object-fit:cover;">`; } else { myAvatar = `<div style="width:100%;height:100%;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:30px;color:#ccc;">+</div>`; }
    addItem.innerHTML = `<div class="story-preview" style="background:white; position:relative;">${myAvatar}<div class="my-story-add-icon"><i class="fas fa-plus"></i></div></div><span class="story-user-name">আপনার স্টোরি</span>`;
    container.appendChild(addItem);
    storyGroups.forEach((group, index) => {
        const item = document.createElement('div');
        item.className = 'story-item';
        item.onclick = () => openStoryViewer(index);
        const lastStory = group.items[group.items.length - 1];
        const user = group.user;
        let previewContent = '';
        if (lastStory.media_type === 'video') { previewContent = `<video src="${lastStory.media_url}#t=0.5" style="width:100%;height:100%;object-fit:cover;"></video>`; } else { previewContent = `<img src="${lastStory.media_url}" style="width:100%;height:100%;object-fit:cover;">`; }
        const userAvatar = user.photo_url ? `<img src="${user.photo_url}" class="story-avatar-overlay" style="position:absolute;top:5px;left:5px;width:35px;height:35px;border-radius:50%;border:2px solid #1877F2;">` : ``;
        item.innerHTML = `<div class="story-preview">${previewContent}<div class="story-overlay-gradient"></div>${userAvatar}</div><span class="story-user-name">${user.display_name.split(' ')[0]}</span>`;
        container.appendChild(item);
    });
}

function openStoryViewer(groupIndex) {
    storyViewerState.currentUserIndex = groupIndex; storyViewerState.currentStoryIndex = 0; storyViewerState.isOpen = true;
    document.getElementById('storyViewerModal').style.display = 'flex';
    renderStoryInViewer();
}

function renderStoryInViewer() {
    const group = storyGroups[storyViewerState.currentUserIndex];
    if (!group) { closeStoryViewer(); return; }
    const story = group.items[storyViewerState.currentStoryIndex];
    if (!story) { nextStoryUser(); return; }
    document.getElementById('storyProgressBars').innerHTML = group.items.map((_, idx) => `<div class="progress-bar-container" style="flex:1; margin:0 2px; background:rgba(255,255,255,0.3); height:3px; border-radius:2px;"><div class="progress-bar-fill-story" id="prog-${idx}" style="width:${idx < storyViewerState.currentStoryIndex ? '100%' : '0%'}; height:100%; background:white;"></div></div>`).join('');
    document.getElementById('storyUserInfo').innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><img src="${group.user.photo_url || './images/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;"><span style="font-weight:bold;">${group.user.display_name}</span><span style="opacity:0.7;font-size:12px;">${timeAgo(story.created_at)}</span></div>`;
    const mediaContainer = document.querySelector('.story-viewer-media');
    mediaContainer.innerHTML = '';
    const textOverlay = document.createElement('div');
    textOverlay.style.position = 'absolute'; textOverlay.style.bottom = '100px'; textOverlay.style.left = '0'; textOverlay.style.width = '100%'; textOverlay.style.textAlign = 'center'; textOverlay.style.color = 'white'; textOverlay.style.fontSize = '20px'; textOverlay.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)'; textOverlay.style.pointerEvents = 'none';
    if(story.text_content) textOverlay.innerText = story.text_content;
    let mediaEl;
    if (story.media_type === 'video') { mediaEl = document.createElement('video'); mediaEl.src = story.media_url; mediaEl.autoplay = true; mediaEl.playsInline = true; mediaEl.style.width = '100%'; mediaEl.onended = nextStoryItem; mediaEl.onerror = () => { console.warn("Video failed to load, skipping."); nextStoryItem(); }; } else { mediaEl = document.createElement('img'); mediaEl.src = story.media_url; mediaEl.style.width = '100%'; mediaEl.style.height = '100%'; mediaEl.style.objectFit = 'contain'; mediaEl.onerror = () => { console.warn("Image failed to load, skipping."); nextStoryItem(); }; startStoryTimer(5000); }
    mediaContainer.appendChild(mediaEl); mediaContainer.appendChild(textOverlay);
    const currentProg = document.getElementById(`prog-${storyViewerState.currentStoryIndex}`);
    if (currentProg) {
        currentProg.style.width = '0%'; currentProg.style.transition = 'none'; void currentProg.offsetWidth;
        if (story.media_type === 'video') { mediaEl.onloadedmetadata = () => { currentProg.style.transition = `width ${mediaEl.duration}s linear`; currentProg.style.width = '100%'; }; } else { currentProg.style.transition = `width 5s linear`; currentProg.style.width = '100%'; }
    }
}

function startStoryTimer(ms) { clearTimeout(storyViewerState.storyTimeout); storyViewerState.storyTimeout = setTimeout(nextStoryItem, ms); }
function nextStoryItem() { const group = storyGroups[storyViewerState.currentUserIndex]; if (group && storyViewerState.currentStoryIndex < group.items.length - 1) { storyViewerState.currentStoryIndex++; renderStoryInViewer(); } else { nextStoryUser(); } }
function nextStoryUser() { if (storyViewerState.currentUserIndex < storyGroups.length - 1) { storyViewerState.currentUserIndex++; storyViewerState.currentStoryIndex = 0; renderStoryInViewer(); } else { closeStoryViewer(); } }
function prevStoryItem() { if (storyViewerState.currentStoryIndex > 0) { storyViewerState.currentStoryIndex--; renderStoryInViewer(); } else { renderStoryInViewer(); } }
function closeStoryViewer() { document.getElementById('storyViewerModal').style.display = 'none'; clearTimeout(storyViewerState.storyTimeout); const vid = document.querySelector('.story-viewer-media video'); if(vid) vid.pause(); }

// ====================================
// 10. HOME & FEED LOGIC
// ====================================
async function initHomePage() {
    await fetchFundraisingPosts();
    await initializeShuffledFeed(); 
    await fetchAndRenderStories(); 
    
    const feedContainer = document.getElementById('feedContainer');
    if(feedContainer) fetchAndRenderPrayers(feedContainer, 'active', null, true);
    
    setupRealtimeSubscription();
    setupIntersectionObserver(); 
}

async function fetchFundraisingPosts() {
    try {
        const { data, error } = await supabaseClient
            .from('prayers')
            .select('*, users!author_uid(id, display_name, photo_url)')
            .eq('status', 'active')
            .eq('is_fundraising', true)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        if (data && data.length > 0) { 
            fundraisingPosts = data; 
            data.forEach(campaign => allFetchedPrayers.set(campaign.id, campaign)); 
        }
    } catch (err) { console.error("Fundraising fetch error:", err); }
}

async function initializeShuffledFeed() {
    if (isFeedInitialized) return;
    try {
        const { data, error } = await supabaseClient.from('prayers').select('id').eq('status', 'active').eq('is_fundraising', false);
        if (error) throw error;
        const ids = data.map(p => p.id);
        shuffledPrayerIds = shuffleArray(ids);
        isFeedInitialized = true;
    } catch (err) { console.error("Feed init error:", err); }
}

function setupIntersectionObserver() {
    const options = { root: null, rootMargin: '300px', threshold: 0.1 };
    feedObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !noMorePrayers) {
            const feedContainer = document.getElementById('feedContainer');
            if(feedContainer) fetchAndRenderPrayers(feedContainer, 'active', null, false);
        }
    }, options);
}

function manageLoadMoreTrigger(container) {
    const oldTrigger = document.getElementById('infinite-scroll-trigger');
    if (oldTrigger) { feedObserver.unobserve(oldTrigger); oldTrigger.remove(); }
    if (!noMorePrayers) {
        const trigger = document.createElement('div');
        trigger.id = 'infinite-scroll-trigger'; trigger.style.height = '50px'; trigger.style.textAlign = 'center'; trigger.style.padding = '20px';
        trigger.innerHTML = isLoadingMore ? '<div class="loader" style="border-color:#999;border-bottom-color:transparent;"></div>' : '<button class="text-btn" onclick="retryLoadFeed()">আরও লোড করুন</button>';
        container.appendChild(trigger);
        feedObserver.observe(trigger);
    }
}

window.retryLoadFeed = function() {
    const feedContainer = document.getElementById('feedContainer');
    if(feedContainer) fetchAndRenderPrayers(feedContainer, 'active', null, false);
};

const fetchAndRenderPrayers = async (container, status, userId = null, isInitialLoad = true) => {
    if (!container || isLoadingMore || noMorePrayers) return;
    isLoadingMore = true;
    if (isInitialLoad && currentPage === 0 && container.id !== 'myPostsContainer') { showSkeletonLoader(true); } else { const trigger = document.getElementById('infinite-scroll-trigger'); if(trigger) trigger.innerHTML = '<div class="loader" style="border-color:#999;border-bottom-color:transparent;"></div>'; }

    try {
        let prayerList = []; let error; const isProfilePage = document.body.id === 'profile-page';
        let query = supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)');

        if (isProfilePage && status === 'saved') {
            if (savedPostIds.size === 0 && currentUser) await fetchSavedPostIds();
            const savedIds = Array.from(savedPostIds);
            if (savedIds.length === 0) { prayerList = []; noMorePrayers = true; }
            else {
                const start = currentPage * prayersPerPage; const end = start + prayersPerPage;
                const idsToFetch = savedIds.slice(start, end);
                if (idsToFetch.length > 0) {
                     const { data, err } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').in('id', idsToFetch);
                    if (data) data.sort((a, b) => idsToFetch.indexOf(b.id) - idsToFetch.indexOf(a.id)); 
                    prayerList = data; error = err;
                } else { noMorePrayers = true; }
            }
        } 
        else if (!isProfilePage && currentFeedType === 'for_you' && !filteredUserId && !isVideoFeedActive) {
            const start = currentPage * prayersPerPage; const end = start + prayersPerPage;
            if(shuffledPrayerIds.length > 0) {
                const idsToFetch = shuffledPrayerIds.slice(start, end);
                if (idsToFetch.length > 0) {
                    const { data, err } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').in('id', idsToFetch);
                    if(data) { const idMap = new Map(data.map(item => [item.id, item])); prayerList = idsToFetch.map(id => idMap.get(id)).filter(Boolean); }
                    error = err;
                } else { noMorePrayers = true; }
            } else {
                 const { data, err } = await query.eq('status', 'active').eq('is_fundraising', false).order('created_at', {ascending: false}).range(start, end - 1);
                 prayerList = data; error = err;
            }
        } 
        else {
            if (isProfilePage && userId) {
                query = query.eq('author_uid', userId).eq('is_fundraising', false);
                if (status === 'hidden') query = query.eq('status', 'hidden'); else query = query.eq('status', 'active');
            } else if (currentFeedType === 'following' && currentUser) {
                const { data: followingData, error: followingError } = await supabaseClient.from('followers').select('following_id').eq('follower_id', currentUser.id);
                if (followingError) throw followingError;
                const followingIds = followingData.map(f => f.following_id);
                if (followingIds.length === 0) { prayerList = []; noMorePrayers = true; }
                else query = query.in('author_uid', followingIds).eq('status', 'active').eq('is_fundraising', false);
            } else if (filteredUserId) {
                query = query.eq('author_uid', filteredUserId).eq('status', 'active').eq('is_fundraising', false);
            } else if (isVideoFeedActive) {
                query = query.eq('status', 'active').eq('is_fundraising', false).not('uploaded_video_url', 'is', null);
            } else {
                query = query.eq('status', 'active').eq('is_fundraising', false);
            }

            if (!noMorePrayers) {
                const { data, err } = await query.order('created_at', { ascending: false }).range(currentPage * prayersPerPage, (currentPage + 1) * prayersPerPage - 1);
                prayerList = data; error = err;
            }
        }

        if (error) throw error;
        if (isInitialLoad) showSkeletonLoader(false, container.id === 'myPostsContainer' ? 'myPostsContainer' : null);

        if (prayerList && prayerList.length > 0) {
            const prayersWithUsers = prayerList.map(p => ({ ...p, users: p.users }));
            prayersWithUsers.forEach(p => allFetchedPrayers.set(p.id, p));
            renderPrayersFromList(container, prayersWithUsers, !isInitialLoad);
            currentPage++;
            if (prayerList.length < prayersPerPage) { noMorePrayers = true; }
        } else {
            if (isInitialLoad && container.innerHTML.trim() === '') {
                if (container.querySelector('.skeleton-card')) container.innerHTML = '';
                container.innerHTML = `<div class="no-results-message" style="text-align: center; padding: 40px;"><p style="font-size: 18px; color: #666;">এখনো কোনো পোস্ট নেই</p></div>`;
            }
            noMorePrayers = true;
        }
    } catch (err) {
        console.error("Fetch Error:", err); 
        showSkeletonLoader(false, container.id === 'myPostsContainer' ? 'myPostsContainer' : null);
        const trigger = document.getElementById('infinite-scroll-trigger');
        if(trigger) trigger.innerHTML = '<button class="text-btn" onclick="retryLoadFeed()">পুনরায় চেষ্টা করুন</button>';
    } finally { 
        isLoadingMore = false; 
        if (!noMorePrayers) manageLoadMoreTrigger(container);
        else { const t = document.getElementById('infinite-scroll-trigger'); if(t) t.remove(); }
    }
};

const fetchMyPosts = (tab, userId) => { const container = document.getElementById('myPostsContainer'); if (!container) return; fetchAndRenderPrayers(container, tab, userId); };

const renderPrayersFromList = (container, prayerList, shouldAppend = false) => {
    if (!container) return;
    let prayersToRender = [...prayerList];
    if (document.body.id === 'home-page' && currentFeedType === 'for_you' && !filteredUserId && !isVideoFeedActive && fundraisingPosts.length > 0) {
        const injectionIndex = 4; 
        if (prayersToRender.length >= injectionIndex) {
            const campaign = fundraisingPosts[currentFundraisingIndex % fundraisingPosts.length];
            const exists = prayersToRender.some(p => p.id === campaign.id);
            if (!exists) { prayersToRender.splice(injectionIndex, 0, campaign); currentFundraisingIndex++; allFetchedPrayers.set(campaign.id, campaign); }
        }
    }
    if (!shouldAppend) container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    prayersToRender.forEach(prayer => {
        if (!shouldAppend && document.getElementById(`prayer-${prayer.id}`)) return;
        let card;
        if (prayer.is_fundraising) { card = createFundraisingCardElement(prayer); } else if (prayer.is_poll) { card = createPollCardElement(prayer); } else { card = createPrayerCardElement(prayer); }
        if (card) fragment.appendChild(card);
    });
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (trigger && shouldAppend) { container.insertBefore(fragment, trigger); } else { container.appendChild(fragment); }
};

// ====================================
// 11. CARD CREATION & INTERACTION
// ====================================

function createPollCardElement(prayer) {
    const card = document.createElement('div'); card.className = 'prayer-card poll-card'; card.id = `prayer-${prayer.id}`;
    const author = prayer.users || {}; const authorName = author.display_name || 'নাম নেই'; const avatarStyle = `background-color: ${generateAvatarColor(authorName)}`; const initial = authorName.charAt(0).toUpperCase(); const avatarHTML = author.photo_url ? `<img src="${author.photo_url}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : initial;
    const options = prayer.poll_options || []; const votes = prayer.poll_votes || {}; const totalVotes = Object.keys(votes).length; const userVote = currentUser ? votes[currentUser.id] : null;
    const voteCounts = {}; options.forEach(opt => voteCounts[opt.id] = 0); Object.values(votes).forEach(optId => { if(voteCounts[optId] !== undefined) voteCounts[optId]++; });
    let pollHTML = `<div class="poll-container">`;
    options.forEach(opt => {
        const count = voteCounts[opt.id] || 0; const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100); const isSelected = userVote === opt.id; const highlightClass = isSelected ? 'selected' : '';
        if (userVote) { pollHTML += `<div class="poll-result-bar ${highlightClass}"><div class="fill" style="width: ${percent}%"></div><div class="label"><span>${opt.text} ${isSelected ? '<i class="fas fa-check-circle"></i>' : ''}</span><span class="percent">${percent}%</span></div></div>`; } else { pollHTML += `<button class="poll-option-btn" onclick="handlePollVote(${prayer.id}, ${opt.id})">${opt.text}</button>`; }
    });
    pollHTML += `<div class="poll-meta">${totalVotes} টি ভোট</div></div>`;
    const dropdownHTML = currentUser && currentUser.id === prayer.author_uid ? `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}"><button class="delete-post-btn" data-id="${prayer.id}"><i class="fas fa-trash-alt"></i> ডিলিট</button></div>` : `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}"><button class="report-content-btn" data-id="${prayer.id}" data-type="prayer"><i class="fas fa-flag"></i> রিপোর্ট করুন</button></div>`;
    card.innerHTML = `<div class="card-header"><a href="/profile.html?id=${prayer.author_uid}" class="avatar" style="${avatarStyle}">${avatarHTML}</a><div class="author-info"><a href="/profile.html?id=${prayer.author_uid}" class="author-name">${authorName}</a><div class="post-time">${timeAgo(prayer.created_at)}</div></div>${dropdownHTML}</div><div class="card-body"><h3 class="prayer-title">${prayer.title}</h3><p class="prayer-details">${linkifyText(prayer.details)}</p>${pollHTML}</div><div class="card-actions"><button class="action-btn love-btn ${prayer.loved_by && prayer.loved_by.includes(currentUser?.id) ? 'loved' : ''}" data-id="${prayer.id}"><i class="${prayer.loved_by && prayer.loved_by.includes(currentUser?.id) ? 'fas' : 'far'} fa-heart"></i> লাভ <span class="love-count">${prayer.love_count || 0}</span></button><a href="comments.html?postId=${prayer.id}" class="action-btn comment-btn" style="text-decoration:none;"><i class="far fa-comment-dots"></i> কমেন্ট</a></div>`;
    return card;
}

async function handlePollVote(prayerId, optionId) {
    if (!currentUser) { showLoginModal(); return; }
    try {
        const { data: post } = await supabaseClient.from('prayers').select('poll_votes').eq('id', prayerId).single();
        let currentVotes = post.poll_votes || {}; currentVotes[currentUser.id] = optionId;
        const { error } = await supabaseClient.from('prayers').update({ poll_votes: currentVotes }).eq('id', prayerId);
        if (error) throw error;
        post.poll_votes = currentVotes; allFetchedPrayers.set(prayerId, { ...allFetchedPrayers.get(prayerId), poll_votes: currentVotes });
        const card = document.getElementById(`prayer-${prayerId}`); if(card) card.replaceWith(createPollCardElement(allFetchedPrayers.get(prayerId)));
    } catch (err) { console.error("Voting failed:", err); alert("ভোট দিতে সমস্যা হয়েছে।"); }
}

function createFundraisingCardElement(campaign) {
    const card = document.createElement('div'); card.className = 'prayer-card fundraising-card'; card.id = `prayer-${campaign.id}`;
    const goal = campaign.goal_amount || 0; const current = campaign.current_amount || 0; const percentage = goal > 0 ? Math.min(100, (current / goal) * 100).toFixed(1) : 0;
    const imageSrc = campaign.image_url ? campaign.image_url : 'https://placehold.co/600x300/e7f3ff/1877f2?text=iPray+Campaign';
    const linkedDetails = linkifyText(campaign.details || '');
    let detailsHTML = `<p class="prayer-details">${linkedDetails.replace(/\n/g, '<br>')}</p>`;
    if (campaign.details && (campaign.details.length > 250 || (campaign.details.match(/\n/g) || []).length >= 5)) { detailsHTML = `<p class="prayer-details collapsed">${linkedDetails.replace(/\n/g, '<br>')}</p><button class="read-more-btn">আরও পড়ুন...</button>`; }
    card.innerHTML = `<div class="fundraising-hero"><div class="fundraising-badge"><i class="fas fa-hand-holding-heart"></i> সহায়তা প্রয়োজন</div><img data-src="${imageSrc}" alt="${campaign.title}" class="fundraising-image lazy-image"></div><div class="card-body fundraising-body"><h3 class="prayer-title fundraising-title">${campaign.title}</h3><div class="organizer-info"><div class="org-icon"><i class="fas fa-building"></i></div><span>আয়োজনে: <strong>${campaign.organization_name}</strong></span></div>${detailsHTML}<div class="fundraising-stats-box"><div class="stats-row"><div class="stat-item"><span class="stat-label">সংগৃহীত</span><span class="stat-value highlight">৳${current.toLocaleString('bn-BD')}</span></div><div class="stat-item text-right"><span class="stat-label">লক্ষ্য</span><span class="stat-value">৳${goal.toLocaleString('bn-BD')}</span></div></div><div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${percentage}%;"></div></div><div class="percentage-text">${percentage}% সম্পন্ন হয়েছে</div></div></div><div class="card-actions fundraising-actions"><button class="action-btn donate-btn-modern" data-id="${campaign.id}"><i class="fas fa-heart"></i> এখনই ডোনেট করুন</button><button class="action-btn share-btn" data-id="${campaign.id}" data-title="${campaign.title}" data-text="${(campaign.details || '').substring(0, 100)}"><i class="fas fa-share-alt"></i> শেয়ার</button></div>`;
    const lazyFundraisingImage = card.querySelector('.lazy-image'); if (lazyFundraisingImage) imageObserver.observe(lazyFundraisingImage);
    return card;
}

const createPrayerCardElement = (prayer) => {
    if (!prayer) return null;
    if (prayer.is_fundraising) return createFundraisingCardElement(prayer);
    if (prayer.is_poll) return createPollCardElement(prayer); 

    const card = document.createElement('div'); card.className = 'prayer-card'; card.id = `prayer-${prayer.id}`;
    const author = prayer.users || {}; const isAnonymous = prayer.is_anonymous || false; const authorName = isAnonymous ? 'আল্লাহর এক বান্দা' : (author.display_name || 'নাম নেই'); const authorPhotoURL = isAnonymous ? null : author.photo_url; 
    const profileLinkAttr = isAnonymous ? '' : `href="/profile.html?id=${prayer.author_uid}"`; 
    const profileLinkClass = isAnonymous ? '' : 'profile-link-trigger'; 
    const avatar = isAnonymous ? '<i class="fas fa-user-secret"></i>' : (authorPhotoURL ? `<img src="${authorPhotoURL}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (authorName.charAt(0) || '?')); const avatarStyle = isAnonymous ? 'background-color: #888;' : `background-color: ${generateAvatarColor(authorName)}`;
    
    // [FIXED] Check user reaction state - প্রথমে prayer object থেকে চেক, তারপর ক্যাশ থেকে
    let hasLoved = false, hasAmeened = false; 
    if (currentUser) { 
        // প্রথমে prayer object এর loved_by/ameened_by array থেকে চেক
        if (prayer.loved_by && Array.isArray(prayer.loved_by)) {
            hasLoved = prayer.loved_by.includes(currentUser.id);
        } else {
            // ক্যাশ থেকে চেক (লগইনের পর লোড করা হয়)
            hasLoved = userLovedPrayers.has(prayer.id);
        }
        
        if (prayer.ameened_by && Array.isArray(prayer.ameened_by)) {
            hasAmeened = prayer.ameened_by.includes(currentUser.id);
        } else {
            // ক্যাশ থেকে চেক
            hasAmeened = userAmeenedPrayers.has(prayer.id);
        }
    }
    
    const ameenCount = prayer.ameen_count || 0; const loveCount = prayer.love_count || 0;
    const viewCount = prayer.view_count || 0; 

    const linkedDetails = linkifyText(prayer.details || ''); 
    let detailsHTML = `<p class="prayer-details">${linkedDetails.replace(/\n/g, '<br>')}</p>`; 
    if (prayer.details && (prayer.details.length > 250 || (prayer.details.match(/\n/g) || []).length >= 5)) { detailsHTML = `<p class="prayer-details collapsed">${linkedDetails.replace(/\n/g, '<br>')}</p><button class="read-more-btn">আরও পড়ুন...</button>`; }
    
    const videoHTML = prayer.youtube_url && getYouTubeEmbedUrl(prayer.youtube_url) ? `<div class="video-container"><iframe src="${getYouTubeEmbedUrl(prayer.youtube_url)}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>` : ''; 
    const imageHTML = prayer.image_url ? `<div class="post-image-container"><img data-src="${prayer.image_url}" alt="পোস্টের ছবি" class="post-image lazy-image"></div>` : ''; 
    
    const uploadedVideoHTML = prayer.uploaded_video_url ? `<div class="post-video-container"><video src="${prayer.uploaded_video_url}" class="post-video" controls playsinline poster="${prayer.video_thumbnail_url || ''}" preload="metadata" onplay="handleVideoView(${prayer.id})"></video></div>` : ''; 
    const audioHTML = prayer.audio_url ? `<div class="audio-player-container" style="margin-top: 15px;"><audio controls class="post-audio" style="width: 100%;" preload="none"><source src="${prayer.audio_url}" type="audio/webm">আপনার ব্রাউজার অডিও সমর্থন করে না।</audio></div>` : '';
    
    const commentButtonHTML = `<a href="comments.html?postId=${prayer.id}" class="action-btn comment-btn" style="text-decoration: none;"><i class="far fa-comment-dots"></i> কমেন্ট</a>`; 
    
    const isSaved = currentUser && savedPostIds.has(prayer.id);
    const saveButtonHTML = `<button class="action-btn save-btn ${isSaved ? 'saved' : ''}" data-id="${prayer.id}" title="${isSaved ? 'আনসেভ' : 'সেভ'}"><i class="${isSaved ? 'fas' : 'far'} fa-bookmark"></i></button>`;
    
    let dropdownHTML = ''; 
    const isMyPost = currentUser && currentUser.id === prayer.author_uid;
    if (isMyPost) { 
        const hideButton = prayer.status === 'hidden' ? `<button class="unhide-post-btn" data-id="${prayer.id}"><i class="fas fa-eye"></i> দেখান</button>` : `<button class="hide-post-btn" data-id="${prayer.id}"><i class="fas fa-eye-slash"></i> লুকান</button>`; 
        const answeredButton = prayer.is_answered ? `<button class="toggle-answered-btn" data-id="${prayer.id}" data-current="true"><i class="fas fa-times-circle"></i> আনমার্ক করুন</button>` : `<button class="toggle-answered-btn" data-id="${prayer.id}" data-current="false"><i class="fas fa-check-circle"></i> দোয়া কবুল হয়েছে</button>`; 
        dropdownHTML = `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}">${answeredButton}<button class="edit-post-btn" data-id="${prayer.id}"><i class="fas fa-pencil-alt"></i> এডিট</button>${hideButton}<button class="delete-post-btn" data-id="${prayer.id}"><i class="fas fa-trash-alt"></i> ডিলিট</button></div>`; 
    } else { 
        dropdownHTML = `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}"><button class="report-content-btn" data-id="${prayer.id}" data-type="prayer"><i class="fas fa-flag"></i> রিপোর্ট করুন</button></div>`; 
    }
    
    const answeredBadgeHTML = prayer.is_answered ? `<div class="answered-badge"><i class="fas fa-check-circle"></i> আলহামদুলিল্লাহ, দোয়া কবুল হয়েছে</div>` : '';
    const shareTextRaw = prayer.details ? prayer.details.substring(0, 100) : '';

    let statsHTML = `<span><i class="fas fa-praying-hands"></i> <span class="ameen-count">${ameenCount}</span>&nbsp;<i class="fas fa-heart" style="color:var(--love-color)"></i> <span class="love-count">${loveCount}</span></span>`;
    if (prayer.uploaded_video_url) {
        statsHTML = `<span><i class="fas fa-play" style="font-size:10px;"></i> <span id="view-count-${prayer.id}">${viewCount}</span> ভিউ &nbsp;&bull;&nbsp; <i class="fas fa-praying-hands"></i> <span class="ameen-count">${ameenCount}</span>&nbsp;<i class="fas fa-heart" style="color:var(--love-color)"></i> <span class="love-count">${loveCount}</span></span>`;
    }
    
    card.innerHTML = `<div class="card-header"><a class="avatar ${profileLinkClass}" ${profileLinkAttr} style="${avatarStyle}">${avatar}</a><div class="author-info"><a class="author-name ${profileLinkClass}" ${profileLinkAttr}>${authorName}</a><div class="post-time">${timeAgo(prayer.created_at)}</div></div>${dropdownHTML}</div><div class="card-body">${answeredBadgeHTML}<h3 class="prayer-title">${prayer.title || 'শিরোনাম নেই'}</h3>${detailsHTML}${imageHTML}${uploadedVideoHTML}${videoHTML}${audioHTML}</div><div class="card-stats">${statsHTML}<span class="comment-count-text">${prayer.comment_count || 0} টি কমেন্ট</span></div><div class="card-actions"><button class="action-btn ameen-btn ${hasAmeened ? 'ameened' : ''}" data-id="${prayer.id}"><i class="fas fa-praying-hands"></i> আমিন</button><button class="action-btn love-btn ${hasLoved ? 'loved' : ''}" data-id="${prayer.id}"><i class="${hasLoved ? 'fas' : 'far'} fa-heart"></i> লাভ</button>${commentButtonHTML}<button class="action-btn share-btn" data-id="${prayer.id}" data-title="${prayer.title || 'দোয়ার আবেদন'}" data-text="${shareTextRaw}"><i class="fas fa-share-alt"></i> শেয়ার</button>${saveButtonHTML}</div>`;
    
    const lazyImage = card.querySelector('.lazy-image'); if(lazyImage) imageObserver.observe(lazyImage);
    const media = card.querySelector('.post-video, .post-audio'); if(media) mediaObserver.observe(media);

    return card;
}

async function handleVideoView(videoId) {
    if (viewedVideosSession.has(videoId)) return;
    try {
        const { error } = await supabaseClient.rpc('increment_view_count', { post_id: videoId });
        if (error) throw error;
        viewedVideosSession.add(videoId);
        const countSpan = document.getElementById(`view-count-${videoId}`);
        if (countSpan) {
            let currentCount = parseInt(countSpan.innerText.replace(/,/g, '')) || 0;
            countSpan.innerText = (currentCount + 1).toLocaleString('bn-BD');
        }
    } catch (err) { console.error("View count error:", err); }
}

// ====================================
// 12. DONATION SYSTEM LOGIC
// ====================================
function openGeneralDonationModal() {
    const modal = document.getElementById('generalDonationModal');
    if (modal) {
        modal.style.display = 'flex';
        loadAdminPaymentMethods(); 
    }
}

async function loadAdminPaymentMethods() {
    const container = document.getElementById('adminPaymentMethods');
    if (!container) return;
    container.innerHTML = '<p>লোড হচ্ছে...</p>';

    try {
        const { data, error } = await supabaseClient.from('system_settings').select('setting_value').eq('setting_key', 'payment_numbers').single();
        if (error) throw error;
        
        if (data && data.setting_value) {
            adminPaymentNumbers = JSON.parse(data.setting_value);
            let html = '';
            
            const methods = [
                { key: 'bkash', name: 'Bkash', active: adminPaymentNumbers.bkash_active, num: adminPaymentNumbers.bkash, logo: './images/bkash.png' },
                { key: 'nagad', name: 'Nagad', active: adminPaymentNumbers.nagad_active, num: adminPaymentNumbers.nagad, logo: './images/nagad.png' },
                { key: 'rocket', name: 'Rocket', active: adminPaymentNumbers.rocket_active, num: adminPaymentNumbers.rocket, logo: './images/rocket.png' },
                { key: 'upay', name: 'Upay', active: adminPaymentNumbers.upay_active, num: adminPaymentNumbers.upay, logo: './images/upay.png' },
                { key: 'surecash', name: 'SureCash', active: adminPaymentNumbers.surecash_active, num: adminPaymentNumbers.surecash, logo: './images/surecash.png' },
                { key: 'taptap', name: 'TapTap', active: adminPaymentNumbers.taptap_active, num: adminPaymentNumbers.taptap, logo: './images/taptap.png' }
            ];

            methods.forEach(m => {
                if(m.active && m.num) {
                    html += `
                        <div class="pay-option" onclick="selectGenPaymentMethod('${m.name}', '${m.num}')">
                            <img src="${m.logo}" alt="${m.name}" onerror="this.style.display='none'">
                            <span>${m.name}</span>
                        </div>
                    `;
                }
            });
            
            if(html === '') html = '<p>বর্তমানে কোনো পেমেন্ট মেথড সক্রিয় নেই।</p>';
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Payment load error:", error);
        container.innerHTML = '<p>পেমেন্ট তথ্য লোড করা যায়নি।</p>';
    }
}

window.selectGenPaymentMethod = function(name, number) {
    document.getElementById('genMethodName').innerText = name;
    document.getElementById('genTargetNumber').innerText = number;
    
    document.querySelectorAll('.pay-option').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    document.getElementById('genPaymentForm').style.display = 'block';
};

window.copyGenNumber = function() {
    const num = document.getElementById('genTargetNumber').innerText;
    if(num) {
        navigator.clipboard.writeText(num).then(() => alert('নাম্বার কপি হয়েছে!'));
    }
};

window.switchDonationTab = function(tabName) {
    document.querySelectorAll('.profile-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('donateTabContent').style.display = 'none';
    document.getElementById('historyTabContent').style.display = 'none';
    
    if(tabName === 'donate') {
        document.querySelector('button[onclick="switchDonationTab(\'donate\')"]').classList.add('active');
        document.getElementById('donateTabContent').style.display = 'block';
    } else {
        document.querySelector('button[onclick="switchDonationTab(\'history\')"]').classList.add('active');
        document.getElementById('historyTabContent').style.display = 'block';
        loadDonationHistory();
    }
};

async function handleGeneralDonationSubmit(e) {
    e.preventDefault();
    if(!currentUser) { showLoginModal(); return; }
    
    const amount = document.getElementById('genAmount').value;
    const sender = document.getElementById('genSender').value;
    const trxId = document.getElementById('genTrxId').value;
    const method = document.getElementById('genMethodName').innerText;
    
    if(!amount || !sender || !trxId) return;
    
    const btn = e.target.querySelector('button');
    setLoading(btn, true);
    
    try {
        const { error } = await supabaseClient.from('donation_requests').insert({
            user_id: currentUser.id,
            amount: amount,
            sender_number: sender,
            trx_id: trxId,
            payment_method: method,
            status: 'PENDING'
        });
        
        if(error) throw error;
        alert('আপনার তথ্য জমা হয়েছে। এডমিন যাচাই করে অ্যাপ্রুভ করবেন।');
        e.target.reset();
        document.getElementById('generalDonationModal').style.display = 'none';
    } catch(err) {
        console.error(err);
        alert('সমস্যা হয়েছে।');
    } finally {
        setLoading(btn, false);
    }
}

async function loadDonationHistory() {
    if(!currentUser) return;
    const container = document.getElementById('donationHistoryList');
    container.innerHTML = '<p style="text-align:center;">লোড হচ্ছে...</p>';
    
    try {
        const { data, error } = await supabaseClient
            .from('donation_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
            
        if(error) throw error;
        
        if(!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;">কোনো হিস্ট্রি নেই।</p>';
            return;
        }
        
        container.innerHTML = data.map(d => `
            <div class="notification-item" style="cursor:default;">
                <div style="flex:1;">
                    <strong>৳ ${d.amount}</strong> (${d.payment_method})
                    <br><small>${new Date(d.created_at).toLocaleDateString()}</small>
                </div>
                <div>
                    <span class="badge" style="background:${d.status === 'APPROVED' ? '#27ae60' : (d.status === 'REJECTED' ? '#c0392b' : '#f39c12')}; color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${d.status}</span>
                </div>
            </div>
        `).join('');
        
    } catch(err) {
        container.innerHTML = '<p>হিস্ট্রি লোড করা যায়নি।</p>';
    }
}

window.openDonationConfirmation = function() {
    if(!currentUser) { showLoginModal(); return; }
    if(!activeDonationCampaignId) return;

    const modalBody = document.getElementById('donationDetailsBody');
    modalBody.innerHTML = `
        <h3>ডোনেশন কনফার্ম করুন</h3>
        <form id="campaignDonationForm">
            <div class="form-group"><label>টাকার পরিমাণ</label><input type="number" id="campAmount" required></div>
            <div class="form-group"><label>আপনার নাম্বার (প্রেরক)</label><input type="text" id="campSender" required></div>
            <div class="form-group"><label>TrxID</label><input type="text" id="campTrxId" required></div>
            <div class="form-group"><label>পেমেন্ট মেথড</label>
                <select id="campMethod">
                    <option value="Bkash">Bkash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Rocket">Rocket</option>
                    <option value="Bank">Bank</option>
                </select>
            </div>
            <button type="submit" class="btn-full-width">জমা দিন</button>
        </form>
    `;
    
    document.getElementById('campaignDonationForm').addEventListener('submit', submitDonationDetails);
};

async function submitDonationDetails(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    setLoading(btn, true);
    
    const amount = document.getElementById('campAmount').value;
    const sender = document.getElementById('campSender').value;
    const trxId = document.getElementById('campTrxId').value;
    const method = document.getElementById('campMethod').value;
    
    try {
        const { error } = await supabaseClient.from('donation_requests').insert({
            user_id: currentUser.id,
            prayer_id: activeDonationCampaignId,
            amount: amount,
            sender_number: sender,
            trx_id: trxId,
            payment_method: method,
            status: 'PENDING'
        });
        
        if(error) throw error;
        alert('ধন্যবাদ! আপনার ডোনেশন তথ্য জমা হয়েছে।');
        document.getElementById('donationModal').style.display = 'none';
    } catch(err) {
        alert('সমস্যা হয়েছে: ' + err.message);
    } finally {
        setLoading(btn, false);
    }
}

// ====================================
// 13. EVENTS & GLOBAL HANDLERS (UPDATED)
// ====================================
function setupEventListeners() {
    document.addEventListener('click', handleGlobalClick);
    setupFormSubmissions();
    setupSearchFunctionality();
    
    // Notification & Story Modals
    document.getElementById('notificationBtn')?.addEventListener('click', () => document.getElementById('notificationModal').classList.add('active'));
    document.getElementById('closeNotificationModalBtn')?.addEventListener('click', () => document.getElementById('notificationModal').classList.remove('active'));
    document.getElementById('mark-all-read-btn-modal')?.addEventListener('click', markAllAsRead);
    document.getElementById('clear-all-notif-btn')?.addEventListener('click', clearAllNotifications);
    document.getElementById('closeStoryViewerBtn')?.addEventListener('click', closeStoryViewer); 
    document.getElementById('nextStoryBtn')?.addEventListener('click', nextStoryItem); 
    document.getElementById('prevStoryBtn')?.addEventListener('click', prevStoryItem);
    document.getElementById('submitReportBtn')?.addEventListener('click', handleReportSubmit);
    document.getElementById('submitGeneralDonation')?.addEventListener('submit', handleGeneralDonationSubmit);
}

async function handleFollow(btn) {
    if (!currentUser) { document.getElementById('loginPage').style.display = 'flex'; return; }
    const userIdToFollow = btn.dataset.userId;
    const isFollowing = btn.classList.contains('following');
    setLoading(btn, true);
    try {
        if (isFollowing) {
            const { error } = await supabaseClient.from('followers').delete().match({ follower_id: currentUser.id, following_id: userIdToFollow });
            if (error) throw error;
            btn.textContent = 'অনুসরণ করুন'; btn.classList.remove('following');
        } else {
            const { error } = await supabaseClient.from('followers').insert({ follower_id: currentUser.id, following_id: userIdToFollow });
            if (error) throw error;
            btn.textContent = 'আনফলো'; btn.classList.add('following');
            const notificationContent = `${currentUser.profile.display_name} আপনাকে অনুসরণ করা শুরু করেছেন।`;
            await createNotification(userIdToFollow, currentUser.id, 'follow', notificationContent, `/profile.html?id=${currentUser.id}`);
        }
        const { count } = await supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userIdToFollow);
        document.getElementById('followersCount').innerHTML = `<strong>${count || 0}</strong> অনুসারী`;
    } catch (error) { alert('দুঃখিত, প্রক্রিয়াটি সম্পন্ন করা যায়নি।'); console.error('Follow/Unfollow error:', error); } finally { setLoading(btn, false); }
}

async function handleGlobalClick(e) {
    // ১. নোটিফিকেশন ডিলিট বাটন
    const deleteNotifBtn = e.target.closest('.delete-notif-btn');
    if(deleteNotifBtn) { e.stopPropagation(); deleteNotification(deleteNotifBtn.dataset.id); return; }

    // ২. প্রোফাইল লিংক (লগইন চেক)
    const profileLink = e.target.closest('a[href="/profile.html"]');
    if (profileLink && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    // ৩. গ্লোবাল ডোনেট বাটন
    if (e.target.closest('#globalDonateBtn')) { openGeneralDonationModal(); return; }

    // ৪. ফলো বাটন
    const followBtn = e.target.closest('#followBtn'); if (followBtn) { handleFollow(followBtn); return; }
    
    // ৫. নোটিফিকেশন আইটেম ক্লিক
    if (e.target.closest('.notification-item')) { 
        const item = e.target.closest('.notification-item'); 
        const url = item.dataset.url; 
        if (!e.target.closest('.delete-notif-btn')) {
            markNotificationAsRead(item.dataset.id); 
            if (url && url.startsWith('post_id=')) { 
                const prayerId = parseInt(url.split('=')[1]); 
                if (!isNaN(prayerId)) { window.location.href = `comments.html?postId=${prayerId}`; } 
            } else if (url && url.startsWith('/profile')) {
                window.location.href = url;
            }
            document.getElementById('notificationModal').classList.remove('active'); 
        }
        return; 
    }
    
    // ৬. স্টোরি ক্লিক
    const storyItem = e.target.closest('.story-item:not(.my-story)'); if (storyItem) { return; }
    
    // ৭. শেয়ার বাটন
    const shareBtn = e.target.closest('.share-btn'); 
    if (shareBtn) { 
        const prayerId = shareBtn.dataset.id; 
        const prayerTitle = shareBtn.dataset.title; 
        const prayerText = shareBtn.dataset.text || '';
        const url = `${window.location.origin}/comments.html?postId=${prayerId}`;
        const fullShareText = `${prayerTitle}\n\n${prayerText}\n\nআমিন বলতে নিচের লিংকে ক্লিক করুন:\n${url}`;
        if (navigator.share) { navigator.share({ title: prayerTitle, text: fullShareText, url: url }).catch(error => console.log('শেয়ার এরর:', error)); } else { navigator.clipboard.writeText(fullShareText).then(() => { alert('লিংক কপি হয়েছে!'); }, () => { alert('কপি করা যায়নি।'); }); } 
        return; 
    }
    
    // ৮. ইমেজ ভিউয়ার
    const postImage = e.target.closest('.post-image, .fundraising-image'); if (postImage) { const modal = document.getElementById('image-view-modal'); const modalImg = document.getElementById('modal-image'); modal.style.display = "flex"; modalImg.src = postImage.dataset.src || postImage.src; return; }
    const closeImageModal = e.target.closest('.close-image-modal, .image-modal'); if (closeImageModal && !e.target.closest('.image-modal-content')) { document.getElementById('image-view-modal').style.display = "none"; return; }
    const loginPage = document.getElementById('loginPage'); if (loginPage && loginPage.style.display === 'flex' && !e.target.closest('.login-box')) { return; }
    
    const profileTrigger = e.target.closest('.profile-link-trigger'); 
    if (profileTrigger && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    const dropdownTrigger = e.target.closest('.actions-menu-trigger'); if (dropdownTrigger) { document.querySelectorAll('.dropdown-menu').forEach(d => { if (d.id !== dropdownTrigger.dataset.dropdownId) d.style.display = 'none'; }); const targetDropdown = document.getElementById(dropdownTrigger.dataset.dropdownId); if (targetDropdown) targetDropdown.style.display = targetDropdown.style.display === 'block' ? 'none' : 'block'; return; }
    if (!e.target.closest('.dropdown-menu')) { document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none'); }
    if (e.target.closest('.close-btn')) { const modal = e.target.closest('.modal'); if(modal) modal.style.display = 'none'; }
    
    if (e.target.closest('#googleSignInBtn')) handleGoogleSignIn();
    if (e.target.closest('#facebookSignInBtn')) handleFacebookSignIn();
    
    // Updated: Async Sign Out
    if (e.target.closest('#signOutBtn')) {
        await supabaseClient.auth.signOut();
        handleUserLoggedOut(); // Explicitly call UI update
    }
    
    if (e.target.closest('#sendOtpBtn')) handleSendOtp();
    if (e.target.closest('#verifyOtpBtn')) handleVerifyOtp();
    if (e.target.closest('#backToPhoneBtn')) { document.getElementById('otpInputStep').style.display = 'none'; document.getElementById('phoneInputStep').style.display = 'block'; }

    const addPostLink = e.target.closest('#addPostLink'); if (addPostLink && !currentUser) { e.preventDefault(); showLoginModal(); }
    const saveBtn = e.target.closest('.save-btn'); if (saveBtn) { handleSavePost(saveBtn); return; }
    
    const donateBtn = e.target.closest('.donate-btn, .donate-btn-modern');
    if (donateBtn) {
        const campaignId = parseInt(donateBtn.dataset.id, 10);
        const campaignData = allFetchedPrayers.get(campaignId);
        
        if (campaignData) {
            activeDonationCampaignId = campaignId;
            const modalBody = document.getElementById('donationDetailsBody');
            let methodsHtml = '';
            
            if (campaignData.payment_details && campaignData.payment_details.methods && Array.isArray(campaignData.payment_details.methods)) {
                methodsHtml = campaignData.payment_details.methods.map(m => {
                    const logos = { 'bkash': './images/bkash.png', 'nagad': './images/nagad.png', 'rocket': './images/rocket.png', 'upay': './images/upay.png', 'bank': './images/bank.png' };
                    const logoSrc = logos[m.type] || logos['bank'];
                    return `<div class="pay-row-display"><div class="pay-info-left"><img src="${logoSrc}" alt="${m.type}" onerror="this.style.display='none'"><div><div class="pay-number">${m.number}</div><div class="pay-type">${m.mode}</div></div></div><button class="copy-btn-small" onclick="navigator.clipboard.writeText('${m.number}').then(() => alert('নাম্বার কপি হয়েছে!'))"><i class="fas fa-copy"></i></button></div>`;
                }).join('');
            } else if (campaignData.payment_details && campaignData.payment_details.info) {
                 methodsHtml = `<div class="payment-info"><pre>${campaignData.payment_details.info}</pre></div>`;
            } else {
                 methodsHtml = `<p>কোনো পেমেন্ট তথ্য পাওয়া যায়নি।</p>`;
            }

            let otherInfoHtml = '';
            if (campaignData.payment_details && campaignData.payment_details.other_info) {
                otherInfoHtml = `<div class="other-info-box"><strong>নোট:</strong> ${campaignData.payment_details.other_info}</div>`;
            }

            modalBody.innerHTML = `<p style="text-align:center; margin-bottom:15px;"><strong>${campaignData.organization_name}</strong>-কে সহায়তা করুন।</p>${methodsHtml}${otherInfoHtml}<div class="donation-submit-section"><p style="font-size:12px; color:#666; text-align:center;">টাকা পাঠানোর পর নিচের বাটনে ক্লিক করে তথ্য দিন (ঐচ্ছিক)</p><button class="btn-full-width" style="margin-top:10px; background:#2c3e50;" onclick="openDonationConfirmation()">ডোনেশন কনফার্ম করুন</button></div>`;
            document.getElementById('donationModal').style.display = 'flex';
        }
        return;
    }

    // === [FIXED] রিয়্যাকশন বাটন হ্যান্ডলিং ===
    if (e.target.closest('.ameen-btn') || e.target.closest('.love-btn')) {
        const btn = e.target.closest('.action-btn');
        const id = parseInt(btn.dataset.id, 10);
        const type = btn.classList.contains('love-btn') ? 'love' : 'ameen';
        handleReaction(id, type, btn);
        return;
    }

    const editPostBtn = e.target.closest('.edit-post-btn'); if (editPostBtn) handleEditPost(editPostBtn);
    const deletePostBtn = e.target.closest('.delete-post-btn'); if (deletePostBtn) handleDeletePost(deletePostBtn);
    const hidePostBtn = e.target.closest('.hide-post-btn'); if (hidePostBtn) handleHidePost(hidePostBtn);
    const unhidePostBtn = e.target.closest('.unhide-post-btn'); if (unhidePostBtn) handleUnhidePost(unhidePostBtn);
    const toggleAnsweredBtn = e.target.closest('.toggle-answered-btn'); if (toggleAnsweredBtn) handleToggleAnswered(toggleAnsweredBtn);
    const editProfileBtn = e.target.closest('#editProfileBtn'); if (editProfileBtn) handleEditProfile();
    const reportBtn = e.target.closest('.report-content-btn'); if (reportBtn) { if (!currentUser) { showLoginModal(); return; } showReportModal(reportBtn.dataset.id, reportBtn.dataset.type); const dropdown = reportBtn.closest('.dropdown-menu'); if (dropdown) dropdown.style.display = 'none'; }
    if (e.target.closest('.read-more-btn')) { const btn = e.target.closest('.read-more-btn'); const details = btn.previousElementSibling; details.classList.toggle('collapsed'); btn.textContent = details.classList.contains('collapsed') ? 'আরও পড়ুন...' : 'সংক্ষিপ্ত করুন'; }
}

async function handleActionButtonClick(actionBtn) { 
    if (!currentUser) { showLoginModal(); return; } 
    const prayerId = parseInt(actionBtn.dataset.id, 10); 
    if (isNaN(prayerId)) return; 
    
    if (actionBtn.classList.contains('ameen-btn')) handleReaction(prayerId, 'ameen', actionBtn); 
    else if (actionBtn.classList.contains('love-btn')) handleReaction(prayerId, 'love', actionBtn); 
}

// Updated Google Sign In with Force Account Selection
async function handleGoogleSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'google', 
            options: { 
                redirectTo: 'https://alaminsarkar-bsc.github.io/',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent select_account' // Forces account chooser
                }
            } 
        }); 
        if (error) throw error; 
    } catch (error) { 
        alert('গুগল সাইনইনে সমস্যা হয়েছে: ' + error.message); 
    } 
}


async function handleFacebookSignIn() { try { const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: window.location.origin } }); if (error) throw error; } catch (error) { alert('ফেসবুক সাইনইনে সমস্যা হয়েছে: ' + error.message); } }

async function handleSendOtp() {
    const phoneInput = document.getElementById('phoneInput'); const btn = document.getElementById('sendOtpBtn');
    let phone = phoneInput.value.trim(); if (!phone) { alert("মোবাইল নাম্বার দিন।"); return; }
    if (!phone.startsWith('+')) { if (phone.startsWith('01')) { phone = '+88' + phone; } else { alert("সঠিক ফরম্যাটে নাম্বার দিন (যেমন: 017... অথবা +88017...)"); return; } }
    setLoading(btn, true);
    try { const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone }); if (error) throw error; document.getElementById('phoneInputStep').style.display = 'none'; document.getElementById('otpInputStep').style.display = 'block'; alert("কোড পাঠানো হয়েছে।"); } catch (error) { console.error("OTP Error:", error); alert("সমস্যা হয়েছে: " + error.message); } finally { setLoading(btn, false); }
}
async function handleVerifyOtp() {
    const phoneInput = document.getElementById('phoneInput'); const otpInput = document.getElementById('otpInput'); const btn = document.getElementById('verifyOtpBtn');
    let phone = phoneInput.value.trim(); if (!phone.startsWith('+') && phone.startsWith('01')) { phone = '+88' + phone; }
    const token = otpInput.value.trim(); if (!token) { alert("কোডটি লিখুন।"); return; }
    setLoading(btn, true);
    try { const { data, error } = await supabaseClient.auth.verifyOtp({ phone: phone, token: token, type: 'sms' }); if (error) throw error; if (data.session) { document.getElementById('loginPage').style.display = 'none'; alert("লগইন সফল হয়েছে!"); } } catch (error) { console.error("Verify Error:", error); alert("ভুল কোড। আবার চেষ্টা করুন।"); } finally { setLoading(btn, false); }
}

// [FIXED] Reaction Handler with RPC & Optimistic UI and Local Cache Update
async function handleReaction(prayerId, type, btn) {
    if (!currentUser) { 
        showLoginModal(); 
        return; 
    }

    prayerId = parseInt(prayerId, 10);
    if (isNaN(prayerId)) return;

    btn.disabled = true;

    const isLove = type === 'love';
    
    // DOM Selector
    const card = document.getElementById(`prayer-${prayerId}`);
    if (!card) return;
    
    const countSpan = card.querySelector(isLove ? '.love-count' : '.ameen-count');
    const icon = btn.querySelector('i');

    // Get current state from DOM
    let currentCount = parseInt((countSpan.innerText || '0').replace(/,/g, ''), 10);
    if (isNaN(currentCount)) currentCount = 0;

    const wasActive = btn.classList.contains(isLove ? 'loved' : 'ameened');
    const newActiveState = !wasActive;
    const newCount = newActiveState ? (currentCount + 1) : Math.max(0, currentCount - 1);

    // Optimistic Update
    btn.classList.toggle(isLove ? 'loved' : 'ameened', newActiveState);
    countSpan.innerText = newCount; 
    
    if (isLove && icon) {
        icon.className = newActiveState ? 'fas fa-heart' : 'far fa-heart';
    }

    try {
        // Call RPC function
        const { error } = await supabaseClient.rpc('toggle_reaction', {
            p_id: prayerId,
            u_id: currentUser.id,
            r_type: type
        });

        if (error) throw error;

        // [FIXED] Update local caches based on reaction type
        if (isLove) {
            if (newActiveState) {
                userLovedPrayers.add(prayerId);
            } else {
                userLovedPrayers.delete(prayerId);
            }
        } else {
            if (newActiveState) {
                userAmeenedPrayers.add(prayerId);
            } else {
                userAmeenedPrayers.delete(prayerId);
            }
        }

        // Update prayer in local cache
        const prayer = allFetchedPrayers.get(prayerId);
        if (prayer) {
            const listKey = isLove ? 'loved_by' : 'ameened_by';
            const countKey = isLove ? 'love_count' : 'ameen_count';
            
            let list = prayer[listKey] || [];
            if (newActiveState) {
                if (!list.includes(currentUser.id)) list.push(currentUser.id);
            } else {
                list = list.filter(id => id !== currentUser.id);
            }
            
            prayer[listKey] = list;
            prayer[countKey] = newCount;
            allFetchedPrayers.set(prayerId, prayer);
        }

        // Send notification if liked/ameened someone else's post
        if (newActiveState && prayer && prayer.author_uid !== currentUser.id) {
            const notifMsg = `${currentUser.profile.display_name} আপনার দোয়ায় ${isLove ? 'লাভ' : 'আমিন'} দিয়েছেন।`;
            createNotification(prayer.author_uid, currentUser.id, type, notifMsg, `post_id=${prayerId}`);
        }

    } catch (error) {
        console.error('Reaction error:', error);
        
        // Rollback on error
        btn.classList.toggle(isLove ? 'loved' : 'ameened', wasActive);
        countSpan.innerText = currentCount;
        if (isLove && icon) {
            icon.className = wasActive ? 'fas fa-heart' : 'far fa-heart';
        }
        
        alert("নেটওয়ার্ক সমস্যার কারণে রিয়্যাকশন সেভ হয়নি।");
    } finally {
        setTimeout(() => { btn.disabled = false; }, 300);
    }
}

async function handleSavePost(btn) {
    if (!currentUser) { showLoginModal(); return; }
    const prayerId = parseInt(btn.dataset.id, 10); if (isNaN(prayerId)) return;
    btn.disabled = true; const isSaved = savedPostIds.has(prayerId);
    try {
        if (isSaved) { const { error } = await supabaseClient.from('saved_posts').delete().match({ user_id: currentUser.id, post_id: prayerId }); if (error) throw error; savedPostIds.delete(prayerId); } 
        else { const { error } = await supabaseClient.from('saved_posts').insert({ user_id: currentUser.id, post_id: prayerId }); if (error) throw error; savedPostIds.add(prayerId); }
        btn.classList.toggle('saved', !isSaved); btn.querySelector('i').className = !isSaved ? 'fas fa-bookmark' : 'far fa-bookmark'; btn.title = !isSaved ? 'আনসেভ' : 'সেভ';
    } catch (error) { alert('দুঃখিত, সমস্যা হয়েছে।'); console.error('Save/Unsave error:', error); } finally { btn.disabled = false; }
}

function showReportModal(contentId, contentType) { const reportModal = document.getElementById('reportModal'); if (!reportModal) return; const reportForm = document.getElementById('reportForm'); if (reportForm) reportForm.reset(); document.getElementById('reportContentId').value = contentId; document.getElementById('reportContentType').value = contentType; reportModal.style.display = 'flex'; }
async function handleReportSubmit() { const btn = document.getElementById('submitReportBtn'); const contentId = document.getElementById('reportContentId').value; const contentType = document.getElementById('reportContentType').value; const category = document.getElementById('reportCategory').value; const description = document.getElementById('reportDescription').value; if (!category) { alert('ক্যাটেগরি নির্বাচন করুন।'); return; } setLoading(btn, true); const success = await reportSystem.submitReport(contentId, contentType, category, description); setLoading(btn, false); if (success) { const reportModal = document.getElementById('reportModal'); if (reportModal) reportModal.style.display = 'none'; } }
function setupFormSubmissions() { const editPrayerForm = document.getElementById('editPrayerForm'); if (editPrayerForm) editPrayerForm.addEventListener('submit', handleEditPostSubmit); const editProfileForm = document.getElementById('editProfileForm'); if (editProfileForm) editProfileForm.addEventListener('submit', handleEditProfileSubmit); }
async function handleEditPost(btn) { const prayerId = btn.dataset.id; const prayer = allFetchedPrayers.get(parseInt(prayerId, 10)); if (prayer) { document.getElementById('editPrayerId').value = prayerId; document.getElementById('editPrayerTitleInput').value = prayer.title; document.getElementById('editPrayerDetailsTextarea').value = prayer.details; document.getElementById('editYoutubeLinkInput').value = prayer.youtube_url || ''; document.getElementById('editPrayerModal').style.display = 'flex'; } }
async function handleDeletePost(btn) {
    const prayerId = parseInt(btn.dataset.id, 10); 
    if (confirm('আপনি কি এই পোস্টটি মুছতে চান?')) {
        try {
            const { data: postData, error: fetchError } = await supabaseClient.from('prayers').select('image_url, uploaded_video_url, audio_url, video_thumbnail_url').eq('id', prayerId).single(); if (fetchError) throw fetchError;
            const filesToDelete = []; const urls = [postData.image_url, postData.uploaded_video_url, postData.audio_url, postData.video_thumbnail_url]; const buckets = ['post_images', 'post_videos', 'audio_prayers', 'video_thumbnails'];
            urls.forEach((url, index) => { if (url) { try { const path = new URL(url).pathname.split(`/${buckets[index]}/`)[1]; if (path) filesToDelete.push({ bucket: buckets[index], path: decodeURIComponent(path) }); } catch (e) { console.error(`URL Error: ${url}`, e); } } });
            if (filesToDelete.length > 0) { const deletePromises = filesToDelete.map(file => supabaseClient.storage.from(file.bucket).remove([file.path])); await Promise.all(deletePromises); }
            const { error: deleteError } = await supabaseClient.from('prayers').delete().eq('id', prayerId); if (deleteError) throw deleteError;
            allFetchedPrayers.delete(prayerId); const card = document.getElementById(`prayer-${prayerId}`) || document.querySelector(`.prayer-card-placeholder[data-prayer-id="${prayerId}"]`); if (card) card.remove();
        } catch (error) { console.error('Delete error:', error); alert('ডিলিট করতে সমস্যা হয়েছে।'); }
    }
}
async function handleHidePost(btn) { const prayerId = btn.dataset.id; const { error } = await supabaseClient.from('prayers').update({ status: 'hidden' }).eq('id', prayerId); if (!error) { alert('লুকানো হয়েছে।'); if(document.body.id === 'profile-page') { initProfilePage(); } } else { alert('সমস্যা: ' + error.message); } }
async function handleUnhidePost(btn) { const prayerId = btn.dataset.id; const { error } = await supabaseClient.from('prayers').update({ status: 'active' }).eq('id', prayerId); if (!error) { alert('সক্রিয় করা হয়েছে।'); if(document.body.id === 'profile-page') { initProfilePage(); } } else { alert('সমস্যা: ' + error.message); } }
async function handleToggleAnswered(btn) { const prayerId = parseInt(btn.dataset.id, 10); const newAnsweredStatus = btn.dataset.current !== 'true'; const { error } = await supabaseClient.from('prayers').update({ is_answered: newAnsweredStatus }).eq('id', prayerId); if (!error) { const { data: updatedPrayer } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').eq('id', prayerId).single(); if (updatedPrayer) { allFetchedPrayers.set(prayerId, updatedPrayer); const card = document.getElementById(`prayer-${prayerId}`); if (card) card.replaceWith(createPrayerCardElement(updatedPrayer)); } } else { alert('সমস্যা: ' + error.message); } }
function handleEditProfile() { document.getElementById('editNameInput').value = currentUser.profile?.display_name || ''; document.getElementById('editAddressInput').value = currentUser.profile?.address || ''; document.getElementById('editProfileModal').style.display = 'flex'; }
async function handleEditPostSubmit(e) { e.preventDefault(); const btn = document.getElementById('savePrayerBtn'); const prayerId = parseInt(document.getElementById('editPrayerId').value, 10); setLoading(btn, true); const updateData = { title: document.getElementById('editPrayerTitleInput').value, details: document.getElementById('editPrayerDetailsTextarea').value, youtube_url: document.getElementById('editYoutubeLinkInput').value }; const { error } = await supabaseClient.from('prayers').update(updateData).eq('id', prayerId); if (!error) { document.getElementById('editPrayerModal').style.display = 'none'; const { data: updatedPrayer } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').eq('id', prayerId).single(); if (updatedPrayer) { allFetchedPrayers.set(prayerId, updatedPrayer); const card = document.getElementById(`prayer-${prayerId}`); if (card) card.replaceWith(createPrayerCardElement(updatedPrayer)); } } else { alert('আপডেট করতে সমস্যা: ' + error.message); } setLoading(btn, false); }
async function handleEditProfileSubmit(e) { e.preventDefault(); await supabaseClient.from('users').update({ display_name: document.getElementById('editNameInput').value, address: document.getElementById('editAddressInput').value }).eq('id', currentUser.id); document.getElementById('editProfileModal').style.display = 'none'; if (document.body.id === 'profile-page') initProfilePage(); }
const scrollToTopBtn = document.getElementById('scrollToTopBtn'); if (scrollToTopBtn) { window.addEventListener('scroll', throttle(() => { scrollToTopBtn.classList.toggle('show', window.scrollY > 100); }, 200)); scrollToTopBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); }); }

// সার্চ ফাংশনালিটি
function setupSearchFunctionality() { 
    const searchBtn = document.getElementById('searchBtn'); 
    const searchInput = document.getElementById('searchInput'); 
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            searchInput.classList.toggle('visible'); 
            if (searchInput.classList.contains('visible')) searchInput.focus(); 
        });
        searchInput.addEventListener('input', (e) => { 
            const searchText = e.target.value.toLowerCase().trim(); 
            const feedContainer = document.getElementById('feedContainer'); 
            const prayersArray = Array.from(allFetchedPrayers.values()); 
            if (searchText === '') { 
                if (prayersArray.length > 0) renderPrayersFromList(feedContainer, prayersArray); 
            } else { 
                const filteredPrayers = prayersArray.filter(p => (p.title.toLowerCase().includes(searchText) || p.details.toLowerCase().includes(searchText) || (p.users?.display_name || '').toLowerCase().includes(searchText))); 
                renderPrayersFromList(feedContainer, filteredPrayers); 
            } 
        }); 
    }
    document.addEventListener('click', (e) => { 
        if (searchInput && !e.target.closest('.floating-search-box') && !e.target.closest('#searchBtn')) {
            searchInput.classList.remove('visible'); 
        }
    }); 
}

function setupSingleMediaPlayHandler() { document.addEventListener('play', (event) => { if (event.target.matches('.post-video, .post-audio')) { const allMediaElements = document.querySelectorAll('.post-video, .post-audio'); allMediaElements.forEach(media => { if (media !== event.target) { media.pause(); } }); } }, true); }

function setupRealtimeSubscription() { 
    if (prayersSubscription) { supabaseClient.removeChannel(prayersSubscription); prayersSubscription = null; } 
    
    prayersSubscription = supabaseClient.channel('public-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prayers' }, handlePrayerChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, handleCommentChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => { 
            if (currentUser && payload.new.user_id === currentUser.id) loadNotifications(); 
        })
        .subscribe(); 
}

// [UPDATED] Realtime Update Handler (Prevents Flickering)
async function handlePrayerChange(payload) {
    if (document.visibilityState !== 'visible') return; 
    
    const { eventType, new: newRecord, old: oldRecord } = payload; 
    const container = document.getElementById('feedContainer') || document.getElementById('myPostsContainer'); 
    
    const prayerId = newRecord?.id || oldRecord?.id; 
    if (!prayerId) return;

    if (eventType === 'INSERT') { 
        if (!container) return;
        
        // ফান্ডরাইজিং হলে আলাদা লজিক
        if (newRecord.is_fundraising) { 
            fetchFundraisingPosts(); 
            return;
        } 
        
        shuffledPrayerIds.unshift(prayerId);
        
        // নতুন পোস্টের জন্য ইউজারের নাম/ছবি দরকার, তাই একবার ফেচ করা লাগবে
        const { data: newPrayer } = await supabaseClient
            .from('prayers')
            .select('*, users!author_uid(id, display_name, photo_url)')
            .eq('id', prayerId)
            .single(); 
            
        if (newPrayer) { 
            allFetchedPrayers.set(prayerId, newPrayer); 
            if (isVideoFeedActive && !newPrayer.uploaded_video_url && !newPrayer.youtube_url) return;
            
            // ফিল্টার লজিক অনুযায়ী রেন্ডার
            if (!filteredUserId || (filteredUserId && newPrayer.author_uid === filteredUserId)) {
                container.prepend(createPrayerCardElement(newPrayer)); 
            }
        } 
    }
    else if (eventType === 'UPDATE') { 
        const existingCard = document.getElementById(`prayer-${prayerId}`); 
        
        // নতুন ডাটা সরাসরি payload থেকে নেওয়া (ফাস্ট আপডেট)
        // ইউজার ইনফো payload এ থাকে না, তাই আগের ক্যাশ থেকে নেওয়া
        const cachedPrayer = allFetchedPrayers.get(prayerId);
        const updatedPrayer = { ...cachedPrayer, ...newRecord }; 
        
        if (updatedPrayer) {
            allFetchedPrayers.set(prayerId, updatedPrayer);
            
            if (existingCard) {
                // ১. আমিন আপডেট (কেবল সংখ্যা আপডেট, ক্লাস ফ্লিকার রোধ)
                const ameenCountSpan = existingCard.querySelector('.ameen-count');
                const ameenBtn = existingCard.querySelector('.ameen-btn');
                if (ameenCountSpan) ameenCountSpan.innerText = updatedPrayer.ameen_count || 0;
                
                // শুধুমাত্র যদি সার্ভার থেকে সম্পূর্ণ অ্যারে আসে, তবেই ক্লাস টগল করুন
                // নতুবা অপটিমিস্টিক UI ঠিক থাকবে
                if (currentUser && ameenBtn && updatedPrayer.ameened_by) {
                    const hasAmeened = updatedPrayer.ameened_by.includes(currentUser.id);
                    ameenBtn.classList.toggle('ameened', hasAmeened);
                }

                // ২. লাভ আপডেট
                const loveCountSpan = existingCard.querySelector('.love-count');
                const loveBtn = existingCard.querySelector('.love-btn');
                if (loveCountSpan) loveCountSpan.innerText = updatedPrayer.love_count || 0;
                
                if (currentUser && loveBtn && updatedPrayer.loved_by) {
                    const hasLoved = updatedPrayer.loved_by.includes(currentUser.id);
                    loveBtn.classList.toggle('loved', hasLoved);
                    const icon = loveBtn.querySelector('i');
                    if(icon) icon.className = hasLoved ? 'fas fa-heart' : 'far fa-heart';
                }

                // ৩. ভিউ বা কমেন্ট কাউন্ট আপডেট
                const viewCountSpan = document.getElementById(`view-count-${prayerId}`);
                if (viewCountSpan) viewCountSpan.innerText = (updatedPrayer.view_count || 0).toLocaleString('bn-BD');
                
                const commentCountSpan = existingCard.querySelector('.comment-count-text');
                if (commentCountSpan) commentCountSpan.innerText = `${updatedPrayer.comment_count || 0} টি কমেন্ট`;
                
                // ৪. দোয়া কবুল ব্যাজ আপডেট
                if (updatedPrayer.is_answered && !existingCard.querySelector('.answered-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'answered-badge';
                    badge.innerHTML = '<i class="fas fa-check-circle"></i> আলহামদুলিল্লাহ, দোয়া কবুল হয়েছে';
                    const body = existingCard.querySelector('.card-body');
                    if(body) body.prepend(badge);
                } else if (!updatedPrayer.is_answered && existingCard.querySelector('.answered-badge')) {
                    existingCard.querySelector('.answered-badge').remove();
                }
            }
        }
    }
    else if (eventType === 'DELETE') { 
        allFetchedPrayers.delete(oldRecord.id); 
        if (!oldRecord.is_fundraising) { 
            shuffledPrayerIds = shuffledPrayerIds.filter(id => id !== oldRecord.id); 
        } 
        const card = document.getElementById(`prayer-${oldRecord.id}`);
        if(card) card.remove(); 
    }
}

function handleCommentChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const prayerId = newRecord?.prayer_id || oldRecord?.prayer_id;
    if (!prayerId) return;

    if (eventType === 'INSERT' && currentUser && newRecord.author_uid === currentUser.id) {
        return;
    }

    const card = document.getElementById(`prayer-${prayerId}`);
    const prayerData = allFetchedPrayers.get(prayerId);

    if (eventType === 'INSERT') {
        if (card) {
            const countSpan = card.querySelector('.comment-count-text');
            if (countSpan) {
                const currentText = countSpan.innerText;
                const currentCount = parseInt(currentText) || 0;
                countSpan.innerText = `${currentCount + 1} টি কমেন্ট`;
            }
        }
        if (prayerData) {
            prayerData.comment_count = (prayerData.comment_count || 0) + 1;
            allFetchedPrayers.set(prayerId, prayerData);
        }
    } else if (eventType === 'DELETE') {
        if (card) {
            const countSpan = card.querySelector('.comment-count-text');
            if (countSpan) {
                const currentText = countSpan.innerText;
                const currentCount = parseInt(currentText) || 0;
                countSpan.innerText = `${Math.max(0, currentCount - 1)} টি কমেন্ট`;
            }
        }
        if (prayerData) {
            prayerData.comment_count = Math.max(0, (prayerData.comment_count || 0) - 1);
            allFetchedPrayers.set(prayerId, prayerData);
        }
    }
}

// ====================================
// NEW: UPDATE HEADER PROFILE ICON
// ====================================
function updateHeaderProfileIcon(photoUrl) {
    const profileTab = document.querySelector('.header-nav-row a[href="/profile.html"]');
    if (!profileTab) return;
    if (photoUrl) {
        profileTab.innerHTML = `<img src="${photoUrl}" class="header-profile-img" alt="Profile">`;
    } else {
        profileTab.innerHTML = `<i class="fas fa-user-circle"></i>`;
    }
}

// ====================================
// NEW: PROFILE IMAGE UPLOAD LOGIC
// ====================================
function setupProfileImageUploads() {
    // বাটন ক্লিক ইভেন্ট
    const coverBtn = document.getElementById('changeCoverBtn');
    const profileBtn = document.getElementById('changeProfilePicBtn');
    const coverInput = document.getElementById('coverPicInput');
    const profileInput = document.getElementById('profilePicInput');

    if(coverBtn) {
        const newCoverBtn = coverBtn.cloneNode(true);
        coverBtn.parentNode.replaceChild(newCoverBtn, coverBtn);
        newCoverBtn.addEventListener('click', () => document.getElementById('coverPicInput').click());
    }

    if(profileBtn) {
        const newProfileBtn = profileBtn.cloneNode(true);
        profileBtn.parentNode.replaceChild(newProfileBtn, profileBtn);
        newProfileBtn.addEventListener('click', () => document.getElementById('profilePicInput').click());
    }

    if(coverInput) {
        coverInput.onchange = (e) => handleProfileImageUpload(e, 'cover');
    }
    if(profileInput) {
        profileInput.onchange = (e) => handleProfileImageUpload(e, 'profile');
    }
}

async function handleProfileImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("ফাইলের আকার খুব বেশি! ৫ এমবির নিচে হতে হবে।");
        return;
    }

    const loadingModal = document.getElementById('uploadProgressModal');
    if(loadingModal) loadingModal.style.display = 'flex';

    try {
        const dbColumn = type === 'cover' ? 'cover_photo_url' : 'photo_url';
        const { data: userData, error: fetchError } = await supabaseClient
            .from('users')
            .select(dbColumn)
            .eq('id', currentUser.id)
            .single();

        if (fetchError) throw fetchError;

        const oldUrl = userData ? userData[dbColumn] : null;

        if (oldUrl) {
            try {
                const pathParts = oldUrl.split('/post_images/'); 
                if (pathParts.length > 1) {
                    const oldPath = pathParts[1]; 
                    await supabaseClient.storage.from('post_images').remove([oldPath]);
                }
            } catch (delErr) { console.warn("Old image delete failed:", delErr); }
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${type}_${currentUser.id}_${Date.now()}.${fileExt}`;
        const filePath = `${type}s/${fileName}`;

        const { data, error: uploadError } = await supabaseClient.storage
            .from('post_images')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabaseClient.storage
            .from('post_images')
            .getPublicUrl(filePath);
            
        const imageUrl = publicUrlData.publicUrl;

        const updateData = {};
        updateData[dbColumn] = imageUrl;

        const { error: dbError } = await supabaseClient
            .from('users')
            .update(updateData)
            .eq('id', currentUser.id);

        if (dbError) throw dbError;

        if (type === 'cover') {
            const imgEl = document.getElementById('profileCoverDisplay');
            imgEl.src = imageUrl;
            imgEl.style.display = 'block';
        } else {
            const avatarEl = document.getElementById('profileAvatar');
            avatarEl.innerHTML = `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;">`;
            
            if(currentUser.profile) {
                currentUser.profile[dbColumn] = imageUrl;
            }
            updateHeaderProfileIcon(imageUrl);
        }

        alert("আপলোড সফল হয়েছে!");

    } catch (error) {
        console.error("Upload Error:", error);
        alert("আপলোড করতে সমস্যা হয়েছে: " + error.message);
    } finally {
        if(loadingModal) loadingModal.style.display = 'none';
        e.target.value = '';
    }
}
