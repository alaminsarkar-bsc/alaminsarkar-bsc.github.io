// ====================================================================
// FILE: stories.js
// বিবরণ: স্টোরি তৈরি, ক্যামেরা হ্যান্ডলিং, আপলোড, রেন্ডারিং এবং ভিউয়ার লজিক
// ====================================================================

console.log("Stories Module Loaded");

// ====================================
// 1. STORY EDITOR SETUP (ইভেন্ট লিসেনার)
// ====================================
function setupStoryEditor() {
    // ১. এডিটর ওপেন করা
    const createBtn = document.getElementById('createStoryBtn');
    if (createBtn) {
        createBtn.addEventListener('click', (e) => { 
            e.preventDefault(); 
            if(!currentUser) { 
                showLoginModal(); 
                return; 
            } 
            openProStoryEditor(); 
        });
    }
    
    // ২. এডিটর বন্ধ করা
    document.getElementById('closeStoryEditorBtn')?.addEventListener('click', closeStoryEditor);
    
    // ৩. ট্যাব পরিবর্তন (টেক্সট বা মিডিয়া)
    document.getElementById('tabTextBtn')?.addEventListener('click', () => switchEditorTab('text'));
    document.getElementById('tabMediaBtn')?.addEventListener('click', () => switchEditorTab('media'));
    
    // ৪. ব্যাকগ্রাউন্ড কালার পরিবর্তন (টেক্সট মোড)
    document.getElementById('storyBgColorBtn')?.addEventListener('click', cycleBgColor);
    
    // ৫. ক্যামেরা ও মিডিয়া কন্ট্রোল
    document.getElementById('openCameraBtn')?.addEventListener('click', initCamera);
    document.getElementById('recordBtn')?.addEventListener('click', toggleRecording);
    document.getElementById('storyMuteBtn')?.addEventListener('click', toggleMute);
    document.getElementById('resetMediaBtn')?.addEventListener('click', resetMediaState);
    
    // ৬. ফাইল আপলোড
    const fileInput = document.getElementById('storyFileUpload');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // ৭. পাবলিশ বাটন
    document.getElementById('publishStoryBtn')?.addEventListener('click', publishProStory);
}

// এডিটর ওপেন ফাংশন
function openProStoryEditor() {
    const modal = document.getElementById('storyCreateModal');
    if(!modal) return;
    
    resetEditorState(); // স্টেট রিসেট
    modal.style.display = 'flex';
    switchEditorTab('text'); // ডিফল্ট টেক্সট মোড
}

// ট্যাব সুইচিং ফাংশন
function switchEditorTab(mode) {
    storyEditorState.mode = mode;
    
    // ট্যাব স্টাইল আপডেট
    document.querySelectorAll('.editor-tab-btn').forEach(b => b.classList.remove('active'));
    
    if(mode === 'text') {
        document.getElementById('tabTextBtn').classList.add('active');
        
        // টেক্সট UI দেখানো
        document.getElementById('textCanvas').style.display = 'flex';
        document.getElementById('textModeTools').style.display = 'flex';
        
        // মিডিয়া UI লুকানো
        document.getElementById('mediaCanvas').style.display = 'none';
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
        
        stopCamera(); // ক্যামেরা চালু থাকলে বন্ধ করা
    } else {
        document.getElementById('tabMediaBtn').classList.add('active');
        
        // মিডিয়া UI দেখানো
        document.getElementById('mediaCanvas').style.display = 'flex';
        document.getElementById('mediaPlaceholder').style.display = 'flex';
        
        // টেক্সট UI লুকানো
        document.getElementById('textCanvas').style.display = 'none';
        document.getElementById('textModeTools').style.display = 'none';
        
        // নির্দিষ্ট মিডিয়া এলিমেন্ট রিসেট
        document.getElementById('liveCameraFeed').style.display = 'none';
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
    }
}

// ====================================
// 2. CAMERA & RECORDING LOGIC
// ====================================

// ক্যামেরা চালু করা
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        storyEditorState.stream = stream;
        const video = document.getElementById('liveCameraFeed');
        video.srcObject = stream;
        video.style.display = 'block';
        
        // UI আপডেট
        document.getElementById('mediaPlaceholder').style.display = 'none';
        document.getElementById('recordingArea').style.display = 'flex'; 
        document.getElementById('storyMuteBtn').style.display = 'flex'; 
        
        // প্রিভিউ ক্লিয়ার করা
        document.getElementById('storyImgPreview').style.display = 'none';
        document.getElementById('storyVidPreview').style.display = 'none';
        
    } catch (e) { 
        console.warn("Camera error:", e); 
        alert("ক্যামেরা চালু করা যাচ্ছে না। ব্রাউজার পারমিশন চেক করুন।"); 
    }
}

// ক্যামেরা বন্ধ করা
function stopCamera() {
    if(storyEditorState.stream) {
        storyEditorState.stream.getTracks().forEach(track => track.stop());
        storyEditorState.stream = null;
    }
    document.getElementById('liveCameraFeed').style.display = 'none';
}

// রেকর্ডিং টগল
function toggleRecording() { 
    if (storyEditorState.isRecording) {
        stopRecording(); 
    } else {
        startRecording(); 
    }
}

// রেকর্ডিং শুরু
function startRecording() {
    if (!storyEditorState.stream) return;
    
    storyEditorState.isRecording = true;
    storyEditorState.recordedChunks = [];
    
    // বাটন এনিমেশন
    document.getElementById('recordBtn').classList.add('recording');
    
    // মিউট লজিক
    storyEditorState.stream.getAudioTracks().forEach(track => { 
        track.enabled = !storyEditorState.isMuted; 
    });
    
    try {
        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        storyEditorState.mediaRecorder = new MediaRecorder(storyEditorState.stream, options);
    } catch (e) { 
        // ফলব্যাক (Safari বা পুরোনো ব্রাউজারের জন্য)
        storyEditorState.mediaRecorder = new MediaRecorder(storyEditorState.stream); 
    }
    
    storyEditorState.mediaRecorder.ondataavailable = e => { 
        if (e.data.size > 0) storyEditorState.recordedChunks.push(e.data); 
    };
    
    storyEditorState.mediaRecorder.onstop = () => {
        const blob = new Blob(storyEditorState.recordedChunks, { type: 'video/webm' });
        storyEditorState.mediaBlob = blob;
        
        const videoURL = URL.createObjectURL(blob);
        const previewVid = document.getElementById('storyVidPreview');
        
        previewVid.src = videoURL; 
        previewVid.style.display = 'block'; 
        previewVid.controls = true;
        
        // UI ক্লিনআপ
        document.getElementById('liveCameraFeed').style.display = 'none';
        stopCamera();
        document.getElementById('recordingArea').style.display = 'none';
        document.getElementById('storyMuteBtn').style.display = 'none';
        document.getElementById('resetMediaBtn').style.display = 'flex'; 
    };
    
    storyEditorState.mediaRecorder.start();
    
    // সর্বোচ্চ সময়সীমা (৩০ সেকেন্ড)
    let startTime = Date.now();
    const maxTime = storyEditorState.maxDuration * 1000; 
    
    storyEditorState.recordingTimer = setInterval(() => {
        if (Date.now() - startTime >= maxTime) {
            stopRecording();
        }
    }, 100);
}

// রেকর্ডিং বন্ধ
function stopRecording() {
    if (!storyEditorState.isRecording) return;
    
    storyEditorState.isRecording = false;
    clearInterval(storyEditorState.recordingTimer);
    
    if (storyEditorState.mediaRecorder) {
        storyEditorState.mediaRecorder.stop();
    }
    
    document.getElementById('recordBtn').classList.remove('recording');
}

// মিউট টগল
function toggleMute() {
    storyEditorState.isMuted = !storyEditorState.isMuted;
    const btn = document.getElementById('storyMuteBtn');
    
    if(storyEditorState.isMuted) { 
        btn.innerHTML = '<i class="fas fa-microphone-slash" style="color:red;"></i>'; 
    } else { 
        btn.innerHTML = '<i class="fas fa-microphone"></i>'; 
    }
}

// ====================================
// 3. FILE HANDLING (Upload from Gallery)
// ====================================
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
        imgPrev.style.display = 'none'; 
        vidPrev.src = url; 
        vidPrev.style.display = 'block'; 
        vidPrev.play();
    } else {
        vidPrev.style.display = 'none'; 
        vidPrev.pause(); 
        imgPrev.src = url; 
        imgPrev.style.display = 'block';
    }
}

function resetMediaState() {
    storyEditorState.mediaFile = null; 
    storyEditorState.mediaBlob = null;
    
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
    // ডিফল্ট স্টেটে রিসেট করা
    storyEditorState = { 
        mode: 'text', 
        mediaFile: null, 
        mediaBlob: null, 
        bgColor: STORY_GRADIENTS[0], 
        isRecording: false, 
        isMuted: false, 
        recordingTimer: null, 
        mediaRecorder: null, 
        recordedChunks: [], 
        stream: null, 
        maxDuration: 30 
    };
    
    document.getElementById('storyTextInput').innerText = '';
    document.getElementById('storyCaptionInput').value = '';
    resetMediaState();
}

function closeStoryEditor() { 
    stopCamera(); 
    stopRecording(); 
    document.getElementById('storyCreateModal').style.display = 'none'; 
}

// ====================================
// 4. PUBLISH STORY (Upload to Supabase)
// ====================================
async function publishProStory() {
    const btn = document.getElementById('publishStoryBtn');
    setLoading(btn, true);
    
    try {
        let mediaUrl = null; 
        let type = 'text_image'; 
        let textContent = ''; 
        let blobToUpload = null;
        
        // ১. ডাটা প্রিপারেশন
        if (storyEditorState.mode === 'text') {
            const element = document.getElementById('textCanvas');
            // html2canvas দিয়ে ইমেজ তৈরি করা (Text Story)
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            blobToUpload = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            
            textContent = document.getElementById('storyTextInput').innerText;
            type = 'text_image';
        } else {
            // Media Story
            if (storyEditorState.mediaBlob) { 
                blobToUpload = storyEditorState.mediaBlob; 
                type = 'video'; 
            } else if (storyEditorState.mediaFile) { 
                blobToUpload = storyEditorState.mediaFile; 
                type = storyEditorState.mediaFile.type.startsWith('video/') ? 'video' : 'image'; 
            }
            textContent = document.getElementById('storyCaptionInput').value.trim();
        }
        
        if (!blobToUpload) throw new Error("কোনো কন্টেন্ট নেই।");
        
        // ২. স্টোরেজে আপলোড
        const ext = type === 'video' ? 'webm' : 'jpg';
        const fileName = `story_${currentUser.id}_${Date.now()}.${ext}`;
        
        const { data, error } = await supabaseClient.storage
            .from('post_images')
            .upload(fileName, blobToUpload);
            
        if (error) throw error;
        
        mediaUrl = supabaseClient.storage.from('post_images').getPublicUrl(data.path).data.publicUrl;
        
        // ৩. ডাটাবেসে সেভ করা
        const { error: insertError } = await supabaseClient.from('stories').insert([{
            user_id: currentUser.id, 
            media_url: mediaUrl, 
            media_type: type, 
            text_content: textContent, 
            background_color: storyEditorState.bgColor, 
            duration: type === 'video' ? 30000 : 5000 // ভিডিও ৩০ সেকেন্ড, ইমেজ ৫ সেকেন্ড
        }]);
        
        if (insertError) throw insertError;
        
        alert("স্টোরি আপলোড সফল হয়েছে!");
        closeStoryEditor();
        fetchAndRenderStories(); // লিস্ট আপডেট
        
    } catch (error) { 
        console.error("Publish Error:", error); 
        alert("সমস্যা হয়েছে: " + error.message); 
    } finally { 
        setLoading(btn, false); 
    }
}

// ====================================
// 5. FETCH & RENDER STORIES LIST
// ====================================
async function fetchAndRenderStories() {
    const container = document.getElementById('storyContainer');
    if(!container) return;
    
    // প্রথমে শুধু 'My Story' বাটন রেন্ডার
    renderStoriesList(container);
    
    try {
        // গত ২৪ ঘন্টার স্টোরি আনা
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: stories, error } = await supabaseClient
            .from('stories')
            .select('*, users:user_id(id, display_name, photo_url)')
            .gt('created_at', yesterday)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        // ইউজার অনুযায়ী গ্রুপ করা
        const groups = {};
        stories.forEach(story => {
            const uid = story.user_id;
            if (!groups[uid]) { groups[uid] = { user: story.users, items: [] }; }
            groups[uid].items.push(story);
        });
        
        storyGroups = Object.values(groups);
        
        // নিজের স্টোরি সবার আগে আনা
        if (currentUser) {
            const myIndex = storyGroups.findIndex(g => g.user.id === currentUser.id);
            if (myIndex > -1) { 
                const myGroup = storyGroups.splice(myIndex, 1)[0]; 
                storyGroups.unshift(myGroup); 
            }
        }
        
        renderStoriesList(container);
    } catch (error) { 
        console.error("Fetch Stories Error:", error); 
    }
}

function renderStoriesList(container) {
    if (!container) return;
    container.innerHTML = '';
    
    // --- Add Story Button (My Story) ---
    const addItem = document.createElement('div');
    addItem.className = 'story-item my-story';
    addItem.onclick = openProStoryEditor; 
    
    let myAvatar = '';
    if (currentUser && currentUser.profile?.photo_url) { 
        myAvatar = `<img src="${currentUser.profile.photo_url}" style="width:100%;height:100%;object-fit:cover;">`; 
    } else { 
        myAvatar = `<div style="width:100%;height:100%;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:30px;color:#ccc;">+</div>`; 
    }
    
    addItem.innerHTML = `<div class="story-preview" style="background:white; position:relative;">${myAvatar}<div class="my-story-add-icon"><i class="fas fa-plus"></i></div></div><span class="story-user-name">আপনার স্টোরি</span>`;
    container.appendChild(addItem);
    
    // --- Other User Stories ---
    storyGroups.forEach((group, index) => {
        const item = document.createElement('div');
        item.className = 'story-item';
        item.onclick = () => openStoryViewer(index);
        
        const lastStory = group.items[group.items.length - 1];
        const user = group.user;
        let previewContent = '';
        
        if (lastStory.media_type === 'video') { 
            previewContent = `<video src="${lastStory.media_url}#t=0.5" style="width:100%;height:100%;object-fit:cover;"></video>`; 
        } else { 
            previewContent = `<img src="${lastStory.media_url}" style="width:100%;height:100%;object-fit:cover;">`; 
        }
        
        const userAvatar = user.photo_url ? `<img src="${user.photo_url}" class="story-avatar-overlay" style="position:absolute;top:5px;left:5px;width:35px;height:35px;border-radius:50%;border:2px solid #1877F2;">` : ``;
        
        item.innerHTML = `<div class="story-preview">${previewContent}<div class="story-overlay-gradient"></div>${userAvatar}</div><span class="story-user-name">${user.display_name.split(' ')[0]}</span>`;
        container.appendChild(item);
    });
}

// ====================================
// 6. FULLSCREEN STORY VIEWER
// ====================================
function openStoryViewer(groupIndex) {
    storyViewerState.currentUserIndex = groupIndex; 
    storyViewerState.currentStoryIndex = 0; 
    storyViewerState.isOpen = true;
    
    document.getElementById('storyViewerModal').style.display = 'flex';
    renderStoryInViewer();
}

function renderStoryInViewer() {
    const group = storyGroups[storyViewerState.currentUserIndex];
    if (!group) { closeStoryViewer(); return; }
    
    const story = group.items[storyViewerState.currentStoryIndex];
    if (!story) { nextStoryUser(); return; }
    
    // 1. Progress Bars (Top)
    document.getElementById('storyProgressBars').innerHTML = group.items.map((_, idx) => `
        <div class="progress-bar-container" style="flex:1; margin:0 2px; background:rgba(255,255,255,0.3); height:3px; border-radius:2px;">
            <div class="progress-bar-fill-story" id="prog-${idx}" style="width:${idx < storyViewerState.currentStoryIndex ? '100%' : '0%'}; height:100%; background:white;"></div>
        </div>
    `).join('');
    
    // 2. User Info Header
    document.getElementById('storyUserInfo').innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <img src="${group.user.photo_url || './images/default-avatar.png'}" style="width:32px;height:32px;border-radius:50%;">
            <span style="font-weight:bold;">${group.user.display_name}</span>
            <span style="opacity:0.7;font-size:12px;">${timeAgo(story.created_at)}</span>
        </div>
    `;
    
    // 3. Media Content
    const mediaContainer = document.querySelector('.story-viewer-media');
    mediaContainer.innerHTML = '';
    
    // Caption Overlay
    const textOverlay = document.createElement('div');
    textOverlay.style.position = 'absolute'; 
    textOverlay.style.bottom = '100px'; 
    textOverlay.style.left = '0'; 
    textOverlay.style.width = '100%'; 
    textOverlay.style.textAlign = 'center'; 
    textOverlay.style.color = 'white'; 
    textOverlay.style.fontSize = '20px'; 
    textOverlay.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)'; 
    textOverlay.style.pointerEvents = 'none';
    
    if(story.text_content) textOverlay.innerText = story.text_content;
    
    let mediaEl;
    if (story.media_type === 'video') { 
        mediaEl = document.createElement('video'); 
        mediaEl.src = story.media_url; 
        mediaEl.autoplay = true; 
        mediaEl.playsInline = true; 
        mediaEl.style.width = '100%'; 
        mediaEl.onended = nextStoryItem; 
        mediaEl.onerror = () => { console.warn("Video failed to load, skipping."); nextStoryItem(); }; 
    } else { 
        mediaEl = document.createElement('img'); 
        mediaEl.src = story.media_url; 
        mediaEl.style.width = '100%'; 
        mediaEl.style.height = '100%'; 
        mediaEl.style.objectFit = 'contain'; 
        mediaEl.onerror = () => { console.warn("Image failed to load, skipping."); nextStoryItem(); }; 
        startStoryTimer(5000); // 5 sec for images
    }
    
    mediaContainer.appendChild(mediaEl); 
    mediaContainer.appendChild(textOverlay);
    
    // 4. Animate Progress Bar
    const currentProg = document.getElementById(`prog-${storyViewerState.currentStoryIndex}`);
    if (currentProg) {
        currentProg.style.width = '0%'; 
        currentProg.style.transition = 'none'; 
        void currentProg.offsetWidth; // Force Reflow
        
        if (story.media_type === 'video') { 
            mediaEl.onloadedmetadata = () => { 
                currentProg.style.transition = `width ${mediaEl.duration}s linear`; 
                currentProg.style.width = '100%'; 
            }; 
        } else { 
            currentProg.style.transition = `width 5s linear`; 
            currentProg.style.width = '100%'; 
        }
    }
}

// ====================================
// 7. STORY NAVIGATION LOGIC
// ====================================
function startStoryTimer(ms) { 
    clearTimeout(storyViewerState.storyTimeout); 
    storyViewerState.storyTimeout = setTimeout(nextStoryItem, ms); 
}

function nextStoryItem() { 
    const group = storyGroups[storyViewerState.currentUserIndex]; 
    if (group && storyViewerState.currentStoryIndex < group.items.length - 1) { 
        storyViewerState.currentStoryIndex++; 
        renderStoryInViewer(); 
    } else { 
        nextStoryUser(); 
    } 
}

function nextStoryUser() { 
    if (storyViewerState.currentUserIndex < storyGroups.length - 1) { 
        storyViewerState.currentUserIndex++; 
        storyViewerState.currentStoryIndex = 0; 
        renderStoryInViewer(); 
    } else { 
        closeStoryViewer(); 
    } 
}

function prevStoryItem() { 
    if (storyViewerState.currentStoryIndex > 0) { 
        storyViewerState.currentStoryIndex--; 
        renderStoryInViewer(); 
    } else { 
        // Replay current story
        renderStoryInViewer(); 
    } 
}

function closeStoryViewer() { 
    document.getElementById('storyViewerModal').style.display = 'none'; 
    clearTimeout(storyViewerState.storyTimeout); 
    
    // Stop video
    const vid = document.querySelector('.story-viewer-media video'); 
    if(vid) vid.pause(); 
}