// ====================================
// FILE: interactions.js
// বিবরণ: রিয়্যাকশন, পোল, পোস্ট ম্যানেজমেন্ট, ডোনেশন, শর্টস কমেন্ট এবং গ্লোবাল ইভেন্ট হ্যান্ডলার
// ====================================

console.log("Interactions Module Loaded");

// --- OneSignal Configuration ---
// আপনার OneSignal ড্যাশবোর্ড > Settings > Keys & IDs থেকে REST API Key টি কপি করে নিচে বসান
const ONESIGNAL_APP_ID = "f32cfd0e-9004-4b77-99e1-0a668f4b0df4";
const ONSIGNAL_API_KEY = "hlmvlcdziujz5fwiariyhrsqo"; 

// --- Create Notification Helper (Updated for Push) ---
async function createNotification(userId, actorId, type, content, targetUrl) { 
    if (userId === actorId) return; 
    
    try { 
        // ১. ডাটাবেজে সেভ করা (ইন-অ্যাপ নোটিফিকেশনের জন্য)
        await supabaseClient.from('notifications').insert({ 
            user_id: userId, 
            actor_id: actorId, 
            type: type, 
            content: content, 
            target_url: targetUrl 
        }); 

        // ২. পুশ নোটিফিকেশন পাঠানো (মোবাইল/পিসিতে পপ-আপ আসার জন্য)
        await sendPushNotification(userId, content, targetUrl);

    } catch (error) { 
        console.error('Notification create error:', error); 
    } 
}

// --- Send Push Notification Function (New) ---
async function sendPushNotification(receiverId, message, url) {
    // API Key না থাকলে কাজ করবে না
    if (ONESIGNAL_API_KEY === "আপনার_REST_API_KEY_এখানে_বসাবেন") {
        console.warn("Push Notification Sent skipped: API Key missing.");
        return;
    }

    const options = {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: `Basic ${ONESIGNAL_API_KEY}`
        },
        body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_external_user_ids: [receiverId], // যাকে পাঠাচ্ছেন তার ID
            contents: { en: message }, // মেসেজ
            headings: { en: "iPray" }, // টাইটেল
            url: `${window.location.origin}/${url}` // ক্লিক করলে যেখানে যাবে
        })
    };

    try {
        await fetch('https://onesignal.com/api/v1/notifications', options);
        console.log("Push Notification Sent!");
    } catch (err) {
        console.error("Push Notification Failed:", err);
    }
}

// ====================================
// NAVIGATION LOGIC (Tabs & Feeds)
// ====================================
window.setupNavigationLogic = function() {
    console.log("Initializing Navigation Logic...");

    document.querySelectorAll('.nav-tab').forEach(link => {
        link.addEventListener('click', (e) => {
            const buttonId = link.id; 
            const href = link.getAttribute('href');
            const isHomePage = document.body.id === 'home-page';

            if (buttonId === 'addPostLink' || href?.includes('post.html') || href?.includes('profile.html')) { 
                return; 
            }
            
            if (!isHomePage && (href === '/index.html' || href === './index.html' || href === 'index.html')) { 
                return; 
            }

            e.preventDefault();
            
            // Shorts Button Logic
            if(buttonId === 'videoFeedBtn') { 
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');
                
                isVideoFeedActive = true; 
                const container = document.getElementById('feedContainer');
                if(container) container.innerHTML = '';
                
                if(typeof initHomePage === 'function') initHomePage(); 
            } 
            // Home Button Logic
            else if (buttonId === 'homeTabBtn') { 
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');

                isVideoFeedActive = false; 
                const container = document.getElementById('feedContainer');
                if(container) container.innerHTML = '';
                
                if(typeof initHomePage === 'function') initHomePage(); 
            }
            // Feed Toggle (Login Check)
            else if (buttonId === 'feedToggleBtn') {
                if (!currentUser) {
                    showLoginModal();
                    return;
                }
                document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
                link.classList.add('active');

                if(typeof handleFollowingFeedSwitch === 'function') {
                    handleFollowingFeedSwitch();
                }
            }
        });
    });
};

// ====================================
// GLOBAL EVENT LISTENER SETUP
// ====================================
window.setupEventListeners = function() {
    console.log("Setting up Global Event Listeners...");
    
    // 1. Global Click Handler
    document.addEventListener('click', handleGlobalClick);

    // 2. Notification Toggles
    const notifBtn = document.getElementById('notificationBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!currentUser) { showLoginModal(); return; }
            const modal = document.getElementById('notificationModal');
            modal.classList.add('active');
            if(typeof loadNotifications === 'function') loadNotifications();
        });
    }

    const closeNotifBtn = document.getElementById('closeNotificationModalBtn');
    if (closeNotifBtn) {
        closeNotifBtn.addEventListener('click', () => {
            document.getElementById('notificationModal').classList.remove('active');
        });
    }

    // 3. Form Submissions
    const generalDonationForm = document.getElementById('submitGeneralDonation');
    if (generalDonationForm) {
        generalDonationForm.addEventListener('submit', handleGeneralDonationSubmit);
    }

    const reportBtn = document.getElementById('submitReportBtn');
    if(reportBtn) {
        reportBtn.addEventListener('click', handleReportSubmit);
    }

    // 4. Shorts Comment Form
    const shortsForm = document.getElementById('shortsCommentForm');
    if (shortsForm) {
        shortsForm.addEventListener('submit', handleShortsCommentSubmit);
    }

    // 5. Story Navigation
    document.getElementById('closeStoryViewerBtn')?.addEventListener('click', closeStoryViewer); 
    document.getElementById('nextStoryBtn')?.addEventListener('click', nextStoryItem); 
    document.getElementById('prevStoryBtn')?.addEventListener('click', prevStoryItem);

    // 6. Search
    setupSearchFunctionality();
};

// ====================================
// GLOBAL CLICK HANDLER
// ====================================
async function handleGlobalClick(e) {
    // 1. Notification Delete
    const deleteNotifBtn = e.target.closest('.delete-notif-btn');
    if(deleteNotifBtn) { e.stopPropagation(); if(typeof deleteNotification === 'function') deleteNotification(deleteNotifBtn.dataset.id); return; }

    // 2. Profile Link Protection
    const profileLink = e.target.closest('a[href="/profile.html"]');
    if (profileLink && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    // 3. Donate Buttons
    if (e.target.closest('#globalDonateBtn')) { openGeneralDonationModal(); return; }
    
    const donateBtn = e.target.closest('.donate-btn, .donate-btn-modern');
    if (donateBtn) {
        const campaignId = parseInt(donateBtn.dataset.id, 10);
        openCampaignDonationModal(campaignId);
        return;
    }

    // 4. Follow Button
    const followBtn = e.target.closest('#followBtn'); if (followBtn) { handleFollow(followBtn); return; }
    
    // 5. Reactions
    if (e.target.closest('.ameen-btn') || e.target.closest('.love-btn')) {
        const btn = e.target.closest('.action-btn') || e.target.closest('.short-action-btn'); 
        const id = parseInt(btn.dataset.id, 10);
        const type = btn.classList.contains('love-btn') ? 'love' : 'ameen';
        handleReaction(id, type, btn);
        return;
    }

    // 6. SHORTS COMMENT TRIGGER
    const shortsCommentBtn = e.target.closest('.shorts-comment-trigger');
    if (shortsCommentBtn) {
        e.preventDefault(); 
        const postId = shortsCommentBtn.dataset.id;
        openShortsModal(postId); 
        return;
    }

    // 7. SHORTS MODAL CLOSE
    if (e.target.closest('#closeShortsModalBtn') || e.target.closest('#closeShortsModalOverlay')) {
        closeShortsModal();
        return;
    }

    // 8. Notification Click
    if (e.target.closest('.notification-item')) { 
        const item = e.target.closest('.notification-item'); const url = item.dataset.url; 
        if (!e.target.closest('.delete-notif-btn')) {
            if(typeof markNotificationAsRead === 'function') markNotificationAsRead(item.dataset.id); 
            if (url && url.startsWith('post_id=')) { const prayerId = parseInt(url.split('=')[1]); window.location.href = `comments.html?postId=${prayerId}`; } 
            else if (url) { window.location.href = url; }
            document.getElementById('notificationModal').classList.remove('active'); 
        } return; 
    }
    
    // 9. Other Buttons
    const storyItem = e.target.closest('.story-item:not(.my-story)'); if (storyItem) return;
    const shareBtn = e.target.closest('.share-btn'); 
    if (shareBtn) { 
        const prayerId = shareBtn.dataset.id; const prayerTitle = shareBtn.dataset.title; const prayerText = shareBtn.dataset.text || '';
        const url = `${window.location.origin}/comments.html?postId=${prayerId}`;
        const fullShareText = `${prayerTitle}\n\n${prayerText}\n\nআমিন বলতে নিচের লিংকে ক্লিক করুন:\n${url}`;
        if (navigator.share) { navigator.share({ title: prayerTitle, text: fullShareText, url: url }).catch(error => console.log('শেয়ার এরর:', error)); } else { navigator.clipboard.writeText(fullShareText).then(() => { alert('লিংক কপি হয়েছে!'); }, () => { alert('কপি করা যায়নি।'); }); } 
        return; 
    }
    const postImage = e.target.closest('.post-image, .fundraising-image'); if (postImage) { const modal = document.getElementById('image-view-modal'); const modalImg = document.getElementById('modal-image'); modal.style.display = "flex"; modalImg.src = postImage.dataset.src || postImage.src; return; }
    const closeImageModal = e.target.closest('.close-image-modal, .image-modal'); if (closeImageModal && !e.target.closest('.image-modal-content')) { document.getElementById('image-view-modal').style.display = "none"; return; }
    
    if (e.target.closest('#googleSignInBtn')) handleGoogleSignIn();
    if (e.target.closest('#facebookSignInBtn')) handleFacebookSignIn();
    if (e.target.closest('#signOutBtn')) { await supabaseClient.auth.signOut(); handleUserLoggedOut(); }
    
    const addPostLink = e.target.closest('#addPostLink'); if (addPostLink && !currentUser) { e.preventDefault(); showLoginModal(); }
    const saveBtn = e.target.closest('.save-btn'); if (saveBtn) { handleSavePost(saveBtn); return; }
    
    const editPostBtn = e.target.closest('.edit-post-btn'); if (editPostBtn) handleEditPost(editPostBtn);
    const deletePostBtn = e.target.closest('.delete-post-btn'); if (deletePostBtn) handleDeletePost(deletePostBtn);
    const hidePostBtn = e.target.closest('.hide-post-btn'); if (hidePostBtn) handleHidePost(hidePostBtn);
    const unhidePostBtn = e.target.closest('.unhide-post-btn'); if (unhidePostBtn) handleUnhidePost(unhidePostBtn);
    
    if (e.target.closest('.close-btn')) { const modal = e.target.closest('.modal'); if(modal) modal.style.display = 'none'; }
}

// ====================================
// SHORTS MODAL LOGIC
// ====================================
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
        
        // Push notification logic will be handled by realtime subscription or manual call if needed
        // But for comments, usually notification is sent to post author
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

// ====================================
// DONATION & PAYMENT
// ====================================
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

// ====================================
// REACTION LOGIC (Fixed)
// ====================================
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

// ====================================
// OTHER INTERACTIONS (POLL, SAVE, ETC)
// ====================================
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
    if (!category) { alert('ক্যাটেগরি নির্বাচন করুন।'); return; } 
    setLoading(btn, true); 
    const success = await reportSystem.submitReport(contentId, contentType, category, description); 
    setLoading(btn, false); 
    if (success) { 
        const reportModal = document.getElementById('reportModal'); 
        if (reportModal) reportModal.style.display = 'none'; 
    } 
}

function handleFollowingFeedSwitch() { 
    if (!currentUser) { showLoginModal(); return; } 
    isVideoFeedActive = false; filteredUserId = null; 
    currentFeedType = (currentFeedType === 'for_you') ? 'following' : 'for_you'; 
    refreshFeed(); 
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

// Navigation & Auth Helpers (Imported from auth.js if available, else placeholder)
function handleFollow(btn) {
    if(typeof window.handleFollowAuth === 'function') {
        window.handleFollowAuth(btn);
    } else {
        if (!currentUser) showLoginModal();
    }
}