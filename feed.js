// ====================================================================
// FILE: feed.js
// বিবরণ: হোমপেজ ইনিশিয়ালাইজেশন, ফিড লোডিং, কার্ড রেন্ডারিং এবং রিয়েলটাইম আপডেট
// ====================================================================

console.log("Feed Module Loaded");

// ====================================
// 1. HOME PAGE INITIALIZATION
// ====================================
async function initHomePage() {
    await fetchFundraisingPosts();
    await initializeShuffledFeed(); 
    
    // স্টোরি লোড করা (যদি stories.js লোড হয়ে থাকে)
    if (typeof fetchAndRenderStories === 'function') {
        await fetchAndRenderStories();
    }
    
    const feedContainer = document.getElementById('feedContainer');
    // ডিফল্ট লোড (যদি কন্টেইনার খালি থাকে)
    if(feedContainer && feedContainer.innerHTML.trim() === "") {
        fetchAndRenderPrayers(feedContainer, 'active', null, true);
    } else if (feedContainer) {
        // যদি অলরেডি ডাটা থাকে, তবুও নতুন করে লোড করুন (রিফ্রেশ বা ট্যাব চেঞ্জের ক্ষেত্রে)
        fetchAndRenderPrayers(feedContainer, 'active', null, true);
    }
    
    setupRealtimeSubscription();
    setupIntersectionObserver(); 
}

// --- Fetch Fundraising Posts (For Injection) ---
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
    } catch (err) { 
        console.error("Fundraising fetch error:", err); 
    }
}

// --- Initialize Shuffled Feed IDs (Randomize) ---
async function initializeShuffledFeed() {
    if (isFeedInitialized) return;
    try {
        const { data, error } = await supabaseClient
            .from('prayers')
            .select('id')
            .eq('status', 'active')
            .eq('is_fundraising', false);
            
        if (error) throw error;
        
        const ids = data.map(p => p.id);
        shuffledPrayerIds = shuffleArray(ids);
        isFeedInitialized = true;
    } catch (err) { 
        console.error("Feed init error:", err); 
    }
}

// ====================================
// 2. INFINITE SCROLL & OBSERVERS
// ====================================
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
    if (oldTrigger) { 
        feedObserver.unobserve(oldTrigger); 
        oldTrigger.remove(); 
    }
    
    if (!noMorePrayers) {
        const trigger = document.createElement('div');
        trigger.id = 'infinite-scroll-trigger'; 
        trigger.style.height = '50px'; 
        trigger.style.textAlign = 'center'; 
        trigger.style.padding = '20px';
        
        trigger.innerHTML = isLoadingMore 
            ? '<div class="loader" style="border-color:#999;border-bottom-color:transparent;"></div>' 
            : '<button class="text-btn" onclick="retryLoadFeed()">আরও লোড করুন</button>';
            
        container.appendChild(trigger);
        feedObserver.observe(trigger);
    }
}

window.retryLoadFeed = function() {
    const feedContainer = document.getElementById('feedContainer');
    if(feedContainer) fetchAndRenderPrayers(feedContainer, 'active', null, false);
};

// ====================================
// 3. MAIN FEED FETCH FUNCTION
// ====================================
const fetchAndRenderPrayers = async (container, status, userId = null, isInitialLoad = true) => {
    if (!container || isLoadingMore || noMorePrayers) return;
    
    isLoadingMore = true;
    
    if (isInitialLoad && currentPage === 0 && container.id !== 'myPostsContainer') { 
        showSkeletonLoader(true); 
    } else { 
        const trigger = document.getElementById('infinite-scroll-trigger'); 
        if(trigger) trigger.innerHTML = '<div class="loader" style="border-color:#999;border-bottom-color:transparent;"></div>'; 
    }

    try {
        let prayerList = []; 
        let error; 
        const isProfilePage = document.body.id === 'profile-page';
        
        let query = supabaseClient
            .from('prayers')
            .select('*, users!author_uid(id, display_name, photo_url)');

        // --- Case A: Saved Posts (Profile) ---
        if (isProfilePage && status === 'saved') {
            if (savedPostIds.size === 0 && currentUser) {
                 if(typeof fetchSavedPostIds === 'function') await fetchSavedPostIds();
            }
            const savedIds = Array.from(savedPostIds);
            
            if (savedIds.length === 0) { 
                prayerList = []; 
                noMorePrayers = true; 
            } else {
                const start = currentPage * prayersPerPage; 
                const end = start + prayersPerPage;
                const idsToFetch = savedIds.slice(start, end);
                
                if (idsToFetch.length > 0) {
                     const { data, err } = await supabaseClient
                        .from('prayers')
                        .select('*, users!author_uid(id, display_name, photo_url)')
                        .in('id', idsToFetch);
                        
                    if (data) {
                        // Sort by saved order (newest saved first logic not here, but basic sorting)
                        data.sort((a, b) => idsToFetch.indexOf(b.id) - idsToFetch.indexOf(a.id)); 
                    }
                    prayerList = data; 
                    error = err;
                } else { 
                    noMorePrayers = true; 
                }
            }
        } 
        // --- Case B: Main Feed (For You) ---
        else if (!isProfilePage && currentFeedType === 'for_you' && !filteredUserId && !isVideoFeedActive) {
            const start = currentPage * prayersPerPage; 
            const end = start + prayersPerPage;
            
            if(shuffledPrayerIds.length > 0) {
                const idsToFetch = shuffledPrayerIds.slice(start, end);
                if (idsToFetch.length > 0) {
                    const { data, err } = await supabaseClient
                        .from('prayers')
                        .select('*, users!author_uid(id, display_name, photo_url)')
                        .in('id', idsToFetch);
                        
                    if(data) { 
                        // Map back to maintain shuffled order
                        const idMap = new Map(data.map(item => [item.id, item])); 
                        prayerList = idsToFetch.map(id => idMap.get(id)).filter(Boolean); 
                    }
                    error = err;
                } else { 
                    noMorePrayers = true; 
                }
            } else {
                 // Fallback if shuffle fails
                 const { data, err } = await query
                    .eq('status', 'active')
                    .eq('is_fundraising', false)
                    .order('created_at', {ascending: false})
                    .range(start, end - 1);
                 prayerList = data; 
                 error = err;
            }
        } 
        // --- Case C: Other Filters (Profile, Following, Shorts) ---
        else {
            if (isProfilePage && userId) {
                query = query.eq('author_uid', userId).eq('is_fundraising', false);
                if (status === 'hidden') query = query.eq('status', 'hidden'); 
                else query = query.eq('status', 'active');
            } 
            else if (currentFeedType === 'following' && currentUser) {
                const { data: followingData, error: followingError } = await supabaseClient
                    .from('followers')
                    .select('following_id')
                    .eq('follower_id', currentUser.id);
                    
                if (followingError) throw followingError;
                
                const followingIds = followingData.map(f => f.following_id);
                if (followingIds.length === 0) { 
                    prayerList = []; 
                    noMorePrayers = true; 
                } else {
                    query = query.in('author_uid', followingIds)
                        .eq('status', 'active')
                        .eq('is_fundraising', false);
                }
            } 
            else if (filteredUserId) {
                query = query.eq('author_uid', filteredUserId)
                    .eq('status', 'active')
                    .eq('is_fundraising', false);
            } 
            else if (isVideoFeedActive) {
                // Shorts Logic: Only fetch videos
                query = query.eq('status', 'active')
                    .eq('is_fundraising', false)
                    .not('uploaded_video_url', 'is', null);
            } 
            else {
                query = query.eq('status', 'active').eq('is_fundraising', false);
            }

            if (!noMorePrayers) {
                const { data, err } = await query
                    .order('created_at', { ascending: false })
                    .range(currentPage * prayersPerPage, (currentPage + 1) * prayersPerPage - 1);
                
                prayerList = data; 
                error = err;
            }
        }

        if (error) throw error;
        
        if (isInitialLoad) {
            showSkeletonLoader(false, container.id === 'myPostsContainer' ? 'myPostsContainer' : null);
        }

        if (prayerList && prayerList.length > 0) {
            // Cache Data
            const prayersWithUsers = prayerList.map(p => ({ ...p, users: p.users }));
            prayersWithUsers.forEach(p => allFetchedPrayers.set(p.id, p));
            
            // Render
            renderPrayersFromList(container, prayersWithUsers, !isInitialLoad);
            currentPage++;
            
            if (prayerList.length < prayersPerPage) { 
                noMorePrayers = true; 
            }
        } else {
            if (isInitialLoad && container.innerHTML.trim() === '') {
                // Clear skeletons if empty
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
        else { 
            const t = document.getElementById('infinite-scroll-trigger'); 
            if(t) t.remove(); 
        }
    }
};

// ====================================
// 4. RENDER HELPER (Main Switcher)
// ====================================
const renderPrayersFromList = (container, prayerList, shouldAppend = false) => {
    if (!container) return;

    // Shorts View vs Normal Feed View Setup
    if (isVideoFeedActive) {
        container.classList.add('shorts-feed-container');
        container.classList.remove('feed-container');
        
        // Hide Stories & Skeleton in Shorts Mode
        const storyContainer = document.getElementById('storyContainer');
        const skeleton = document.getElementById('skeletonContainer');
        if(storyContainer) storyContainer.style.display = 'none';
        if(skeleton) skeleton.style.display = 'none';
        
    } else {
        container.classList.remove('shorts-feed-container');
        container.classList.add('feed-container');
        
        // Show Stories in Normal Mode
        const storyContainer = document.getElementById('storyContainer');
        if(storyContainer) storyContainer.style.display = 'flex';
    }

    let prayersToRender = [...prayerList];
    
    // Fundraising Injection (Only on Home Feed)
    if (!isVideoFeedActive && document.body.id === 'home-page' && currentFeedType === 'for_you' && !filteredUserId && fundraisingPosts.length > 0) {
        const injectionIndex = 4; 
        if (prayersToRender.length >= injectionIndex) {
            const campaign = fundraisingPosts[currentFundraisingIndex % fundraisingPosts.length];
            const exists = prayersToRender.some(p => p.id === campaign.id);
            if (!exists) { 
                prayersToRender.splice(injectionIndex, 0, campaign); 
                currentFundraisingIndex++; 
                allFetchedPrayers.set(campaign.id, campaign); 
            }
        }
    }

    if (!shouldAppend) container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    prayersToRender.forEach(prayer => {
        // Prevent Duplicates
        if (!shouldAppend && document.getElementById(isVideoFeedActive ? `short-${prayer.id}` : `prayer-${prayer.id}`)) return;
        
        let card;
        
        if (isVideoFeedActive) {
            // Only render video posts in Shorts mode
            if (prayer.uploaded_video_url) {
                card = createShortsCardElement(prayer);
            }
        } else {
            // Normal Feed Logic
            if (prayer.is_fundraising) { 
                card = createFundraisingCardElement(prayer); 
            } else if (prayer.is_poll) { 
                card = createPollCardElement(prayer); 
            } else { 
                card = createPrayerCardElement(prayer); 
            }
        }
        
        if (card) fragment.appendChild(card);
    });
    
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (trigger && shouldAppend) { 
        container.insertBefore(fragment, trigger); 
    } else { 
        container.appendChild(fragment); 
    }

    // Initialize Auto-play for Shorts
    if (isVideoFeedActive) {
        setupShortsObserver();
    }
};

// ====================================
// 5. CARD CREATION FUNCTIONS
// ====================================

// --- A. Shorts Card (With Modal Trigger) ---
function createShortsCardElement(prayer) {
    const card = document.createElement('div');
    card.className = 'short-card';
    card.id = `short-${prayer.id}`;

    const author = prayer.users || {};
    const authorName = author.display_name || 'Unknown';
    const authorPhoto = author.photo_url || './images/default-avatar.png';
    
    let hasLoved = false;
    if (currentUser) {
        if (prayer.loved_by && Array.isArray(prayer.loved_by)) {
            hasLoved = prayer.loved_by.includes(currentUser.id);
        } else {
            hasLoved = userLovedPrayers.has(prayer.id);
        }
    }

    card.innerHTML = `
        <video src="${prayer.uploaded_video_url}" class="short-video" loop playsinline preload="metadata"></video>
        <div class="short-overlay"></div>
        
        <div class="heart-container"></div> <!-- Animation Container -->

        <div class="short-actions">
            <button class="short-action-btn love-btn ${hasLoved ? 'loved' : ''}" data-id="${prayer.id}">
                <i class="${hasLoved ? 'fas' : 'far'} fa-heart" style="${hasLoved ? 'color: #e44d62;' : ''}"></i>
                <span class="love-count">${prayer.love_count || 0}</span>
            </button>
            
            <!-- Comment Button (Triggers Modal) -->
            <button class="short-action-btn shorts-comment-trigger" data-id="${prayer.id}">
                <i class="fas fa-comment-dots"></i>
                <span>${prayer.comment_count || 0}</span>
            </button>
            
            <button class="short-action-btn share-btn" data-id="${prayer.id}" data-title="${prayer.title}">
                <i class="fas fa-share"></i>
                <span>Share</span>
            </button>
        </div>
        
        <div class="short-info">
            <div class="short-username">
                <img src="${authorPhoto}" style="width:35px; height:35px; border-radius:50%; border:1px solid white;">
                ${authorName}
            </div>
            <div class="short-caption">${linkifyText(prayer.title || '')}</div>
        </div>
    `;

    const video = card.querySelector('video');
    let lastTap = 0;

    // Double Tap Logic
    card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;

        if (tapLength < 300 && tapLength > 0) {
            // Double Tap Detected
            const loveBtn = card.querySelector('.love-btn');
            if (!loveBtn.classList.contains('loved')) {
                if(typeof handleReaction === 'function') handleReaction(prayer.id, 'love', loveBtn);
            }
            showHeartAnimation(e.clientX, e.clientY, card);
            e.preventDefault();
        } else {
            // Single Tap Detected (Play/Pause)
            setTimeout(() => {
                if (new Date().getTime() - lastTap >= 300) {
                    if (video.paused) video.play();
                    else video.pause();
                }
            }, 300);
        }
        lastTap = currentTime;
    });

    return card;
}

// Helper: Heart Animation
function showHeartAnimation(x, y, container) {
    const heart = document.createElement('i');
    heart.className = 'fas fa-heart heart-animation';
    const rect = container.getBoundingClientRect();
    const relativeX = x - rect.left;
    const relativeY = y - rect.top;
    heart.style.left = `${relativeX}px`;
    heart.style.top = `${relativeY}px`;
    container.appendChild(heart);
    setTimeout(() => { heart.remove(); }, 800);
}

// Observer for Shorts Auto-Play
function setupShortsObserver() {
    if (shortsObserver) shortsObserver.disconnect();
    
    const options = { 
        root: document.querySelector('.shorts-feed-container'), 
        threshold: 0.6 
    };
    
    shortsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (!video) return;
            
            if (entry.isIntersecting) {
                video.currentTime = 0; 
                video.play().catch(e => console.log("Auto-play blocked"));
            } else {
                video.pause();
            }
        });
    }, options);
    
    document.querySelectorAll('.short-card').forEach(card => { 
        shortsObserver.observe(card); 
    });
}

// --- B. Poll Card ---
function createPollCardElement(prayer) {
    const card = document.createElement('div'); 
    card.className = 'prayer-card poll-card'; 
    card.id = `prayer-${prayer.id}`;
    
    const author = prayer.users || {}; 
    const authorName = author.display_name || 'নাম নেই'; 
    const avatarStyle = `background-color: ${generateAvatarColor(authorName)}`; 
    const initial = authorName.charAt(0).toUpperCase(); 
    const avatarHTML = author.photo_url ? `<img src="${author.photo_url}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : initial;
    
    const options = prayer.poll_options || []; 
    const votes = prayer.poll_votes || {}; 
    const totalVotes = Object.keys(votes).length; 
    const userVote = currentUser ? votes[currentUser.id] : null;
    
    const voteCounts = {}; 
    options.forEach(opt => voteCounts[opt.id] = 0); 
    Object.values(votes).forEach(optId => { if(voteCounts[optId] !== undefined) voteCounts[optId]++; });
    
    let pollHTML = `<div class="poll-container">`;
    options.forEach(opt => {
        const count = voteCounts[opt.id] || 0; 
        const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100); 
        const isSelected = userVote === opt.id; 
        const highlightClass = isSelected ? 'selected' : '';
        
        if (userVote) { 
            pollHTML += `<div class="poll-result-bar ${highlightClass}"><div class="fill" style="width: ${percent}%"></div><div class="label"><span>${opt.text} ${isSelected ? '<i class="fas fa-check-circle"></i>' : ''}</span><span class="percent">${percent}%</span></div></div>`; 
        } else { 
            pollHTML += `<button class="poll-option-btn" onclick="handlePollVote(${prayer.id}, ${opt.id})">${opt.text}</button>`; 
        }
    });
    pollHTML += `<div class="poll-meta">${totalVotes} টি ভোট</div></div>`;
    
    const dropdownHTML = currentUser && currentUser.id === prayer.author_uid 
        ? `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}"><button class="delete-post-btn" data-id="${prayer.id}"><i class="fas fa-trash-alt"></i> ডিলিট</button></div>` 
        : `<div class="actions-menu-trigger" data-dropdown-id="dropdown-post-${prayer.id}"><i class="fas fa-ellipsis-h"></i></div><div class="dropdown-menu" id="dropdown-post-${prayer.id}"><button class="report-content-btn" data-id="${prayer.id}" data-type="prayer"><i class="fas fa-flag"></i> রিপোর্ট করুন</button></div>`;
    
    card.innerHTML = `<div class="card-header"><a href="/profile.html?id=${prayer.author_uid}" class="avatar" style="${avatarStyle}">${avatarHTML}</a><div class="author-info"><a href="/profile.html?id=${prayer.author_uid}" class="author-name">${authorName}</a><div class="post-time">${timeAgo(prayer.created_at)}</div></div>${dropdownHTML}</div><div class="card-body"><h3 class="prayer-title">${prayer.title}</h3><p class="prayer-details">${linkifyText(prayer.details)}</p>${pollHTML}</div><div class="card-actions"><button class="action-btn love-btn ${prayer.loved_by && prayer.loved_by.includes(currentUser?.id) ? 'loved' : ''}" data-id="${prayer.id}"><i class="${prayer.loved_by && prayer.loved_by.includes(currentUser?.id) ? 'fas' : 'far'} fa-heart"></i> লাভ <span class="love-count">${prayer.love_count || 0}</span></button><a href="comments.html?postId=${prayer.id}" class="action-btn comment-btn" style="text-decoration:none;"><i class="far fa-comment-dots"></i> কমেন্ট</a></div>`;
    return card;
}

// --- C. Fundraising Card ---
function createFundraisingCardElement(campaign) {
    const card = document.createElement('div'); 
    card.className = 'prayer-card fundraising-card'; 
    card.id = `prayer-${campaign.id}`;
    
    const goal = campaign.goal_amount || 0; 
    const current = campaign.current_amount || 0; 
    const percentage = goal > 0 ? Math.min(100, (current / goal) * 100).toFixed(1) : 0;
    const imageSrc = campaign.image_url ? campaign.image_url : 'https://placehold.co/600x300/e7f3ff/1877f2?text=iPray+Campaign';
    const linkedDetails = linkifyText(campaign.details || '');
    
    let detailsHTML = `<p class="prayer-details">${linkedDetails.replace(/\n/g, '<br>')}</p>`;
    if (campaign.details && (campaign.details.length > 250 || (campaign.details.match(/\n/g) || []).length >= 5)) { 
        detailsHTML = `<p class="prayer-details collapsed">${linkedDetails.replace(/\n/g, '<br>')}</p><button class="read-more-btn">আরও পড়ুন...</button>`; 
    }
    
    card.innerHTML = `<div class="fundraising-hero"><div class="fundraising-badge"><i class="fas fa-hand-holding-heart"></i> সহায়তা প্রয়োজন</div><img data-src="${imageSrc}" alt="${campaign.title}" class="fundraising-image lazy-image"></div><div class="card-body fundraising-body"><h3 class="prayer-title fundraising-title">${campaign.title}</h3><div class="organizer-info"><div class="org-icon"><i class="fas fa-building"></i></div><span>আয়োজনে: <strong>${campaign.organization_name}</strong></span></div>${detailsHTML}<div class="fundraising-stats-box"><div class="stats-row"><div class="stat-item"><span class="stat-label">সংগৃহীত</span><span class="stat-value highlight">৳${current.toLocaleString('bn-BD')}</span></div><div class="stat-item text-right"><span class="stat-label">লক্ষ্য</span><span class="stat-value">৳${goal.toLocaleString('bn-BD')}</span></div></div><div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${percentage}%;"></div></div><div class="percentage-text">${percentage}% সম্পন্ন হয়েছে</div></div></div><div class="card-actions fundraising-actions"><button class="action-btn donate-btn-modern" data-id="${campaign.id}"><i class="fas fa-heart"></i> এখনই ডোনেট করুন</button><button class="action-btn share-btn" data-id="${campaign.id}" data-title="${campaign.title}" data-text="${(campaign.details || '').substring(0, 100)}"><i class="fas fa-share-alt"></i> শেয়ার</button></div>`;
    
    const lazyFundraisingImage = card.querySelector('.lazy-image'); 
    if (lazyFundraisingImage) imageObserver.observe(lazyFundraisingImage);
    return card;
}

// --- D. Regular Post Card ---
const createPrayerCardElement = (prayer) => {
    if (!prayer) return null;
    if (prayer.is_fundraising) return createFundraisingCardElement(prayer);
    if (prayer.is_poll) return createPollCardElement(prayer); 

    const card = document.createElement('div'); card.className = 'prayer-card'; card.id = `prayer-${prayer.id}`;
    const author = prayer.users || {}; const isAnonymous = prayer.is_anonymous || false; const authorName = isAnonymous ? 'আল্লাহর এক বান্দা' : (author.display_name || 'নাম নেই'); const authorPhotoURL = isAnonymous ? null : author.photo_url; 
    const profileLinkAttr = isAnonymous ? '' : `href="/profile.html?id=${prayer.author_uid}"`; 
    const profileLinkClass = isAnonymous ? '' : 'profile-link-trigger'; 
    const avatar = isAnonymous ? '<i class="fas fa-user-secret"></i>' : (authorPhotoURL ? `<img src="${authorPhotoURL}" alt="${authorName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (authorName.charAt(0) || '?')); const avatarStyle = isAnonymous ? 'background-color: #888;' : `background-color: ${generateAvatarColor(authorName)}`;
    
    let hasLoved = false, hasAmeened = false; 
    if (currentUser) { 
        if (prayer.loved_by && Array.isArray(prayer.loved_by)) { hasLoved = prayer.loved_by.includes(currentUser.id); } 
        else { hasLoved = userLovedPrayers.has(prayer.id); }
        if (prayer.ameened_by && Array.isArray(prayer.ameened_by)) { hasAmeened = prayer.ameened_by.includes(currentUser.id); } 
        else { hasAmeened = userAmeenedPrayers.has(prayer.id); }
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

// ====================================
// 6. REALTIME HANDLERS
// ====================================
function setupRealtimeSubscription() { 
    if (prayersSubscription) { supabaseClient.removeChannel(prayersSubscription); prayersSubscription = null; } 
    
    prayersSubscription = supabaseClient.channel('public-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prayers' }, handlePrayerChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, handleCommentChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => { 
            if (currentUser && payload.new.user_id === currentUser.id && typeof loadNotifications === 'function') loadNotifications(); 
        })
        .subscribe(); 
}

async function handlePrayerChange(payload) {
    if (document.visibilityState !== 'visible') return; 
    
    const { eventType, new: newRecord, old: oldRecord } = payload; 
    const container = document.getElementById('feedContainer') || document.getElementById('myPostsContainer'); 
    
    const prayerId = newRecord?.id || oldRecord?.id; 
    if (!prayerId) return;

    if (eventType === 'INSERT') { 
        if (!container) return;
        if (newRecord.is_fundraising) { fetchFundraisingPosts(); return; } 
        shuffledPrayerIds.unshift(prayerId);
        const { data: newPrayer } = await supabaseClient.from('prayers').select('*, users!author_uid(id, display_name, photo_url)').eq('id', prayerId).single(); 
        if (newPrayer) { 
            allFetchedPrayers.set(prayerId, newPrayer); 
            if (isVideoFeedActive && !newPrayer.uploaded_video_url && !newPrayer.youtube_url) return;
            if (!filteredUserId || (filteredUserId && newPrayer.author_uid === filteredUserId)) {
                if (isVideoFeedActive && newPrayer.uploaded_video_url) { container.prepend(createShortsCardElement(newPrayer)); }
                else { container.prepend(createPrayerCardElement(newPrayer)); }
            }
        } 
    }
    else if (eventType === 'UPDATE') { 
        const existingCard = document.getElementById(`prayer-${prayerId}`) || document.getElementById(`short-${prayerId}`); 
        const cachedPrayer = allFetchedPrayers.get(prayerId);
        const updatedPrayer = { ...cachedPrayer, ...newRecord }; 
        
        if (updatedPrayer) {
            allFetchedPrayers.set(prayerId, updatedPrayer);
            if (existingCard) {
                const ameenCountSpan = existingCard.querySelector('.ameen-count');
                const ameenBtn = existingCard.querySelector('.ameen-btn');
                if (ameenCountSpan) ameenCountSpan.innerText = updatedPrayer.ameen_count || 0;
                
                if (currentUser && ameenBtn && updatedPrayer.ameened_by) {
                    const hasAmeened = updatedPrayer.ameened_by.includes(currentUser.id);
                    ameenBtn.classList.toggle('ameened', hasAmeened);
                }

                const loveCountSpan = existingCard.querySelector('.love-count');
                const loveBtn = existingCard.querySelector('.love-btn');
                if (loveCountSpan) loveCountSpan.innerText = updatedPrayer.love_count || 0;
                
                if (currentUser && loveBtn && updatedPrayer.loved_by) {
                    const hasLoved = updatedPrayer.loved_by.includes(currentUser.id);
                    loveBtn.classList.toggle('loved', hasLoved);
                    const icon = loveBtn.querySelector('i');
                    if(icon) {
                        icon.className = hasLoved ? 'fas fa-heart' : 'far fa-heart';
                        if(hasLoved && isVideoFeedActive) icon.style.color = '#e44d62';
                        else if(!hasLoved && isVideoFeedActive) icon.style.color = 'white';
                    }
                }

                const viewCountSpan = document.getElementById(`view-count-${prayerId}`);
                if (viewCountSpan) viewCountSpan.innerText = (updatedPrayer.view_count || 0).toLocaleString('bn-BD');
                
                const commentCountSpan = existingCard.querySelector('.comment-count-text');
                if (commentCountSpan) commentCountSpan.innerText = `${updatedPrayer.comment_count || 0} টি কমেন্ট`;
                
                if (updatedPrayer.is_answered && !existingCard.querySelector('.answered-badge') && !isVideoFeedActive) {
                    const badge = document.createElement('div');
                    badge.className = 'answered-badge';
                    badge.innerHTML = '<i class="fas fa-check-circle"></i> আলহামদুলিল্লাহ, দোয়া কবুল হয়েছে';
                    const body = existingCard.querySelector('.card-body');
                    if(body) body.prepend(badge);
                }
            }
        }
    }
    else if (eventType === 'DELETE') { 
        allFetchedPrayers.delete(oldRecord.id); 
        if (!oldRecord.is_fundraising) { shuffledPrayerIds = shuffledPrayerIds.filter(id => id !== oldRecord.id); } 
        const card = document.getElementById(`prayer-${oldRecord.id}`) || document.getElementById(`short-${oldRecord.id}`);
        if(card) card.remove(); 
    }
}

function handleCommentChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const prayerId = newRecord?.prayer_id || oldRecord?.prayer_id;
    if (!prayerId) return;

    if (eventType === 'INSERT' && currentUser && newRecord.author_uid === currentUser.id) return;

    const card = document.getElementById(`prayer-${prayerId}`) || document.getElementById(`short-${prayerId}`);
    const prayerData = allFetchedPrayers.get(prayerId);

    if (eventType === 'INSERT') {
        if (card) {
            const countSpan = card.querySelector('.comment-count-text');
            if (countSpan) {
                const currentText = countSpan.innerText;
                const currentCount = parseInt(currentText) || 0;
                countSpan.innerText = `${currentCount + 1} টি কমেন্ট`;
            }
            const shortCommentBtn = card.querySelector('.shorts-comment-trigger span');
            if(shortCommentBtn) {
                const currentCount = parseInt(shortCommentBtn.innerText) || 0;
                shortCommentBtn.innerText = currentCount + 1;
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
            const shortCommentBtn = card.querySelector('.shorts-comment-trigger span');
            if(shortCommentBtn) {
                const currentCount = parseInt(shortCommentBtn.innerText) || 0;
                shortCommentBtn.innerText = Math.max(0, currentCount - 1);
            }
        }
        if (prayerData) {
            prayerData.comment_count = Math.max(0, (prayerData.comment_count || 0) - 1);
            allFetchedPrayers.set(prayerId, prayerData);
        }
    }
}