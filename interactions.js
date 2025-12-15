// ====================================================================
// FILE: interactions.js
// বিবরণ: রিয়্যাকশন, পোল, পোস্ট ম্যানেজমেন্ট, ডোনেশন, শর্টস কমেন্ট,
// গ্লোবাল ইভেন্ট, নোটিফিকেশন এবং মেসেজ ব্যাজ সিস্টেম।
// আপডেট: শর্টস ট্যাবে ক্লিক করলে প্রতিবার নতুন ভিডিও আসবে (Re-shuffle)।
// ====================================================================

console.log("Interactions Module Loaded");

// ==========================================
// ১. কনফিগারেশন (OneSignal)
// ==========================================
const ONESIGNAL_APP_ID = "f32cfd0e-9004-4b77-99e1-0a668f4b0df4";
const ONESIGNAL_REST_API_KEY = "hlmvlcdziujz5fwiariyhrsqo"; 

// ==========================================
// ২. নোটিফিকেশন হেল্পার ফাংশন
// ==========================================

// অ্যাপ এবং পুশ নোটিফিকেশন তৈরি করা
async function createNotification(userId, actorId, type, content, targetUrl) { 
    if (userId === actorId) return; // নিজেকে নোটিফিকেশন পাঠানোর দরকার নেই
    
    try { 
        // ১. ডাটাবেজে সেভ করা (ইন-অ্যাপ নোটিফিকেশনের জন্য)
        await supabaseClient.from('notifications').insert({ 
            user_id: userId, 
            actor_id: actorId, 
            type: type, 
            content: content, 
            target_url: targetUrl,
            is_read: false
        }); 

        // ২. পুশ নোটিফিকেশন পাঠানো (ব্রাউজার/মোবাইল পপ-আপের জন্য)
        await sendPushNotification(userId, content, targetUrl);

    } catch (error) { 
        console.error('Notification create error:', error); 
    } 
}

// OneSignal API এর মাধ্যমে পুশ পাঠানো
async function sendPushNotification(receiverId, message, url) {
    if (!ONESIGNAL_REST_API_KEY) return;

    const options = {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: [receiverId], 
            contents: { en: message },
            headings: { en: "iPray" }, 
            url: `${window.location.origin}/${url}`
        })
    };

    try {
        await fetch('https://onesignal.com/api/v1/notifications', options);
    } catch (err) {
        console.error("Push Notification Failed:", err);
    }
}

// ==========================================
// ৩. নেভিগেশন লজিক (ট্যাব ও ফিড সুইচিং)
// ==========================================
window.setupNavigationLogic = function() {
    console.log("Initializing Navigation Logic...");

    document.querySelectorAll('.nav-tab').forEach(link => {
        link.addEventListener('click', async (e) => { // async যোগ করা হলো
            const buttonId = link.id; 
            const href = link.getAttribute('href');
            const isHomePage = document.body.id === 'home-page';

            // এই বাটনগুলো ডিফল্ট লিংকে যাবে
            if (buttonId === 'addPostLink' || href?.includes('post.html') || href?.includes('profile.html') || href?.includes('messages.html')) { 
                return; 
            }
            
            // হোমপেজে না থাকলে হোমপেজে রিডাইরেক্ট হবে
            if (!isHomePage && (href === '/index.html' || href === './index.html' || href === 'index.html')) { 
                return; 
            }

            e.preventDefault();
            
            // ----------------------------------------------------
            // SHORTS (VIDEO FEED) BUTTON LOGIC - UPDATED
            // ----------------------------------------------------
            if(buttonId === 'videoFeedBtn') { 
                // UI আপডেট
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');
                
                isVideoFeedActive = true; 
                
                // কন্টেইনার ক্লিয়ার করা
                const container = document.getElementById('feedContainer');
                if(container) container.innerHTML = ''; 

                // পেজিনেশন রিসেট
                currentPage = 0;
                noMorePrayers = false;
                isLoadingMore = false;

                // **মেইন আপডেট:** প্রতিবার ট্যাবে চাপ দিলে লিস্ট আবার শাফেল (Shuffle) হবে
                if (typeof shuffledPrayerIds !== 'undefined' && shuffledPrayerIds.length > 0) {
                    console.log("Shuffling videos for fresh feed...");
                    shuffledPrayerIds = shuffleArray(shuffledPrayerIds);
                    
                    // নতুন করে রেন্ডার করা
                    if(typeof fetchAndRenderPrayers === 'function') {
                        fetchAndRenderPrayers(container, 'active', null, true);
                    }
                } else {
                    // যদি লিস্ট খালি থাকে, নতুন করে ফেচ করবে
                    isFeedInitialized = false;
                    if(typeof initHomePage === 'function') await initHomePage(); 
                }
            } 
            // Home বাটন লজিক
            else if (buttonId === 'homeTabBtn') { 
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');

                isVideoFeedActive = false; 
                const container = document.getElementById('feedContainer');
                if(container) container.innerHTML = '';
                
                // হোম ট্যাবেও রিফ্রেশ চাইলে এখানেও শাফেল লজিক দেওয়া যায়, তবে আপাতত ডিফল্ট রাখা হলো
                if(typeof initHomePage === 'function') initHomePage(); 
            }
            // Feed Toggle (Following/For You)
            else if (buttonId === 'feedToggleBtn') {
                if (!currentUser) {
                    showLoginModal();
                    return;
                }
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');

                handleFollowingFeedSwitch();
            }
        });
    });
};

// ==========================================
// ৪. গ্লোবাল ইভেন্ট লিসেনার সেটআপ
// ==========================================
window.setupEventListeners = function() {
    console.log("Setting up Global Event Listeners...");
    
    // ১. সেন্ট্রাল ক্লিক হ্যান্ডলার (সব ডায়নামিক বাটনের জন্য)
    document.addEventListener('click', handleGlobalClick);

    // ২. নোটিফিকেশন প্যানেল টগল
    const notifBtn = document.getElementById('notificationBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentUser) { showLoginModal(); return; }
            const modal = document.getElementById('notificationModal');
            modal.classList.add('active');
            loadNotifications(); 
        });
    }

    const closeNotifBtn = document.getElementById('closeNotificationModalBtn');
    if (closeNotifBtn) {
        closeNotifBtn.addEventListener('click', () => {
            document.getElementById('notificationModal').classList.remove('active');
        });
    }
    
    const clearNotifBtn = document.getElementById('clear-all-notif-btn');
    if (clearNotifBtn) {
        clearNotifBtn.addEventListener('click', clearAllNotifications);
    }
    
    const markReadBtn = document.getElementById('mark-all-read-btn-modal');
    if (markReadBtn) {
        markReadBtn.addEventListener('click', markAllNotificationsAsRead);
    }

    // ৩. ডোনেশন ও রিপোর্ট ফর্ম সাবমিশন
    const generalDonationForm = document.getElementById('submitGeneralDonation');
    if (generalDonationForm) {
        generalDonationForm.addEventListener('submit', handleGeneralDonationSubmit);
    }

    const reportSubmitBtn = document.getElementById('submitReportBtn');
    if(reportSubmitBtn) {
        const newBtn = reportSubmitBtn.cloneNode(true);
        reportSubmitBtn.parentNode.replaceChild(newBtn, reportSubmitBtn);
        newBtn.addEventListener('click', handleReportSubmit);
    }

    // ৪. শর্টস কমেন্ট ফর্ম
    const shortsForm = document.getElementById('shortsCommentForm');
    if (shortsForm) {
        shortsForm.addEventListener('submit', handleShortsCommentSubmit);
    }

    // ৫. স্টোরি নেভিগেশন
    document.getElementById('closeStoryViewerBtn')?.addEventListener('click', closeStoryViewer); 
    document.getElementById('nextStoryBtn')?.addEventListener('click', nextStoryItem); 
    document.getElementById('prevStoryBtn')?.addEventListener('click', prevStoryItem);

    // ৬. সার্চ ফাংশনালিটি
    setupSearchFunctionality();

    // ৭. মেসেজ ব্যাজ চেক (লগইন থাকলে)
    if (currentUser) {
        checkUnreadMessages();
        setupMessageBadgeListener();
    } else {
        // auth.js লোড হওয়ার জন্য একটু অপেক্ষা
        setTimeout(() => {
            if(currentUser) {
                checkUnreadMessages();
                setupMessageBadgeListener();
            }
        }, 1500);
    }
};

// ==========================================
// ৫. গ্লোবাল ক্লিক হ্যান্ডলার (Central Click Logic)
// ==========================================
async function handleGlobalClick(e) {
    // --- Notification Delete ---
    const deleteNotifBtn = e.target.closest('.delete-notif-btn');
    if(deleteNotifBtn) { 
        e.stopPropagation(); 
        deleteNotification(deleteNotifBtn.dataset.id); 
        return; 
    }

    // --- Protected Links ---
    const profileLink = e.target.closest('a[href="/profile.html"]');
    if (profileLink && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    const messengerLink = e.target.closest('a[href="messages.html"]');
    if (messengerLink && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    // --- Donation Triggers ---
    if (e.target.closest('#globalDonateBtn')) { openGeneralDonationModal(); return; }
    
    const donateBtn = e.target.closest('.donate-btn, .donate-btn-modern');
    if (donateBtn) {
        const campaignId = parseInt(donateBtn.dataset.id, 10);
        openCampaignDonationModal(campaignId);
        return;
    }

    // --- Follow Button ---
    const followBtn = e.target.closest('#followBtn, .follow-btn'); 
    if (followBtn) { 
        handleFollow(followBtn); 
        return; 
    }
    
    // --- Reactions (Love/Ameen) ---
    if (e.target.closest('.ameen-btn') || e.target.closest('.love-btn')) {
        const btn = e.target.closest('.action-btn') || e.target.closest('.short-action-btn'); 
        const id = parseInt(btn.dataset.id, 10);
        const type = btn.classList.contains('love-btn') ? 'love' : 'ameen';
        handleReaction(id, type, btn);
        return;
    }

    // --- Shorts Comments ---
    const shortsCommentBtn = e.target.closest('.shorts-comment-trigger');
    if (shortsCommentBtn) {
        e.preventDefault(); 
        const postId = shortsCommentBtn.dataset.id;
        openShortsModal(postId); 
        return;
    }

    if (e.target.closest('#closeShortsModalBtn') || e.target.closest('#closeShortsModalOverlay')) {
        closeShortsModal();
        return;
    }

    // --- Notification Item Click ---
    const notifItem = e.target.closest('.notification-item');
    if (notifItem && !e.target.closest('.delete-notif-btn')) { 
        const url = notifItem.dataset.url; 
        markNotificationAsRead(notifItem.dataset.id); 
        if (url && url.startsWith('post_id=')) { 
            const prayerId = parseInt(url.split('=')[1]); 
            window.location.href = `comments.html?postId=${prayerId}`; 
        } else if (url) { 
            window.location.href = url; 
        }
        document.getElementById('notificationModal').classList.remove('active'); 
        return; 
    }
    
    // --- Share Button ---
    const shareBtn = e.target.closest('.share-btn'); 
    if (shareBtn) { 
        const prayerId = shareBtn.dataset.id; 
        const prayerTitle = shareBtn.dataset.title; 
        const prayerText = shareBtn.dataset.text || '';
        const url = `${window.location.origin}/comments.html?postId=${prayerId}`;
        const fullShareText = `${prayerTitle}\n\n${prayerText}\n\nআমিন বলতে নিচের লিংকে ক্লিক করুন:\n${url}`;
        
        if (navigator.share) { 
            navigator.share({ title: prayerTitle, text: fullShareText, url: url }).catch(error => console.log('শেয়ার এরর:', error)); 
        } else { 
            navigator.clipboard.writeText(fullShareText).then(() => { alert('লিংক কপি হয়েছে!'); }, () => { alert('কপি করা যায়নি।'); }); 
        } 
        return; 
    }
    
    // --- Image Viewer ---
    const postImage = e.target.closest('.post-image, .fundraising-image'); 
    if (postImage) { 
        const modal = document.getElementById('image-view-modal'); 
        const modalImg = document.getElementById('modal-image'); 
        modal.style.display = "flex"; 
        modalImg.src = postImage.dataset.src || postImage.src; 
        return; 
    }
    const closeImageModal = e.target.closest('.close-image-modal, .image-modal'); 
    if (closeImageModal && !e.target.closest('.image-modal-content')) { 
        document.getElementById('image-view-modal').style.display = "none"; 
        return; 
    }
    
    // --- Auth Buttons ---
    if (e.target.closest('#googleSignInBtn')) handleGoogleSignIn();
    if (e.target.closest('#facebookSignInBtn')) handleFacebookSignIn();
    if (e.target.closest('#signOutBtn')) { await supabaseClient.auth.signOut(); handleUserLoggedOut(); }
    
    const addPostLink = e.target.closest('#addPostLink'); 
    if (addPostLink && !currentUser) { e.preventDefault(); showLoginModal(); }
    
    const saveBtn = e.target.closest('.save-btn'); 
    if (saveBtn) { handleSavePost(saveBtn); return; }
    
    // --- Post Management Actions ---
    const editPostBtn = e.target.closest('.edit-post-btn'); if (editPostBtn) handleEditPost(editPostBtn);
    const deletePostBtn = e.target.closest('.delete-post-btn'); if (deletePostBtn) handleDeletePost(deletePostBtn);
    const hidePostBtn = e.target.closest('.hide-post-btn'); if (hidePostBtn) handleHidePost(hidePostBtn);
    const unhidePostBtn = e.target.closest('.unhide-post-btn'); if (unhidePostBtn) handleUnhidePost(unhidePostBtn);
    const toggleAnsweredBtn = e.target.closest('.toggle-answered-btn'); if (toggleAnsweredBtn) handleToggleAnswered(toggleAnsweredBtn);
    
    // --- Report Action ---
    const reportContentBtn = e.target.closest('.report-content-btn');
    if (reportContentBtn) {
        showReportModal(reportContentBtn.dataset.id, reportContentBtn.dataset.type);
        const dropdown = reportContentBtn.closest('.dropdown-menu');
        if(dropdown) dropdown.style.display = 'none';
    }

    // --- Modal Close ---
    if (e.target.closest('.close-btn')) { const modal = e.target.closest('.modal'); if(modal) modal.style.display = 'none'; }
    
    // --- Dropdown Menu Trigger ---
    const menuTrigger = e.target.closest('.actions-menu-trigger');
    if (menuTrigger) {
        e.stopPropagation();
        const dropdownId = menuTrigger.dataset.dropdownId;
        const dropdown = document.getElementById(dropdownId);
        document.querySelectorAll('.dropdown-menu').forEach(d => { if (d.id !== dropdownId) d.style.display = 'none'; });
        if (dropdown) dropdown.style.display = (dropdown.style.display === 'block') ? 'none' : 'block';
    } else {
        // Outside click closes dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none');
    }
}

// ==========================================
// ৬. মেসেজ ব্যাজ লজিক (Message Badge)
// ==========================================

// আনরেড মেসেজ চেক করা
async function checkUnreadMessages() {
    if (!currentUser) return;
    try {
        const { count, error } = await supabaseClient
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false);

        if (!error) {
            updateMsgBadgeUI(count);
        }
    } catch (e) { 
        console.error("Badge Check Error:", e); 
    }
}

// UI আপডেট করা
function updateMsgBadgeUI(count) {
    const badge = document.getElementById('msg-badge-count');
    if (badge) {
        if (count > 0) {
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.innerText = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    }
}

// রিয়েলটাইম লিসেনার (মেসেজ আসলে বা পড়লে আপডেট হবে)
function setupMessageBadgeListener() {
    if(!currentUser) return;
    
    // আগের চ্যানেল থাকলে রিমুভ করা
    supabaseClient.removeChannel('msg-badge-channel');

    supabaseClient.channel('msg-badge-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
            // যদি নতুন মেসেজ আসে (INSERT) অথবা মেসেজ পড়া হয় (UPDATE)
            if (payload.new.receiver_id === currentUser.id || payload.old?.receiver_id === currentUser.id) {
                checkUnreadMessages();
            }
        })
        .subscribe();
}

// ==========================================
// ৭. নোটিফিকেশন লোডিং এবং ম্যানেজমেন্ট
// ==========================================
async function loadNotifications() {
    const list = document.getElementById('notification-list-modal');
    if (!list) return;
    
    list.innerHTML = '<div class="loader-container" style="padding:20px;text-align:center;"><div class="loader"></div></div>';

    try {
        const { data, error } = await supabaseClient
            .from('notifications')
            .select(`*, users:actor_id(display_name, photo_url)`)
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        list.innerHTML = '';
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="no-results-message" style="padding:20px;text-align:center;">কোনো নোটিফিকেশন নেই।</div>';
            return;
        }

        data.forEach(n => {
            const actorName = n.users?.display_name || 'Unknown';
            const actorPhoto = n.users?.photo_url || './images/default-avatar.png';
            const isUnread = !n.is_read;
            const time = timeAgo(n.created_at);

            const item = document.createElement('div');
            item.className = `notification-item ${isUnread ? 'unread' : ''}`;
            item.dataset.id = n.id;
            item.dataset.url = n.target_url;

            item.innerHTML = `
                <img src="${actorPhoto}" alt="User" style="width:40px;height:40px;border-radius:50%;margin-right:10px;object-fit:cover;">
                <div class="notification-content" style="flex:1;">
                    <p><strong>${actorName}</strong> ${n.content}</p>
                    <small>${time}</small>
                </div>
                <button class="delete-notif-btn" data-id="${n.id}"><i class="fas fa-trash-alt"></i></button>
            `;
            list.appendChild(item);
        });
        
        updateNotificationBadge(data.filter(n => !n.is_read).length);

    } catch (err) {
        console.error('Notification Load Error:', err);
        list.innerHTML = '<p style="text-align:center;color:red;">নোটিফিকেশন লোড করা যায়নি।</p>';
    }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (count > 0) {
            badge.style.display = 'flex';
            badge.innerText = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    }
}

async function markNotificationAsRead(id) {
    try {
        await supabaseClient.from('notifications').update({ is_read: true }).eq('id', id);
        const item = document.querySelector(`.notification-item[data-id="${id}"]`);
        if(item) item.classList.remove('unread');
    } catch (e) { console.error(e); }
}

async function markAllNotificationsAsRead() {
    try {
        await supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
        document.querySelectorAll('.notification-item').forEach(el => el.classList.remove('unread'));
        updateNotificationBadge(0);
    } catch (e) { console.error(e); }
}

async function deleteNotification(id) {
    try {
        await supabaseClient.from('notifications').delete().eq('id', id);
        const item = document.querySelector(`.notification-item[data-id="${id}"]`);
        if (item) item.remove();
    } catch (e) { console.error(e); }
}

async function clearAllNotifications() {
    if (!confirm('সব নোটিফিকেশন মুছে ফেলতে চান?')) return;
    try {
        await supabaseClient.from('notifications').delete().eq('user_id', currentUser.id);
        loadNotifications();
    } catch (e) { console.error(e); }
}

// ==========================================
// ৮. পোস্ট ম্যানেজমেন্ট (Delete/Hide/Edit/Unhide)
// ==========================================
async function handleDeletePost(btn) {
    const postId = btn.dataset.id;
    if (!confirm('আপনি কি নিশ্চিত যে এই পোস্টটি ডিলিট করতে চান?')) return;

    try {
        const { error } = await supabaseClient.from('prayers').delete().eq('id', postId);
        if (error) throw error;

        const card = document.getElementById(`prayer-${postId}`);
        if (card) {
            card.style.transition = 'opacity 0.5s';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 500);
        }
        alert('পোস্ট ডিলিট করা হয়েছে।');
    } catch (error) {
        console.error('Delete error:', error);
        alert('পোস্ট ডিলিট করতে সমস্যা হয়েছে।');
    }
}

async function handleHidePost(btn) {
    const postId = btn.dataset.id;
    if (!confirm('পোস্টটি লুকাতে চান?')) return;

    try {
        const { error } = await supabaseClient.from('prayers').update({ status: 'hidden' }).eq('id', postId);
        if (error) throw error;
        const card = document.getElementById(`prayer-${postId}`);
        if (card) card.remove();
        alert('পোস্টটি লুকানো হয়েছে।');
    } catch (error) {
        alert('সমস্যা হয়েছে।');
    }
}

async function handleUnhidePost(btn) {
    const postId = btn.dataset.id;
    try {
        const { error } = await supabaseClient.from('prayers').update({ status: 'active' }).eq('id', postId);
        if (error) throw error;
        const card = document.getElementById(`prayer-${postId}`);
        if (card) card.remove();
        alert('পোস্টটি এখন সবার জন্য দৃশ্যমান।');
    } catch (error) {
        alert('সমস্যা হয়েছে।');
    }
}

// "দোয়া কবুল হয়েছে" টগল ফাংশন
async function handleToggleAnswered(btn) {
    const postId = btn.dataset.id;
    const currentStatus = btn.dataset.current === 'true';
    const newStatus = !currentStatus;

    try {
        const { error } = await supabaseClient.from('prayers').update({ is_answered: newStatus }).eq('id', postId);
        if (error) throw error;

        const card = document.getElementById(`prayer-${postId}`);
        if (card) {
            btn.dataset.current = newStatus;
            btn.innerHTML = newStatus 
                ? '<i class="fas fa-times-circle"></i> আনমার্ক করুন' 
                : '<i class="fas fa-check-circle"></i> দোয়া কবুল হয়েছে';
            
            const existingBadge = card.querySelector('.answered-badge');
            if (newStatus && !existingBadge) {
                const badge = document.createElement('div');
                badge.className = 'answered-badge';
                badge.innerHTML = '<i class="fas fa-check-circle"></i> আলহামদুলিল্লাহ, দোয়া কবুল হয়েছে';
                const body = card.querySelector('.card-body');
                if(body) body.prepend(badge);
            } else if (!newStatus && existingBadge) {
                existingBadge.remove();
            }
        }
        alert(newStatus ? 'দোয়া কবুল হিসেবে মার্ক করা হলো।' : 'আনমার্ক করা হলো।');
    } catch (error) {
        alert('আপডেট করতে সমস্যা হয়েছে।');
    }
}

function handleEditPost(btn) {
    const postId = btn.dataset.id;
    const card = document.getElementById(`prayer-${postId}`);
    if (!card) return;

    const titleEl = card.querySelector('.prayer-title');
    const detailsEl = card.querySelector('.prayer-details');
    
    document.getElementById('editPrayerId').value = postId;
    document.getElementById('editPrayerTitleInput').value = titleEl ? titleEl.innerText : '';
    document.getElementById('editPrayerDetailsTextarea').value = detailsEl ? detailsEl.innerText : '';
    
    document.getElementById('editPrayerModal').style.display = 'flex';
    
    const form = document.getElementById('editPrayerForm');
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('savePrayerBtn');
        setLoading(saveBtn, true);
        
        const newTitle = document.getElementById('editPrayerTitleInput').value;
        const newDetails = document.getElementById('editPrayerDetailsTextarea').value;
        const newYoutube = document.getElementById('editYoutubeLinkInput').value;

        try {
            const { error } = await supabaseClient.from('prayers').update({ 
                title: newTitle, 
                details: newDetails,
                youtube_url: newYoutube 
            }).eq('id', postId);

            if (error) throw error;

            if (titleEl) titleEl.innerText = newTitle;
            if (detailsEl) detailsEl.innerText = newDetails;
            
            alert('পোস্ট আপডেট হয়েছে!');
            document.getElementById('editPrayerModal').style.display = 'none';
        } catch (err) {
            alert('আপডেট করতে সমস্যা হয়েছে।');
        } finally {
            setLoading(saveBtn, false);
        }
    });
}

// ====================================
// REPORT LOGIC
// ====================================
function showReportModal(contentId, contentType) { 
    const reportModal = document.getElementById('reportModal'); 
    if (!reportModal) return; 
    
    const reportForm = document.getElementById('reportForm'); 
    if (reportForm) reportForm.reset(); 
    
    document.getElementById('reportContentId').value = contentId; 
    document.getElementById('reportContentType').value = contentType; 
    
    reportModal.style.display = 'flex'; 
}

async function handleReportSubmit() { 
    const btn = document.getElementById('submitReportBtn'); 
    const contentId = document.getElementById('reportContentId').value; 
    const contentType = document.getElementById('reportContentType').value; 
    const category = document.getElementById('reportCategory').value; 
    const description = document.getElementById('reportDescription').value; 
    
    if (!category) { alert('অনুগ্রহ করে একটি কারণ নির্বাচন করুন।'); return; } 
    
    setLoading(btn, true); 
    
    if (typeof reportSystem !== 'undefined') {
        const success = await reportSystem.submitReport(contentId, contentType, category, description); 
        if (success) { 
            document.getElementById('reportModal').style.display = 'none'; 
        }
    } else {
        try {
            const { error } = await supabaseClient.from('content_reports').insert([{
                content_id: contentId,
                content_type: contentType,
                reporter_id: currentUser.id,
                category: category,
                description: description,
                status: 'PENDING',
                priority: 'MEDIUM'
            }]);
            if(error) throw error;
            alert('রিপোর্ট জমা দেওয়া হয়েছে।');
            document.getElementById('reportModal').style.display = 'none'; 
        } catch(e) {
            alert('সমস্যা হয়েছে।');
        }
    }
    
    setLoading(btn, false); 
}

function handleFollowingFeedSwitch() { 
    if (!currentUser) { showLoginModal(); return; } 
    isVideoFeedActive = false; filteredUserId = null; 
    currentFeedType = (currentFeedType === 'for_you') ? 'following' : 'for_you'; 
    
    const feedContainer = document.getElementById('feedContainer');
    if(feedContainer) {
        feedContainer.innerHTML = '';
        if(typeof fetchAndRenderPrayers === 'function') {
            fetchAndRenderPrayers(feedContainer, 'active', null, true);
        }
    }
}

// Search
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

// Navigation & Auth Helpers
function handleFollow(btn) {
    if(typeof window.handleFollowAuth === 'function') {
        window.handleFollowAuth(btn);
    } else {
        if (!currentUser) showLoginModal();
    }
}

// ==========================================
// ১০. রিয়্যাকশন লজিক (Reaction)
// ==========================================
window.handleReaction = async function(prayerId, type, btn) {
    if (!currentUser) { showLoginModal(); return; }
    prayerId = parseInt(prayerId, 10); if (isNaN(prayerId)) return;
    btn.disabled = true;
    const isLove = type === 'love';
    
    const card = document.getElementById(`prayer-${prayerId}`) || document.getElementById(`short-${prayerId}`); 
    if (!card) return;
    
    const countSpan = card.querySelector(isLove ? '.love-count' : '.ameen-count');
    const icon = btn.querySelector('i');
    let currentCount = parseInt((countSpan.innerText || '0').replace(/,/g, ''), 10); if (isNaN(currentCount)) currentCount = 0;
    const wasActive = btn.classList.contains(isLove ? 'loved' : 'ameened');
    const newActiveState = !wasActive;
    const newCount = newActiveState ? (currentCount + 1) : Math.max(0, currentCount - 1);

    btn.classList.toggle(isLove ? 'loved' : 'ameened', newActiveState);
    countSpan.innerText = newCount; 
    
    if (isLove && icon) { 
        icon.className = newActiveState ? 'fas fa-heart' : 'far fa-heart'; 
        if(newActiveState && isVideoFeedActive) icon.style.color = '#e44d62';
    }

    try {
        const { error } = await supabaseClient.rpc('toggle_reaction', { p_id: prayerId, u_id: currentUser.id, r_type: type });
        if (error) throw error;
        if (isLove) { if (newActiveState) { userLovedPrayers.add(prayerId); } else { userLovedPrayers.delete(prayerId); } } 
        else { if (newActiveState) { userAmeenedPrayers.add(prayerId); } else { userAmeenedPrayers.delete(prayerId); } }
        
        const prayer = allFetchedPrayers.get(prayerId);
        if (prayer) {
            const listKey = isLove ? 'loved_by' : 'ameened_by'; const countKey = isLove ? 'love_count' : 'ameen_count';
            let list = prayer[listKey] || [];
            if (newActiveState) { if (!list.includes(currentUser.id)) list.push(currentUser.id); } else { list = list.filter(id => id !== currentUser.id); }
            prayer[listKey] = list; prayer[countKey] = newCount; allFetchedPrayers.set(prayerId, prayer);
        }
        if (newActiveState && prayer && prayer.author_uid !== currentUser.id) {
            const notifMsg = `${currentUser.profile.display_name} আপনার দোয়ায় ${isLove ? 'লাভ' : 'আমিন'} দিয়েছেন।`;
            createNotification(prayer.author_uid, currentUser.id, type, notifMsg, `post_id=${prayerId}`);
        }
    } catch (error) {
        console.error('Reaction error:', error);
        btn.classList.toggle(isLove ? 'loved' : 'ameened', wasActive); countSpan.innerText = currentCount;
        alert("নেটওয়ার্ক সমস্যার কারণে রিয়্যাকশন সেভ হয়নি।");
    } finally { setTimeout(() => { btn.disabled = false; }, 300); }
};

// ==========================================
// ১১. অন্যান্য লজিক (Poll, Save)
// ==========================================
window.handlePollVote = async function(prayerId, optionId) {
    if (!currentUser) { showLoginModal(); return; }
    try {
        const { data: post } = await supabaseClient.from('prayers').select('poll_votes').eq('id', prayerId).single();
        let currentVotes = post.poll_votes || {}; currentVotes[currentUser.id] = optionId;
        const { error } = await supabaseClient.from('prayers').update({ poll_votes: currentVotes }).eq('id', prayerId);
        if (error) throw error;
        post.poll_votes = currentVotes; allFetchedPrayers.set(prayerId, { ...allFetchedPrayers.get(prayerId), poll_votes: currentVotes });
        if(typeof createPollCardElement === 'function') {
            const card = document.getElementById(`prayer-${prayerId}`); if(card) card.replaceWith(createPollCardElement(allFetchedPrayers.get(prayerId)));
        }
    } catch (err) { console.error("Voting failed:", err); alert("ভোট দিতে সমস্যা হয়েছে।"); }
};

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

// ==========================================
// ১২. ডোনেশন ম্যানেজমেন্ট (Donation Logic)
// ==========================================
window.openGeneralDonationModal = function() {
    const modal = document.getElementById('generalDonationModal');
    if (modal) { modal.style.display = 'flex'; loadAdminPaymentMethods(); }
};

window.openCampaignDonationModal = function(campaignId) {
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
};

window.openDonationConfirmation = function() {
    if(!currentUser) { showLoginModal(); return; }
    if(!activeDonationCampaignId) return;
    const modalBody = document.getElementById('donationDetailsBody');
    modalBody.innerHTML = `<h3>ডোনেশন কনফার্ম করুন</h3><form id="campaignDonationForm"><div class="form-group"><label>টাকার পরিমাণ</label><input type="number" id="campAmount" required></div><div class="form-group"><label>আপনার নাম্বার (প্রেরক)</label><input type="text" id="campSender" required></div><div class="form-group"><label>TrxID</label><input type="text" id="campTrxId" required></div><div class="form-group"><label>পেমেন্ট মেথড</label><select id="campMethod"><option value="Bkash">Bkash</option><option value="Nagad">Nagad</option><option value="Rocket">Rocket</option><option value="Bank">Bank</option></select></div><button type="submit" class="btn-full-width">জমা দিন</button></form>`;
    document.getElementById('campaignDonationForm').addEventListener('submit', submitDonationDetails);
};

async function submitDonationDetails(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button'); setLoading(btn, true);
    const amount = document.getElementById('campAmount').value;
    const sender = document.getElementById('campSender').value;
    const trxId = document.getElementById('campTrxId').value;
    const method = document.getElementById('campMethod').value;
    
    try {
        const { error } = await supabaseClient.from('donation_requests').insert({ user_id: currentUser.id, prayer_id: activeDonationCampaignId, amount: amount, sender_number: sender, trx_id: trxId, payment_method: method, status: 'PENDING' });
        if(error) throw error;
        alert('ধন্যবাদ! আপনার ডোনেশন তথ্য জমা হয়েছে।');
        document.getElementById('donationModal').style.display = 'none';
    } catch(err) { alert('সমস্যা হয়েছে: ' + err.message); } finally { setLoading(btn, false); }
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
                    html += `<div class="pay-option" onclick="selectGenPaymentMethod('${m.name}', '${m.num}')"><img src="${m.logo}" alt="${m.name}" onerror="this.style.display='none'"><span>${m.name}</span></div>`;
                }
            });
            
            if(html === '') html = '<p>বর্তমানে কোনো পেমেন্ট মেথড সক্রিয় নেই।</p>';
            container.innerHTML = html;
        }
    } catch (error) { container.innerHTML = '<p>পেমেন্ট তথ্য লোড করা যায়নি।</p>'; }
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
    if(num) { navigator.clipboard.writeText(num).then(() => alert('নাম্বার কপি হয়েছে!')); }
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
    const btn = e.target.querySelector('button'); setLoading(btn, true);
    
    try {
        const { error } = await supabaseClient.from('donation_requests').insert({ user_id: currentUser.id, amount: amount, sender_number: sender, trx_id: trxId, payment_method: method, status: 'PENDING' });
        if(error) throw error;
        alert('আপনার তথ্য জমা হয়েছে। এডমিন যাচাই করে অ্যাপ্রুভ করবেন।');
        e.target.reset(); document.getElementById('generalDonationModal').style.display = 'none';
    } catch(err) { alert('সমস্যা হয়েছে।'); } finally { setLoading(btn, false); }
}

async function loadDonationHistory() {
    if(!currentUser) return;
    const container = document.getElementById('donationHistoryList');
    container.innerHTML = '<p style="text-align:center;">লোড হচ্ছে...</p>';
    try {
        const { data, error } = await supabaseClient.from('donation_requests').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if(error) throw error;
        if(!data || data.length === 0) { container.innerHTML = '<p style="text-align:center;">কোনো হিস্ট্রি নেই।</p>'; return; }
        container.innerHTML = data.map(d => `<div class="notification-item" style="cursor:default;"><div style="flex:1;"><strong>৳ ${d.amount}</strong> (${d.payment_method})<br><small>${new Date(d.created_at).toLocaleDateString()}</small></div><div><span class="badge" style="background:${d.status === 'APPROVED' ? '#27ae60' : (d.status === 'REJECTED' ? '#c0392b' : '#f39c12')}; color:white; padding:4px 8px; border-radius:4px; font-size:12px;">${d.status}</span></div></div>`).join('');
    } catch(err) { container.innerHTML = '<p>হিস্ট্রি লোড করা যায়নি।</p>'; }
}

// ==========================================
// ১৩. শর্টস কমেন্ট এবং মডাল লজিক (Shorts)
// ==========================================
function openShortsModal(postId) {
    const modal = document.getElementById('shortsCommentModal');
    if (!modal) return;

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    document.getElementById('shortsPostId').value = postId;
    
    const myAvatarDiv = document.getElementById('myShortsAvatar');
    if (currentUser && currentUser.profile && currentUser.profile.photo_url) {
        myAvatarDiv.innerHTML = `<img src="${currentUser.profile.photo_url}" alt="Me">`;
    } else {
        myAvatarDiv.innerHTML = `<i class="fas fa-user-circle" style="font-size: 32px; color: #ccc;"></i>`;
    }

    loadShortsComments(postId);
}

function closeShortsModal() {
    const modal = document.getElementById('shortsCommentModal');
    if (!modal) return;
    
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('shortsCommentsList').innerHTML = '<div class="loader-container" style="display:flex;justify-content:center;padding:20px;"><div class="loader"></div></div>';
    }, 300);
}

async function loadShortsComments(postId) {
    const container = document.getElementById('shortsCommentsList');
    const countSpan = document.getElementById('shortsCommentCount');
    
    try {
        const { data: comments, error } = await supabaseClient
            .from('comments')
            .select(`*, users:author_uid(display_name, photo_url)`)
            .eq('prayer_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (countSpan) countSpan.innerText = `(${comments.length})`;
        container.innerHTML = '';

        if (comments.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#666; margin-top:20px;">এখনো কোনো কমেন্ট নেই।</p>';
            return;
        }

        container.innerHTML = comments.map(c => {
            const authorName = c.users?.display_name || 'Unknown';
            const authorPhoto = c.users?.photo_url || './images/default-avatar.png';
            const time = timeAgo(c.created_at);
            
            return `
                <div class="sheet-comment-item">
                    <img src="${authorPhoto}" class="sheet-comment-avatar">
                    <div>
                        <div class="sheet-comment-box">
                            <span class="sheet-comment-name">${authorName}</span>
                            <span class="sheet-comment-text">${c.text || '(অডিও কমেন্ট)'}</span>
                        </div>
                        <div class="sheet-comment-meta">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.scrollTop = container.scrollHeight;

    } catch (err) {
        console.error("Comments Load Error:", err);
        container.innerHTML = '<p style="text-align:center; color:red;">কমেন্ট লোড করা যায়নি।</p>';
    }
}

async function handleShortsCommentSubmit(e) {
    e.preventDefault();
    if (!currentUser) { showLoginModal(); return; }

    const input = document.getElementById('shortsCommentInput');
    const postId = document.getElementById('shortsPostId').value;
    const text = input.value.trim();
    const btn = document.getElementById('submitShortsCommentBtn');

    if (!text) return;

    btn.disabled = true;
    
    try {
        const { error } = await supabaseClient
            .from('comments')
            .insert({ prayer_id: postId, author_uid: currentUser.id, text: text });

        if (error) throw error;

        input.value = '';
        await loadShortsComments(postId);
        
        const prayer = allFetchedPrayers.get(parseInt(postId));
        if (prayer && prayer.author_uid !== currentUser.id) {
             const notifMsg = `${currentUser.profile.display_name} আপনার ভিডিওতে কমেন্ট করেছেন।`;
             createNotification(prayer.author_uid, currentUser.id, 'comment', notifMsg, `comments.html?postId=${postId}`);
        }

    } catch (err) {
        console.error("Comment Post Error:", err);
        alert("কমেন্ট পোস্ট করা যায়নি।");
    } finally {
        btn.disabled = false;
    }
}