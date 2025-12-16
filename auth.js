// ====================================================================
// FILE: auth.js
// বিবরণ: অথেন্টিকেশন, প্রোফাইল ম্যানেজমেন্ট, মেসেজ ব্যাজ এবং OneSignal সেটআপ
// ====================================================================

console.log("Auth Module Loaded Successfully");

// ====================================================================
// 1. লগইন মেথডসমূহ (Login Methods)
// ====================================================================

/**
 * Google Sign In
 */
async function handleGoogleSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'google', 
            options: { 
                redirectTo: 'https://doa-angina.vercel.app/', // আপনার লাইভ সাইটের লিংক
                queryParams: { 
                    access_type: 'offline', 
                    prompt: 'consent select_account' 
                } 
            } 
        }); 
        if (error) throw error; 
    } catch (error) { 
        alert('গুগল সাইনইনে সমস্যা হয়েছে: ' + error.message); 
    } 
}

/**
 * Facebook Sign In
 */
async function handleFacebookSignIn() { 
    try { 
        const { error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: 'facebook', 
            options: { redirectTo: window.location.origin } 
        }); 
        if (error) throw error; 
    } catch (error) { 
        alert('ফেসবুক সাইনইনে সমস্যা হয়েছে: ' + error.message); 
    } 
}

/**
 * Phone Login: Send OTP (Step 1)
 */
async function handleSendOtp() {
    const phoneInput = document.getElementById('phoneInput'); 
    const btn = document.getElementById('sendOtpBtn');
    
    let phone = phoneInput.value.trim(); 
    if (!phone) { alert("মোবাইল নাম্বার দিন।"); return; }
    
    // নাম্বার ফরম্যাটিং (+880)
    if (!phone.startsWith('+')) { 
        if (phone.startsWith('01')) { 
            phone = '+88' + phone; 
        } else { 
            alert("সঠিক ফরম্যাটে নাম্বার দিন (যেমন: 017... অথবা +88017...)"); return; 
        } 
    }
    
    setLoading(btn, true);
    
    try { 
        const { error } = await supabaseClient.auth.signInWithOtp({ phone: phone }); 
        if (error) throw error; 
        
        document.getElementById('phoneInputStep').style.display = 'none'; 
        document.getElementById('otpInputStep').style.display = 'block'; 
        alert("কোড পাঠানো হয়েছে।"); 
    } catch (error) { 
        console.error("OTP Error:", error); 
        alert("সমস্যা হয়েছে: " + error.message); 
    } finally { 
        setLoading(btn, false); 
    }
}

/**
 * Phone Login: Verify OTP (Step 2)
 */
async function handleVerifyOtp() {
    const phoneInput = document.getElementById('phoneInput'); 
    const otpInput = document.getElementById('otpInput'); 
    const btn = document.getElementById('verifyOtpBtn');
    
    let phone = phoneInput.value.trim(); 
    if (!phone.startsWith('+') && phone.startsWith('01')) { phone = '+88' + phone; }
    
    const token = otpInput.value.trim(); 
    if (!token) { alert("কোডটি লিখুন।"); return; }
    
    setLoading(btn, true);
    
    try { 
        const { data, error } = await supabaseClient.auth.verifyOtp({ 
            phone: phone, 
            token: token, 
            type: 'sms' 
        }); 
        
        if (error) throw error; 
        
        if (data.session) { 
            document.getElementById('loginPage').style.display = 'none'; 
            alert("লগইন সফল হয়েছে!"); 
            // main.js এর listener অটোমেটিক handleUserLoggedIn কল করবে
        } 
    } catch (error) { 
        console.error("Verify Error:", error); 
        alert("ভুল কোড। আবার চেষ্টা করুন।"); 
    } finally { 
        setLoading(btn, false); 
    }
}

// ====================================================================
// 2. মেইন লগইন হ্যান্ডলার (সিস্টেম সেটআপ)
// ====================================================================

async function handleUserLoggedIn(user) {
    try {
        // ১. ডাটাবেজ থেকে প্রোফাইল চেক করা
        let { data: profile, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();
        
        // ২. প্রোফাইল না থাকলে অটোমেটিক তৈরি করা (Auto Create Profile)
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
        
        // ৩. সাসপেনশন চেক
        if (profile && profile.status === 'SUSPENDED') {
            alert('আপনার অ্যাকাউন্টটি সাসপেন্ড করা হয়েছে।');
            await supabaseClient.auth.signOut();
            return;
        }
        
        // ৪. গ্লোবাল ভ্যারিয়েবল সেট করা
        currentUser = { ...user, profile };
        updateHeaderProfileIcon(profile.photo_url);

        // ৫. OneSignal Login (নোটিফিকেশন রেজিস্টার)
        if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(function(OneSignal) {
                OneSignal.login(user.id);
                console.log("✅ OneSignal User ID Registered:", user.id);
            });
        }

        // ৬. মেসেজ ব্যাজ লিসেনার চালু করা
        setupMessageBadgeListener();

        // ৭. ইউজারের সেভ করা পোস্ট এবং রিয়্যাকশন লোড করা
        await Promise.all([
            fetchSavedPostIds(),
            fetchUserReactions() 
        ]);

        // ৮. পেজ অনুযায়ী কন্টেন্ট লোড করা
        const pageId = document.body.id;
        if (pageId === 'home-page') {
            if (typeof initHomePage === 'function') await initHomePage();
        } else if (pageId === 'profile-page') {
            await initProfilePage();
        }
        
        // ৯. অ্যাডমিন প্যানেল বাটন এবং নোটিফিকেশন লোড
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
    // স্টেট ক্লিয়ার করা
    currentUser = null;
    savedPostIds.clear(); 
    userLovedPrayers.clear();
    userAmeenedPrayers.clear();
    updateHeaderProfileIcon(null);

    // OneSignal Logout
    if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(function(OneSignal) {
            OneSignal.logout();
            console.log("🚫 OneSignal Logged Out");
        });
    }

    // পেজ রিডাইরেক্ট (প্রয়োজন হলে)
    const pageId = document.body.id;
    if (pageId === 'profile-page') {
        const urlParams = new URLSearchParams(window.location.search);
        // নিজের প্রোফাইল পেজ হলে হোমে পাঠাবে
        if (!urlParams.get('id')) { 
             window.location.href = '/index.html'; 
             return;
        }
        // অন্যের প্রোফাইল হলে ভিউ রিফ্রেশ করবে (লগইন বাটন দেখাবে)
        if(typeof initProfilePage === 'function') initProfilePage(); 
    }

    document.getElementById('loginPage').style.display = 'none';
    showAdminUI(); // অ্যাডমিন বাটন লুকাবে
    
    // রিয়েলটাইম চ্যানেল বন্ধ করা
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

    // ১. ইনিশিয়াল কাউন্ট লোড
    const { count } = await supabaseClient
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
    
    updateMessageBadgeUI(count || 0);

    // ২. রিয়েলটাইম লিসেনার (নতুন মেসেজ আসলে বাটন লাল হবে)
    supabaseClient.channel('message_badge_channel')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `receiver_id=eq.${currentUser.id}` 
        }, (payload) => {
             const badge = document.getElementById('msg-badge-count');
             let current = badge && badge.innerText && badge.style.display !== 'none' 
                           ? parseInt(badge.innerText.replace('+', '')) 
                           : 0;
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
// 5. প্রোফাইল পেজ লজিক (View & Edit)
// ====================================================================

async function initProfilePage() {
    const urlParams = new URLSearchParams(window.location.search);
    let userId = urlParams.get('id');

    // আইডি না থাকলে নিজের আইডি, লগইন না থাকলে মডাল
    if (!userId && currentUser) { 
        userId = currentUser.id; 
    } else if (!userId && !currentUser) { 
        showLoginModal(); 
        return; 
    }

    filteredUserId = userId; 
    const myPostsContainer = document.getElementById('myPostsContainer');
    
    // UI ফাস্ট করার জন্য প্রি-লোডিং
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

        // প্রোফাইল মিসিং হলে অটোমেটিক তৈরি
        if (!userProfile && currentUser && currentUser.id === userId) {
            console.log("Auto-creating profile...");
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
            throw new Error("User not found");
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

        // পরিসংখ্যান লোড (Post, Follower, Following)
        const [postsCount, followersCount, followingCount] = await Promise.all([
            supabaseClient.from('prayers').select('*', { count: 'exact', head: true }).eq('author_uid', userId).eq('status', 'active'),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId),
            supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
        ]);

        document.getElementById('postCount').innerHTML = `<strong>${postsCount.count || 0}</strong> পোস্ট`;
        document.getElementById('followersCount').innerHTML = `<strong>${followersCount.count || 0}</strong> অনুসারী`;
        document.getElementById('followingCount').innerHTML = `<strong>${followingCount.count || 0}</strong> অনুসরণ`;

        // বাটন ভিজিবিলিটি কন্ট্রোল
        const editBtn = document.getElementById('editProfileBtn');
        const followBtn = document.getElementById('followBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        const changeCoverBtn = document.getElementById('changeCoverBtn');
        const changeProfilePicBtn = document.getElementById('changeProfilePicBtn');
        const msgBtn = document.getElementById('profileMessageBtn');
        
        // সব লুকিয়ে ফেলা
        [editBtn, followBtn, signOutBtn, changeCoverBtn, changeProfilePicBtn, msgBtn].forEach(el => {
            if(el) el.style.display = 'none';
        });

        if (currentUser && currentUser.id === userId) {
            // নিজের প্রোফাইল হলে এডিট বাটন দেখাবে
            if(editBtn) editBtn.style.display = 'inline-block'; 
            if(signOutBtn) signOutBtn.style.display = 'inline-block';
            if(changeCoverBtn) changeCoverBtn.style.display = 'flex'; 
            if(changeProfilePicBtn) changeProfilePicBtn.style.display = 'flex';
            
            // সেভ ও হিডেন ট্যাব দেখাবে
            document.querySelectorAll('.tab-btn[data-tab="saved"], .tab-btn[data-tab="hidden"]').forEach(btn => btn.style.display = 'inline-block');
            
            // আপলোড লিসেনার সেটআপ
            setupProfileImageUploads(); 
        } else {
            // অন্যের প্রোফাইল হলে ফলো ও মেসেজ বাটন দেখাবে
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
        
        // feed.js লোড হলে পোস্ট দেখাবে
        if(typeof fetchAndRenderPrayers === 'function') {
            fetchAndRenderPrayers(myPostsContainer, 'active', userId, true);
        }

    } catch (err) {
        console.error("Profile Logic Error:", err);
        if(myPostsContainer) myPostsContainer.innerHTML = '<p style="text-align:center;">তথ্য লোড করতে সমস্যা হয়েছে।</p>';
    }
}

// প্রোফাইল এডিট হ্যান্ডলার (গ্লোবাল স্কোপে রাখা হলো interactions.js থেকে কল করার জন্য)
window.handleEditProfileSubmit = async function(e) { 
    e.preventDefault(); 
    const name = document.getElementById('editNameInput').value;
    const bio = document.getElementById('editAddressInput').value;
    
    const btn = e.target.querySelector('button');
    setLoading(btn, true);

    try {
        const { error } = await supabaseClient.from('users').update({ 
            display_name: name, 
            address: bio 
        }).eq('id', currentUser.id); 
        
        if(error) throw error;

        currentUser.profile.display_name = name;
        currentUser.profile.address = bio;
        
        document.getElementById('editProfileModal').style.display = 'none'; 
        alert('প্রোফাইল আপডেট হয়েছে!');
        
        if (document.body.id === 'profile-page' && typeof initProfilePage === 'function') initProfilePage(); 

    } catch(err) {
        alert("আপডেট ব্যর্থ হয়েছে: " + err.message);
    } finally {
        setLoading(btn, false);
    }
}

// 13. ইউটিলিটি ফাংশনস
function showAdminUI() {
    const isAdmin = currentUser && ADMIN_USERS.includes(currentUser.email);
    const adminLink = document.getElementById('adminLink');
    const campaignAdminLink = document.getElementById('campaignAdminLink');
    if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
    if (campaignAdminLink) campaignAdminLink.style.display = isAdmin ? 'block' : 'none';
}

async function fetchSavedPostIds() {
    if (!currentUser) return;
    try { const { data, error } = await supabaseClient.from('saved_posts').select('post_id').eq('user_id', currentUser.id); if (error) throw error; savedPostIds = new Set(data.map(item => item.post_id)); } catch (error) { console.error("Saved posts error:", error); }
}

async function fetchUserReactions() {
    if (!currentUser) return;
    try {
        const { data: lovedPrayers } = await supabaseClient.from('prayers').select('id').contains('loved_by', [currentUser.id]);
        const { data: ameenedPrayers } = await supabaseClient.from('prayers').select('id').contains('ameened_by', [currentUser.id]);
        userLovedPrayers = new Set(lovedPrayers?.map(p => p.id) || []);
        userAmeenedPrayers = new Set(ameenedPrayers?.map(p => p.id) || []);
    } catch (error) { console.error("Error fetching reactions:", error); }
}

function updateHeaderProfileIcon(photoUrl) {
    const profileTab = document.querySelector('.header-nav-row a[href="/profile.html"]');
    if (!profileTab) return;
    if (photoUrl) { profileTab.innerHTML = `<img src="${photoUrl}" class="header-profile-img" alt="Profile">`; } else { profileTab.innerHTML = `<i class="fas fa-user-circle"></i>`; }
}

// প্রোফাইল ট্যাব সেটআপ
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

// ইমেজ আপলোড সেটআপ
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
    } catch (error) { 
        console.error("Upload Error:", error); 
        alert("আপলোড করতে সমস্যা হয়েছে: " + error.message); 
    } finally { 
        if(loadingModal) loadingModal.style.display = 'none'; 
        e.target.value = ''; 
    }
}

// এডিট প্রোফাইল মডাল ওপেন
function handleEditProfile() { 
    document.getElementById('editNameInput').value = currentUser.profile?.display_name || ''; 
    document.getElementById('editAddressInput').value = currentUser.profile?.address || ''; 
    document.getElementById('editProfileModal').style.display = 'flex'; 
}