// ====================================
// FILE: interactions.js
// বিবরণ: রিয়্যাকশন, পোল, পোস্ট ম্যানেজমেন্ট, ডোনেশন এবং গ্লোবাল ইভেন্ট হ্যান্ডলার
// ====================================

// --- Create Notification Helper ---
async function createNotification(userId, actorId, type, content, targetUrl) { 
    if (userId === actorId) return; 
    try { 
        await supabaseClient.from('notifications').insert({ user_id: userId, actor_id: actorId, type, content, target_url: targetUrl }); 
    } catch (error) { console.error('Notification create error:', error); } 
}

// ====================================
// NAVIGATION & SEARCH
// ====================================
function setupNavigationLogic() {
    document.querySelectorAll('.nav-tab').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const isHomePage = document.body.id === 'home-page';

            if (link.id === 'addPostLink' || href?.includes('post.html') || href?.includes('profile.html')) { return; }
            if (!isHomePage && (href === '/index.html' || href === './index.html' || href === 'index.html')) { return; }

            e.preventDefault();
            document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
            link.classList.add('active');
            
            if(link.id === 'videoFeedBtn') { 
                isVideoFeedActive = true; 
                // initHomePage is in feed.js
                if(typeof initHomePage === 'function') initHomePage(); 
            } else { 
                isVideoFeedActive = false; 
                if(typeof initHomePage === 'function') initHomePage(); 
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
    currentPage = 0; noMorePrayers = false; allFetchedPrayers.clear(); 
    const container = document.getElementById('feedContainer'); 
    if (container) { container.innerHTML = ''; fetchAndRenderPrayers(container, 'active', null, true); } 
}

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

// ====================================
// GLOBAL CLICK HANDLER
// ====================================
async function handleGlobalClick(e) {
    const deleteNotifBtn = e.target.closest('.delete-notif-btn');
    if(deleteNotifBtn) { e.stopPropagation(); deleteNotification(deleteNotifBtn.dataset.id); return; }

    const profileLink = e.target.closest('a[href="/profile.html"]');
    if (profileLink && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    if (e.target.closest('#globalDonateBtn')) { openGeneralDonationModal(); return; }

    const followBtn = e.target.closest('#followBtn'); if (followBtn) { handleFollow(followBtn); return; }
    
    if (e.target.closest('.notification-item')) { 
        const item = e.target.closest('.notification-item'); const url = item.dataset.url; 
        if (!e.target.closest('.delete-notif-btn')) {
            markNotificationAsRead(item.dataset.id); 
            if (url && url.startsWith('post_id=')) { const prayerId = parseInt(url.split('=')[1]); if (!isNaN(prayerId)) { window.location.href = `comments.html?postId=${prayerId}`; } } 
            else if (url && url.startsWith('/profile')) { window.location.href = url; }
            document.getElementById('notificationModal').classList.remove('active'); 
        } return; 
    }
    
    // Story item clicks handled in stories.js, but check exclude logic
    const storyItem = e.target.closest('.story-item:not(.my-story)'); if (storyItem) { return; }
    
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
    const loginPage = document.getElementById('loginPage'); if (loginPage && loginPage.style.display === 'flex' && !e.target.closest('.login-box')) { return; }
    
    const profileTrigger = e.target.closest('.profile-link-trigger'); if (profileTrigger && !currentUser) { e.preventDefault(); showLoginModal(); return; }

    const dropdownTrigger = e.target.closest('.actions-menu-trigger'); if (dropdownTrigger) { document.querySelectorAll('.dropdown-menu').forEach(d => { if (d.id !== dropdownTrigger.dataset.dropdownId) d.style.display = 'none'; }); const targetDropdown = document.getElementById(dropdownTrigger.dataset.dropdownId); if (targetDropdown) targetDropdown.style.display = targetDropdown.style.display === 'block' ? 'none' : 'block'; return; }
    if (!e.target.closest('.dropdown-menu')) { document.querySelectorAll('.dropdown-menu').forEach(d => d.style.display = 'none'); }
    if (e.target.closest('.close-btn')) { const modal = e.target.closest('.modal'); if(modal) modal.style.display = 'none'; }
    
    if (e.target.closest('#googleSignInBtn')) handleGoogleSignIn();
    if (e.target.closest('#facebookSignInBtn')) handleFacebookSignIn();
    if (e.target.closest('#signOutBtn')) { await supabaseClient.auth.signOut(); handleUserLoggedOut(); }
    
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
            } else if (campaignData.payment_details && campaignData.payment_details.info) { methodsHtml = `<div class="payment-info"><pre>${campaignData.payment_details.info}</pre></div>`; } else { methodsHtml = `<p>কোনো পেমেন্ট তথ্য পাওয়া যায়নি।</p>`; }
            let otherInfoHtml = '';
            if (campaignData.payment_details && campaignData.payment_details.other_info) { otherInfoHtml = `<div class="other-info-box"><strong>নোট:</strong> ${campaignData.payment_details.other_info}</div>`; }
            modalBody.innerHTML = `<p style="text-align:center; margin-bottom:15px;"><strong>${campaignData.organization_name}</strong>-কে সহায়তা করুন।</p>${methodsHtml}${otherInfoHtml}<div class="donation-submit-section"><p style="font-size:12px; color:#666; text-align:center;">টাকা পাঠানোর পর নিচের বাটনে ক্লিক করে তথ্য দিন (ঐচ্ছিক)</p><button class="btn-full-width" style="margin-top:10px; background:#2c3e50;" onclick="openDonationConfirmation()">ডোনেশন কনফার্ম করুন</button></div>`;
            document.getElementById('donationModal').style.display = 'flex';
        }
        return;
    }

    if (e.target.closest('.ameen-btn') || e.target.closest('.love-btn')) {
        const btn = e.target.closest('.action-btn') || e.target.closest('.short-action-btn'); 
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

// ====================================
// REACTIONS & VIDEO VIEWS
// ====================================
async function handleReaction(prayerId, type, btn) {
    if (!currentUser) { showLoginModal(); return; }
    prayerId = parseInt(prayerId, 10); if (isNaN(prayerId)) return;
    btn.disabled = true;
    const isLove = type === 'love';
    const card = document.getElementById(isVideoFeedActive ? `short-${prayerId}` : `prayer-${prayerId}`); // Handle both card types
    if (!card) return;
    
    const countSpan = card.querySelector(isLove ? '.love-count' : '.ameen-count');
    const icon = btn.querySelector('i');
    let currentCount = parseInt((countSpan.innerText || '0').replace(/,/g, ''), 10); if (isNaN(currentCount)) currentCount = 0;
    const wasActive = btn.classList.contains(isLove ? 'loved' : 'ameened');
    const newActiveState = !wasActive;
    const newCount = newActiveState ? (currentCount + 1) : Math.max(0, currentCount - 1);

    btn.classList.toggle(isLove ? 'loved' : 'ameened', newActiveState);
    countSpan.innerText = newCount; 
    if (isLove && icon) { icon.className = newActiveState ? 'fas fa-heart' : 'far fa-heart'; if(newActiveState && isVideoFeedActive) icon.style.color = '#e44d62'; }

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
        if (isLove && icon) { icon.className = wasActive ? 'fas fa-heart' : 'far fa-heart'; }
        alert("নেটওয়ার্ক সমস্যার কারণে রিয়্যাকশন সেভ হয়নি।");
    } finally { setTimeout(() => { btn.disabled = false; }, 300); }
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
// POLL VOTING
// ====================================
async function handlePollVote(prayerId, optionId) {
    if (!currentUser) { showLoginModal(); return; }
    try {
        const { data: post } = await supabaseClient.from('prayers').select('poll_votes').eq('id', prayerId).single();
        let currentVotes = post.poll_votes || {}; currentVotes[currentUser.id] = optionId;
        const { error } = await supabaseClient.from('prayers').update({ poll_votes: currentVotes }).eq('id', prayerId);
        if (error) throw error;
        post.poll_votes = currentVotes; allFetchedPrayers.set(prayerId, { ...allFetchedPrayers.get(prayerId), poll_votes: currentVotes });
        // createPollCardElement in feed.js needs to be globally accessible or copied
        // Assuming feed.js functions are available
        if(typeof createPollCardElement === 'function') {
            const card = document.getElementById(`prayer-${prayerId}`); if(card) card.replaceWith(createPollCardElement(allFetchedPrayers.get(prayerId)));
        }
    } catch (err) { console.error("Voting failed:", err); alert("ভোট দিতে সমস্যা হয়েছে।"); }
}

// ====================================
// POST ACTIONS (SAVE, EDIT, DELETE)
// ====================================
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
async function handleToggleAnswered(btn) { const prayerId = parseInt(btn.dataset.id, 10); const newAnsweredStatus = btn.dataset.current !== 'true'; const { error } = await supabaseClient.from('prayers').update({ is_answered: newAnsweredStatus }).eq('id', prayerId); if (!error) { const { data: updatedPrayer } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').eq('id', prayerId).single(); if (updatedPrayer) { allFetchedPrayers.set(prayerId, updatedPrayer); const card = document.getElementById(`prayer-${prayerId}`); if (card && typeof createPrayerCardElement === 'function') card.replaceWith(createPrayerCardElement(updatedPrayer)); } } else { alert('সমস্যা: ' + error.message); } }

function setupFormSubmissions() { const editPrayerForm = document.getElementById('editPrayerForm'); if (editPrayerForm) editPrayerForm.addEventListener('submit', handleEditPostSubmit); const editProfileForm = document.getElementById('editProfileForm'); if (editProfileForm) editProfileForm.addEventListener('submit', handleEditProfileSubmit); }

async function handleEditPostSubmit(e) { e.preventDefault(); const btn = document.getElementById('savePrayerBtn'); const prayerId = parseInt(document.getElementById('editPrayerId').value, 10); setLoading(btn, true); const updateData = { title: document.getElementById('editPrayerTitleInput').value, details: document.getElementById('editPrayerDetailsTextarea').value, youtube_url: document.getElementById('editYoutubeLinkInput').value }; const { error } = await supabaseClient.from('prayers').update(updateData).eq('id', prayerId); if (!error) { document.getElementById('editPrayerModal').style.display = 'none'; const { data: updatedPrayer } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').eq('id', prayerId).single(); if (updatedPrayer) { allFetchedPrayers.set(prayerId, updatedPrayer); const card = document.getElementById(`prayer-${prayerId}`); if (card && typeof createPrayerCardElement === 'function') card.replaceWith(createPrayerCardElement(updatedPrayer)); } } else { alert('আপডেট করতে সমস্যা: ' + error.message); } setLoading(btn, false); }

// ====================================
// REPORTING
// ====================================
function showReportModal(contentId, contentType) { const reportModal = document.getElementById('reportModal'); if (!reportModal) return; const reportForm = document.getElementById('reportForm'); if (reportForm) reportForm.reset(); document.getElementById('reportContentId').value = contentId; document.getElementById('reportContentType').value = contentType; reportModal.style.display = 'flex'; }
async function handleReportSubmit() { const btn = document.getElementById('submitReportBtn'); const contentId = document.getElementById('reportContentId').value; const contentType = document.getElementById('reportContentType').value; const category = document.getElementById('reportCategory').value; const description = document.getElementById('reportDescription').value; if (!category) { alert('ক্যাটেগরি নির্বাচন করুন।'); return; } setLoading(btn, true); const success = await reportSystem.submitReport(contentId, contentType, category, description); setLoading(btn, false); if (success) { const reportModal = document.getElementById('reportModal'); if (reportModal) reportModal.style.display = 'none'; } }

// ====================================
// DONATION LOGIC
// ====================================
function openGeneralDonationModal() {
    const modal = document.getElementById('generalDonationModal');
    if (modal) { modal.style.display = 'flex'; loadAdminPaymentMethods(); }
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