// ====================================
// FILE: auth.js
// বিবরণ: অথেন্টিকেশন, প্রোফাইল ম্যানেজমেন্ট এবং ইউজার অ্যাকশন
// ====================================

// --- Google Sign In ---
async function handleGoogleSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'google', 
            options: { redirectTo: 'https://alaminsarkar-bsc.github.io/', queryParams: { access_type: 'offline', prompt: 'consent select_account' } } 
        }); 
        if (error) throw error; 
    } catch (error) { alert('গুগল সাইনইনে সমস্যা হয়েছে: ' + error.message); } 
}

// --- Facebook Sign In ---
async function handleFacebookSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'facebook', 
            options: { redirectTo: window.location.origin } 
        }); 
        if (error) throw error; 
    } catch (error) { alert('ফেসবুক সাইনইনে সমস্যা হয়েছে: ' + error.message); } 
}

// --- OTP Sending ---
async function handleSendOtp() {
    const phoneInput = document.getElementById('phoneInput'); const btn = document.getElementById('sendOtpBtn');
    let phone = phoneInput.value.trim(); if (!phone) { alert("মোবাইল নাম্বার দিন।"); return; }
    if (!phone.startsWith('+')) { if (phone.startsWith('01')) { phone = '+88' + phone; } else { alert("সঠিক ফরম্যাটে নাম্বার দিন (যেমন: 017... অথবা +88017...)"); return; } }
    setLoading(btn, true);
    try { const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone }); if (error) throw error; document.getElementById('phoneInputStep').style.display = 'none'; document.getElementById('otpInputStep').style.display = 'block'; alert("কোড পাঠানো হয়েছে।"); } catch (error) { console.error("OTP Error:", error); alert("সমস্যা হয়েছে: " + error.message); } finally { setLoading(btn, false); }
}

// --- OTP Verification ---
async function handleVerifyOtp() {
    const phoneInput = document.getElementById('phoneInput'); const otpInput = document.getElementById('otpInput'); const btn = document.getElementById('verifyOtpBtn');
    let phone = phoneInput.value.trim(); if (!phone.startsWith('+') && phone.startsWith('01')) { phone = '+88' + phone; }
    const token = otpInput.value.trim(); if (!token) { alert("কোডটি লিখুন।"); return; }
    setLoading(btn, true);
    try { const { data, error } = await supabaseClient.auth.verifyOtp({ phone: phone, token: token, type: 'sms' }); if (error) throw error; if (data.session) { document.getElementById('loginPage').style.display = 'none'; alert("লগইন সফল হয়েছে!"); } } catch (error) { console.error("Verify Error:", error); alert("ভুল কোড। আবার চেষ্টা করুন।"); } finally { setLoading(btn, false); }
}

// --- User Logged In Handler ---
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

        await Promise.all([
            fetchSavedPostIds(),
            fetchUserReactions() 
        ]);

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

// --- User Logged Out Handler ---
function handleUserLoggedOut() {
    currentUser = null;
    savedPostIds.clear(); 
    userLovedPrayers.clear();
    userAmeenedPrayers.clear();
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
        if(typeof renderStoriesList === 'function') renderStoriesList(document.getElementById('storyContainer')); 
        if(typeof initHomePage === 'function') initHomePage();
    }
    if(typeof updateNotificationBadge === 'function') updateNotificationBadge(0);
}

// --- Admin UI Toggle ---
function showAdminUI() {
    const isAdmin = currentUser && ADMIN_USERS.includes(currentUser.email);
    const adminLink = document.getElementById('adminLink');
    const campaignAdminLink = document.getElementById('campaignAdminLink');
    
    if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
    if (campaignAdminLink) campaignAdminLink.style.display = isAdmin ? 'block' : 'none';
}

// --- Fetch Saved Posts ---
async function fetchSavedPostIds() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('saved_posts').select('post_id').eq('user_id', currentUser.id);
        if (error) throw error;
        savedPostIds = new Set(data.map(item => item.post_id));
    } catch (error) { console.error("Saved posts error:", error); }
}

// --- Fetch User Reactions (Love/Ameen) ---
async function fetchUserReactions() {
    if (!currentUser) return;
    try {
        const { data: lovedPrayers, error: loveError } = await supabaseClient.from('prayers').select('id').contains('loved_by', [currentUser.id]);
        if (loveError) throw loveError;
        
        const { data: ameenedPrayers, error: ameenError } = await supabaseClient.from('prayers').select('id').contains('ameened_by', [currentUser.id]);
        if (ameenError) throw ameenError;
        
        userLovedPrayers = new Set(lovedPrayers?.map(p => p.id) || []);
        userAmeenedPrayers = new Set(ameenedPrayers?.map(p => p.id) || []);
        
    } catch (error) { console.error("Error fetching user reactions:", error); }
}

// --- Header Profile Icon Update ---
function updateHeaderProfileIcon(photoUrl) {
    const profileTab = document.querySelector('.header-nav-row a[href="/profile.html"]');
    if (!profileTab) return;
    if (photoUrl) { profileTab.innerHTML = `<img src="${photoUrl}" class="header-profile-img" alt="Profile">`; } 
    else { profileTab.innerHTML = `<i class="fas fa-user-circle"></i>`; }
}

// ====================================
// PROFILE PAGE LOGIC
// ====================================
async function initProfilePage() {
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('id');

    // ১. আইডি না থাকলে বর্তমান ইউজারের আইডি সেট করা
    if (!userId && currentUser) { 
        userId = currentUser.id; 
    } else if (!userId && !currentUser) { 
        showLoginModal(); 
        return; 
    }

    filteredUserId = userId; 
    const myPostsContainer = document.getElementById('myPostsContainer');
    
    // ২. ডাটাবেজ লোড হওয়ার আগেই সেশন থেকে নাম ও ছবি বসিয়ে দেওয়া
    if(currentUser && currentUser.id === userId) {
         const metaName = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0];
         document.getElementById('profileName').textContent = currentUser.profile?.display_name || metaName || 'নাম নেই';
         
         const metaPhoto = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
         const finalPhoto = currentUser.profile?.photo_url || metaPhoto;
         
         const avatarEl = document.getElementById('profileAvatar');
         if (finalPhoto) {
             avatarEl.innerHTML = `<img src="${finalPhoto}" style="width:100%;height:100%;object-fit:cover;">`;
         } else {
             avatarEl.style.backgroundColor = generateAvatarColor(metaName);
             avatarEl.innerHTML = (metaName?.charAt(0) || 'U').toUpperCase();
         }
    } else {
         document.getElementById('profileName').textContent = 'লোড হচ্ছে...';
    }

    showSkeletonLoader(true, 'myPostsContainer');

    try {
        let { data: userProfile, error } = await supabaseClient
            .from('users')
            .select('*, cover_photo_url')
            .eq('id', userId)
            .maybeSingle();

        // ৪. [AUTO-FIX] প্রোফাইল না থাকলে তৈরি করা
        if (!userProfile && currentUser && currentUser.id === userId) {
            console.log("Profile missing in DB, creating automatically...");
            const newProfileData = {
                id: currentUser.id,
                email: currentUser.email,
                display_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0],
                photo_url: currentUser.user_metadata?.avatar_url || null,
                role: 'user',
                created_at: new Date().toISOString()
            };
            const { data: insertedProfile, error: insertError } = await supabaseClient.from('users').insert([newProfileData]).select().single();
            if (!insertError) userProfile = insertedProfile;
        }

        if (!userProfile && userId !== currentUser?.id) {
            document.getElementById('profileName').textContent = 'ইউজার পাওয়া যায়নি';
            throw new Error("User not found in DB");
        }

        if (userProfile) {
            document.getElementById('profileName').textContent = userProfile.display_name || 'নাম নেই';
            document.getElementById('profileAddress').textContent = userProfile.address || 'কোনো বায়ো নেই';
            
            const avatarEl = document.getElementById('profileAvatar');
            if (userProfile.photo_url) { 
                avatarEl.innerHTML = `<img src="${userProfile.photo_url}" style="width:100%;height:100%;object-fit:cover;">`; 
            }

            const coverEl = document.getElementById('profileCoverDisplay');
            if (userProfile.cover_photo_url) { 
                coverEl.src = userProfile.cover_photo_url; 
                coverEl.style.display = 'block'; 
            } else { 
                coverEl.style.display = 'none'; 
            }
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
                const { data: isFollowing } = await supabaseClient.from('followers').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single();
                if (isFollowing) { followBtn.textContent = 'আনফলো'; followBtn.classList.add('following'); } 
                else { followBtn.textContent = 'অনুসরণ করুন'; followBtn.classList.remove('following'); }
                
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

        setupProfileTabs(userId);
        // fetchAndRenderPrayers ফাংশনটি feed.js এ থাকবে, তাই চেক করে কল করা হবে
        if(typeof fetchAndRenderPrayers === 'function') {
            fetchAndRenderPrayers(myPostsContainer, 'active', userId, true);
        }

    } catch (err) {
        console.error("Profile Logic Error:", err);
        if (!document.getElementById('profileName').textContent || document.getElementById('profileName').textContent === 'লোড হচ্ছে...') {
             document.getElementById('profileName').textContent = 'নেটওয়ার্ক সমস্যা';
        }
        myPostsContainer.innerHTML = '<p style="text-align:center;">তথ্য লোড করতে সমস্যা হয়েছে।</p>';
    }
}

// --- Setup Profile Tabs ---
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
            currentPage = 0; noMorePrayers = false;
            if(typeof fetchAndRenderPrayers === 'function') {
                fetchAndRenderPrayers(container, tabName, userId, true);
            }
        });
    });
}

// --- Follow User Handler ---
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
            if(typeof createNotification === 'function') {
                await createNotification(userIdToFollow, currentUser.id, 'follow', notificationContent, `/profile.html?id=${currentUser.id}`);
            }
        }
        const { count } = await supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userIdToFollow);
        document.getElementById('followersCount').innerHTML = `<strong>${count || 0}</strong> অনুসারী`;
    } catch (error) { alert('দুঃখিত, প্রক্রিয়াটি সম্পন্ন করা যায়নি।'); console.error('Follow/Unfollow error:', error); } finally { setLoading(btn, false); }
}

// --- Profile Image Upload Helpers ---
function setupProfileImageUploads() {
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

    if(coverInput) { coverInput.onchange = (e) => handleProfileImageUpload(e, 'cover'); }
    if(profileInput) { profileInput.onchange = (e) => handleProfileImageUpload(e, 'profile'); }
}

async function handleProfileImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("ফাইলের আকার খুব বেশি! ৫ এমবির নিচে হতে হবে।"); return; }
    const loadingModal = document.getElementById('uploadProgressModal');
    if(loadingModal) loadingModal.style.display = 'flex';

    try {
        const dbColumn = type === 'cover' ? 'cover_photo_url' : 'photo_url';
        const { data: userData, error: fetchError } = await supabaseClient.from('users').select(dbColumn).eq('id', currentUser.id).single();
        if (fetchError) throw fetchError;
        const oldUrl = userData ? userData[dbColumn] : null;
        if (oldUrl) {
            try { const pathParts = oldUrl.split('/post_images/'); if (pathParts.length > 1) { const oldPath = pathParts[1]; await supabaseClient.storage.from('post_images').remove([oldPath]); } } catch (delErr) { console.warn("Old image delete failed:", delErr); }
        }
        const fileExt = file.name.split('.').pop();
        const fileName = `${type}_${currentUser.id}_${Date.now()}.${fileExt}`;
        const filePath = `${type}s/${fileName}`;
        const { data, error: uploadError } = await supabaseClient.storage.from('post_images').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabaseClient.storage.from('post_images').getPublicUrl(filePath);
        const imageUrl = publicUrlData.publicUrl;
        const updateData = {}; updateData[dbColumn] = imageUrl;
        const { error: dbError } = await supabaseClient.from('users').update(updateData).eq('id', currentUser.id);
        if (dbError) throw dbError;

        if (type === 'cover') {
            const imgEl = document.getElementById('profileCoverDisplay'); imgEl.src = imageUrl; imgEl.style.display = 'block';
        } else {
            const avatarEl = document.getElementById('profileAvatar');
            avatarEl.innerHTML = `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;">`;
            if(currentUser.profile) { currentUser.profile[dbColumn] = imageUrl; }
            updateHeaderProfileIcon(imageUrl);
        }
        alert("আপলোড সফল হয়েছে!");
    } catch (error) { console.error("Upload Error:", error); alert("আপলোড করতে সমস্যা হয়েছে: " + error.message); } finally { if(loadingModal) loadingModal.style.display = 'none'; e.target.value = ''; }
}

// --- Edit Profile Handler ---
function handleEditProfile() { 
    document.getElementById('editNameInput').value = currentUser.profile?.display_name || ''; 
    document.getElementById('editAddressInput').value = currentUser.profile?.address || ''; 
    document.getElementById('editProfileModal').style.display = 'flex'; 
}

// --- Submit Profile Edit ---
async function handleEditProfileSubmit(e) { 
    e.preventDefault(); 
    await supabaseClient.from('users').update({ 
        display_name: document.getElementById('editNameInput').value, 
        address: document.getElementById('editAddressInput').value 
    }).eq('id', currentUser.id); 
    
    document.getElementById('editProfileModal').style.display = 'none'; 
    if (document.body.id === 'profile-page') initProfilePage(); 
}