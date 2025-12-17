// ====================================================================
// FILE: auth.js
// বিবরণ: অথেন্টিকেশন, প্রোফাইল, ভেরিফাইড ব্যাজ, হাইলাইটস লোডিং এবং OneSignal
// ====================================================================

console.log("Auth Module Loaded Successfully");

// ====================================================================
// 1. লগইন মেথডসমূহ
// ====================================================================

async function handleGoogleSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'google', 
            options: { redirectTo: 'https://doa-angina.vercel.app/', queryParams: { access_type: 'offline', prompt: 'consent select_account' } } 
        }); 
        if (error) throw error; 
    } catch (error) { alert('Google Login Error: ' + error.message); } 
}

async function handleFacebookSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: window.location.origin } }); 
        if (error) throw error; 
    } catch (error) { alert('Facebook Login Error: ' + error.message); } 
}

async function handleSendOtp() {
    const phoneInput = document.getElementById('phoneInput'); 
    const btn = document.getElementById('sendOtpBtn');
    let phone = phoneInput.value.trim(); 
    
    if (!phone) { alert("মোবাইল নাম্বার দিন।"); return; }
    if (!phone.startsWith('+')) { 
        if (phone.startsWith('01')) phone = '+88' + phone; 
        else { alert("সঠিক ফরম্যাটে নাম্বার দিন (+880...)"); return; } 
    }
    
    setLoading(btn, true);
    try { 
        const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone }); 
        if (error) throw error; 
        document.getElementById('phoneInputStep').style.display = 'none'; 
        document.getElementById('otpInputStep').style.display = 'block'; 
        alert("কোড পাঠানো হয়েছে।"); 
    } catch (error) { 
        console.error("OTP Error:", error); alert("সমস্যা হয়েছে: " + error.message); 
    } finally { setLoading(btn, false); }
}

async function handleVerifyOtp() {
    const phoneInput = document.getElementById('phoneInput'); 
    const otpInput = document.getElementById('otpInput'); 
    const btn = document.getElementById('verifyOtpBtn');
    let phone = phoneInput.value.trim(); 
    if (!phone.startsWith('+') && phone.startsWith('01')) phone = '+88' + phone;
    const token = otpInput.value.trim(); 
    
    if (!token) { alert("কোডটি লিখুন।"); return; }
    
    setLoading(btn, true);
    try { 
        const { data, error } = await supabaseClient.auth.verifyOtp({ phone: phone, token: token, type: 'sms' }); 
        if (error) throw error; 
        if (data.session) { 
            document.getElementById('loginPage').style.display = 'none'; 
            alert("লগইন সফল হয়েছে!"); 
        } 
    } catch (error) { 
        console.error("Verify Error:", error); alert("ভুল কোড। আবার চেষ্টা করুন।"); 
    } finally { setLoading(btn, false); }
}

// ====================================================================
// 2. মেইন লগইন হ্যান্ডলার
// ====================================================================

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
            if (error) throw error;
            profile = newProfile;
        } else if (error) throw error;
        
        if (profile && profile.status === 'SUSPENDED') {
            alert('আপনার অ্যাকাউন্টটি সাসপেন্ড করা হয়েছে।');
            await supabaseClient.auth.signOut();
            return;
        }
        
        currentUser = { ...user, profile };
        updateHeaderProfileIcon(profile.photo_url);

        // OneSignal Login
        if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(function(OneSignal) {
                OneSignal.login(user.id);
            });
        }

        setupMessageBadgeListener();
        await Promise.all([fetchSavedPostIds(), fetchUserReactions()]);

        const pageId = document.body.id;
        if (pageId === 'home-page') {
            if (typeof initHomePage === 'function') await initHomePage();
        } else if (pageId === 'profile-page') {
            await initProfilePage();
        }
        
        showAdminUI();
        if (typeof loadNotifications === 'function') loadNotifications();
        
    } catch (err) {
        console.error('🚨 Login Handler Error:', err);
        handleUserLoggedOut();
    }
}

// ====================================================================
// 3. লগআউট হ্যান্ডলার
// ====================================================================

function handleUserLoggedOut() {
    currentUser = null;
    savedPostIds.clear(); 
    userLovedPrayers.clear();
    userAmeenedPrayers.clear();
    updateHeaderProfileIcon(null);

    if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(function(OneSignal) {
            OneSignal.logout();
        });
    }

    const pageId = document.body.id;
    if (pageId === 'profile-page') {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('id')) { window.location.href = '/index.html'; return; }
        if(typeof initProfilePage === 'function') initProfilePage(); 
    }

    document.getElementById('loginPage').style.display = 'none';
    showAdminUI();
    supabaseClient.removeAllChannels();
    prayersSubscription = null;
    
    if (pageId === 'home-page') {
        if(typeof renderStoriesList === 'function') renderStoriesList(document.getElementById('storyContainer')); 
        if(typeof initHomePage === 'function') initHomePage();
    }
    
    if(typeof updateNotificationBadge === 'function') updateNotificationBadge(0);
    updateMessageBadgeUI(0);
}

// ====================================================================
// 4. মেসেজ ব্যাজ (লাল বাতি) লজিক
// ====================================================================

async function setupMessageBadgeListener() {
    if (!currentUser) return;
    const { count } = await supabaseClient.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', currentUser.id).eq('is_read', false);
    updateMessageBadgeUI(count || 0);

    supabaseClient.channel('message_badge_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUser.id}` }, (payload) => {
             const badge = document.getElementById('msg-badge-count');
             let current = badge && badge.innerText ? parseInt(badge.innerText.replace('+', '')) : 0;
             if(isNaN(current)) current = 0;
             updateMessageBadgeUI(current + 1);
        })
        .subscribe();
}

function updateMessageBadgeUI(count) {
    const badge = document.getElementById('msg-badge-count');
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 9 ? '9+' : count;
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ====================================================================
// 5. প্রোফাইল পেজ লজিক (Highlight & Verified Badge)
// ====================================================================

async function initProfilePage() {
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('id');

    if (!userId && currentUser) userId = currentUser.id; 
    else if (!userId && !currentUser) { showLoginModal(); return; }

    filteredUserId = userId; 
    const myPostsContainer = document.getElementById('myPostsContainer');

    // UI Pre-load
    if(currentUser && currentUser.id === userId) {
         setProfileHeader(currentUser.profile || currentUser.user_metadata);
    } else {
         document.getElementById('profileName').textContent = 'লোড হচ্ছে...';
    }

    showSkeletonLoader(true, 'myPostsContainer');

    try {
        let { data: userProfile, error } = await supabaseClient.from('users').select('*, cover_photo_url').eq('id', userId).maybeSingle();

        if (!userProfile && currentUser && currentUser.id === userId) {
            const { data: newProfile } = await supabaseClient.from('users').insert([{ id: currentUser.id, email: currentUser.email, display_name: currentUser.user_metadata?.full_name }]).select().single();
            userProfile = newProfile;
        }

        if (userProfile) setProfileHeader(userProfile);

        // Load Highlights (NEW FEATURE)
        await loadUserHighlights(userId);

        const [postsCount, followersCount, followingCount] = await Promise.all([
            supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).eq('author_uid', userId).eq('status', 'active'),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
        ]);

        document.getElementById('postCount').innerHTML = `<strong>${postsCount.count || 0}</strong> পোস্ট`;
        document.getElementById('followersCount').innerHTML = `<strong>${followersCount.count || 0}</strong> অনুসারী`;
        document.getElementById('followingCount').innerHTML = `<strong>${followingCount.count || 0}</strong> অনুসরণ`;

        setupProfileButtons(userId);
        setupProfileTabs(userId);
        if(typeof fetchAndRenderPrayers === 'function') fetchAndRenderPrayers(myPostsContainer, 'active', userId, true);

    } catch (err) {
        console.error("Profile Error:", err);
        if(myPostsContainer) myPostsContainer.innerHTML = '<p style="text-align:center;">তথ্য লোড করতে সমস্যা হয়েছে।</p>';
    }
}

// প্রোফাইল হেডার আপডেট (Verified Badge সহ)
function setProfileHeader(profile) {
    const nameEl = document.getElementById('profileName');
    const bioEl = document.getElementById('profileAddress');
    const avatarEl = document.getElementById('profileAvatar');
    const coverEl = document.getElementById('profileCoverDisplay');

    // Verified Badge Logic
    let verifiedBadge = '';
    if (profile.role === 'admin' || profile.is_verified) {
        verifiedBadge = ` <i class="fas fa-check-circle" style="color: #1877F2; font-size: 18px; vertical-align: middle;" title="Verified"></i>`;
    }

    nameEl.innerHTML = (profile.display_name || 'নাম নেই') + verifiedBadge;
    bioEl.textContent = profile.address || 'কোনো বায়ো নেই';

    if (profile.photo_url) {
        avatarEl.innerHTML = `<img src="${profile.photo_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        avatarEl.innerHTML = `<i class="fas fa-user" style="font-size: 40px; color: #ccc;"></i>`;
    }

    if (profile.cover_photo_url) {
        coverEl.src = profile.cover_photo_url;
        coverEl.style.display = 'block';
    } else {
        coverEl.style.display = 'none';
    }
}

// ====================================================================
// 6. HIGHLIGHTS LOGIC (NEW FEATURE)
// ====================================================================

async function loadUserHighlights(userId) {
    // আগের হাইলাইটস ক্লিয়ার করা
    const existingHighlights = document.querySelector('.highlights-section');
    if(existingHighlights) existingHighlights.remove();

    try {
        const { data: highlights, error } = await supabaseClient
            .from('highlights')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // নিজের প্রোফাইল হলে 'Create' বাটন দেখাবে, নাহলে শুধু হাইলাইটস
        if ((highlights && highlights.length > 0) || (currentUser && currentUser.id === userId)) {
            renderHighlightsSection(highlights, userId);
        }

    } catch (err) {
        console.error("Error loading highlights:", err);
    }
}

function renderHighlightsSection(highlights, profileUserId) {
    const profileHeader = document.querySelector('.profile-header');
    
    // সেকশন তৈরি
    const section = document.createElement('div');
    section.className = 'highlights-section';
    
    // 1. Create Button (Only for owner)
    if (currentUser && currentUser.id === profileUserId) {
        const createBtn = document.createElement('div');
        createBtn.className = 'highlight-item create-highlight-btn';
        createBtn.innerHTML = `
            <div class="highlight-circle">
                <i class="fas fa-plus"></i>
            </div>
            <span class="highlight-title">New</span>
        `;
        createBtn.onclick = () => openCreateHighlightModal(); // interactions.js এ থাকবে
        section.appendChild(createBtn);
    }

    // 2. Existing Highlights
    if (highlights) {
        highlights.forEach(highlight => {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            const coverImg = highlight.cover_url || './images/default-highlight.png'; // ডিফল্ট ইমেজ হ্যান্ডলিং
            
            item.innerHTML = `
                <div class="highlight-circle premium-border">
                    <img src="${coverImg}" class="highlight-img" onerror="this.src='./images/default-highlight.png'">
                </div>
                <span class="highlight-title">${highlight.title}</span>
            `;
            
            // ক্লিক করলে ভিউ হবে (লজিক পরে stories.js এ এড হবে)
            item.onclick = () => alert("হাইলাইট ভিউয়ার শীঘ্রই আসছে!"); 
            
            section.appendChild(item);
        });
    }

    // প্রোফাইল স্ট্যাটস এর আগে যুক্ত করা
    const statsDiv = document.querySelector('.profile-stats');
    profileHeader.insertBefore(section, statsDiv);
}

// ====================================================================
// 7. HELPER FUNCTIONS & UPLOADS
// ====================================================================

function setupProfileButtons(userId) {
    const editBtn = document.getElementById('editProfileBtn');
    const followBtn = document.getElementById('followBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    const changeCoverBtn = document.getElementById('changeCoverBtn');
    const changeProfilePicBtn = document.getElementById('changeProfilePicBtn');
    const msgBtn = document.getElementById('profileMessageBtn');
    
    [editBtn, followBtn, signOutBtn, changeCoverBtn, changeProfilePicBtn, msgBtn].forEach(el => {
        if(el) el.style.display = 'none';
    });

    if (currentUser && currentUser.id === userId) {
        if(editBtn) editBtn.style.display = 'inline-block'; 
        if(signOutBtn) signOutBtn.style.display = 'inline-block';
        if(changeCoverBtn) changeCoverBtn.style.display = 'flex'; 
        if(changeProfilePicBtn) changeProfilePicBtn.style.display = 'flex';
        document.querySelectorAll('.tab-btn[data-tab="saved"], .tab-btn[data-tab="hidden"]').forEach(btn => btn.style.display = 'inline-block');
        setupProfileImageUploads(); 
    } else {
        if(followBtn) {
            followBtn.style.display = 'inline-block'; 
            followBtn.dataset.userId = userId;
        }
        if (currentUser) {
            checkFollowStatus(userId, followBtn);
            if(msgBtn) {
                msgBtn.style.display = 'inline-block';
                msgBtn.onclick = () => {
                    localStorage.setItem('startChatWith', userId);
                    window.location.href = 'messages.html';
                };
            }
        }
        document.querySelectorAll('.tab-btn[data-tab="saved"], .tab-btn[data-tab="hidden"]').forEach(btn => btn.style.display = 'none');
    }
}

async function checkFollowStatus(userId, btn) {
    const { data } = await supabaseClient.from('followers').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single();
    if (data) { btn.textContent = 'আনফলো'; btn.classList.add('following'); } 
    else { btn.textContent = 'অনুসরণ করুন'; btn.classList.remove('following'); }
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
    try { const { data } = await supabaseClient.from('saved_posts').select('post_id').eq('user_id', currentUser.id); savedPostIds = new Set(data.map(item => item.post_id)); } catch (e) {}
}

async function fetchUserReactions() {
    if (!currentUser) return;
    try {
        const { data: loved } = await supabaseClient.from('prayers').select('id').contains('loved_by', [currentUser.id]);
        const { data: ameened } = await supabaseClient.from('prayers').select('id').contains('ameened_by', [currentUser.id]);
        userLovedPrayers = new Set(loved?.map(p => p.id) || []);
        userAmeenedPrayers = new Set(ameened?.map(p => p.id) || []);
    } catch (e) {}
}

function updateHeaderProfileIcon(photoUrl) {
    const profileTab = document.querySelector('.header-nav-row a[href="/profile.html"]');
    if (!profileTab) return;
    if (photoUrl) profileTab.innerHTML = `<img src="${photoUrl}" class="header-profile-img" alt="Profile">`; 
    else profileTab.innerHTML = `<i class="fas fa-user-circle"></i>`;
}

// Image Uploads & Edit Profile
function setupProfileImageUploads() {
    const coverInput = document.getElementById('coverPicInput');
    const profileInput = document.getElementById('profilePicInput');
    if(coverInput) coverInput.onchange = (e) => handleProfileImageUpload(e, 'cover'); 
    if(profileInput) profileInput.onchange = (e) => handleProfileImageUpload(e, 'profile'); 
    
    // Bind buttons
    document.getElementById('changeCoverBtn')?.addEventListener('click', () => coverInput.click());
    document.getElementById('changeProfilePicBtn')?.addEventListener('click', () => profileInput.click());
}

async function handleProfileImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("ফাইলের আকার ৫ এমবির বেশি!"); return; }
    
    document.getElementById('uploadProgressModal').style.display = 'flex';
    try {
        const dbColumn = type === 'cover' ? 'cover_photo_url' : 'photo_url';
        const fileName = `${type}_${currentUser.id}_${Date.now()}.${file.name.split('.').pop()}`;
        const filePath = `${type}s/${fileName}`;
        
        const { data } = await supabaseClient.storage.from('post_images').upload(filePath, file, { upsert: true });
        const { data: urlData } = supabaseClient.storage.from('post_images').getPublicUrl(filePath);
        
        await supabaseClient.from('users').update({ [dbColumn]: urlData.publicUrl }).eq('id', currentUser.id);
        
        if (type === 'cover') document.getElementById('profileCoverDisplay').src = urlData.publicUrl;
        else {
            document.getElementById('profileAvatar').innerHTML = `<img src="${urlData.publicUrl}" style="width:100%;height:100%;object-fit:cover;">`;
            updateHeaderProfileIcon(urlData.publicUrl);
        }
        alert("আপলোড সফল!");
    } catch (e) { alert("সমস্যা: " + e.message); } 
    finally { document.getElementById('uploadProgressModal').style.display = 'none'; }
}

function setupProfileTabs(userId) {
    const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
    tabs.forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        newTab.addEventListener('click', (e) => {
            document.querySelectorAll('.profile-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const container = document.getElementById('myPostsContainer');
            container.innerHTML = '';
            showSkeletonLoader(true, 'myPostsContainer');
            if(typeof fetchAndRenderPrayers === 'function') fetchAndRenderPrayers(container, e.target.dataset.tab, userId, true);
        });
    });
}

// Global scope for edit profile submit
window.handleEditProfileSubmit = async function(e) { 
    e.preventDefault(); 
    const name = document.getElementById('editNameInput').value;
    const bio = document.getElementById('editAddressInput').value;
    const btn = e.target.querySelector('button');
    setLoading(btn, true);
    try {
        await supabaseClient.from('users').update({ display_name: name, address: bio }).eq('id', currentUser.id);
        currentUser.profile.display_name = name; currentUser.profile.address = bio;
        document.getElementById('editProfileModal').style.display = 'none'; 
        alert('আপডেট হয়েছে!');
        if (document.body.id === 'profile-page') initProfilePage(); 
    } catch(err) { alert("ব্যর্থ: " + err.message); } 
    finally { setLoading(btn, false); }
}