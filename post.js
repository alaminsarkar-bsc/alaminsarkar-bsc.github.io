const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================================
// গ্লোবাল ভ্যারিয়েবল ও স্টেট
// ====================================
let currentUser = null;
let mediaRecorder;
let audioChunks = [];
let recordedAudioBlob = null;
let recorderStream;
let timerInterval;
let postType = 'prayer'; 
let isPollMode = false;

// ====================================
// AI মডারেশন মডেল লোড
// ====================================
let nsfwModel = null;

async function loadNSFWModel() {
    try {
        nsfwModel = await nsfwjs.load();
        console.log("NSFW AI Model Loaded Successfully");
    } catch (err) {
        console.error("NSFW Model Load Error:", err);
    }
}

async function checkContentSafety(imgElement) {
    if (!nsfwModel) {
        console.warn("NSFW Model not loaded yet, skipping check.");
        return true;
    }
    
    try {
        const predictions = await nsfwModel.classify(imgElement);
        // Porn বা Hentai ক্যাটাগরি ৬০% এর বেশি হলে ব্লক করবে
        const unsafe = predictions.find(p => 
            (p.className === 'Porn' || p.className === 'Hentai') && p.probability > 0.60
        );
        
        if (unsafe) {
            console.warn("Unsafe content detected:", unsafe);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Prediction Error:", e);
        return true;
    }
}

// ====================================
// অ্যাপলিকেশন শুরু
// ====================================
document.addEventListener('DOMContentLoaded', async () => {
    loadNSFWModel();

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            await initializeApp();
            const appContainer = document.getElementById('appContainer');
            if (appContainer) appContainer.style.display = 'block';
        } else {
            alert("পোস্ট করার জন্য অনুগ্রহ করে লগইন করুন।");
            window.location.href = '/index.html';
        }
    } catch (error) {
        console.error("Error initializing post page:", error);
        const appContainer = document.getElementById('appContainer');
        if (appContainer) appContainer.style.display = 'block';
    }
});

async function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('type') === 'fundraising') {
        await setupFundraisingUI();
    }
    
    setupFormSubmissions();
    setupPollLogic(); 
}

// ====================================
// POLL SYSTEM LOGIC
// ====================================
function setupPollLogic() {
    const pollBtn = document.getElementById('pollToggleBtn');
    if(pollBtn) {
        pollBtn.addEventListener('click', window.togglePollMode);
    }
}

window.togglePollMode = function() {
    isPollMode = !isPollMode;
    const pollInputs = document.getElementById('pollInputs');
    const mediaSection = document.querySelector('.media-upload-section');
    const btn = document.getElementById('pollToggleBtn');

    if (isPollMode) {
        pollInputs.style.display = 'block';
        mediaSection.style.display = 'none'; 
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-times"></i> পোল বাতিল করুন';
        resetAllMediaInputs('none');
    } else {
        pollInputs.style.display = 'none';
        mediaSection.style.display = 'block';
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-poll"></i> পোল তৈরি করুন';
    }
};

// ====================================
// FUNDRAISING SETUP
// ====================================
async function setupFundraisingUI() {
    try {
        const { data: userProfile, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .single();

        if (error || !userProfile || userProfile.role !== 'admin') {
            console.warn("User is not admin, defaulting to normal post.");
            return; 
        }

        postType = 'fundraising';
        document.getElementById('pageTitle').textContent = 'নতুন ক্যাম্পেইন তৈরি করুন';
        document.getElementById('prayerTitleInput').placeholder = 'ক্যাম্পেইনের শিরোনাম';
        document.getElementById('submitPrayerBtn').textContent = 'ক্যাম্পেইন পোস্ট করুন';
        
        document.getElementById('fundraisingFields').style.display = 'block';
        
        const anonContainer = document.getElementById('anonymousCheckContainer');
        if(anonContainer) anonContainer.style.display = 'none';
        
        const pollWrapper = document.querySelector('.poll-section-wrapper');
        if(pollWrapper) pollWrapper.style.display = 'none';

        document.getElementById('organizationName').required = true;
        document.getElementById('goalAmount').required = true;

        setupDynamicPaymentLogic();

    } catch (err) {
        console.error("Admin check failed:", err);
    }
}

function setupDynamicPaymentLogic() {
    const addBtn = document.getElementById('addPaymentMethodBtn');
    const listContainer = document.getElementById('dynamicPaymentList');
    const methodSelector = document.getElementById('methodSelector');

    addBtn.addEventListener('click', () => {
        const methodType = methodSelector.value;
        addPaymentRow(listContainer, methodType);
    });
}

function addPaymentRow(container, type) {
    const rowId = Date.now();
    const row = document.createElement('div');
    row.className = 'payment-dynamic-row';
    row.dataset.id = rowId;

    const logos = {
        'bkash': './images/bkash.png',
        'nagad': './images/nagad.png',
        'rocket': './images/rocket.png',
        'upay': './images/upay.png',
        'bank': './images/bank.png' 
    };

    const logoSrc = logos[type] || logos['bank'];
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);

    row.innerHTML = `
        <div class="pay-row-left">
            <img src="${logoSrc}" alt="${type}" class="pay-logo-icon" onerror="this.style.display='none'">
            <span class="pay-method-name">${typeName}</span>
        </div>
        
        <div class="pay-row-inputs">
            <input type="text" class="post-input pay-number-input" placeholder="নাম্বার / A/C No" required>
            
            <select class="post-input pay-type-select">
                <option value="Personal">Personal</option>
                <option value="Agent">Agent</option>
                <option value="Merchant">Merchant</option>
            </select>
        </div>

        <button type="button" class="remove-pay-row" onclick="removeRow(${rowId})">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(row);
}

window.removeRow = function(id) {
    const row = document.querySelector(`.payment-dynamic-row[data-id="${id}"]`);
    if (row) row.remove();
};

// ====================================
// হেল্পার ফাংশন
// ====================================
const setLoading = (button, isLoading) => {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> প্রসেস হচ্ছে...';
        button.disabled = true;
    } else {
        if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
        button.disabled = false;
    }
};

const generateVideoThumbnailFromFile = (videoFile) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const url = URL.createObjectURL(videoFile);

        video.onloadeddata = () => { video.currentTime = 1; };
        video.onseeked = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.8);
        };
        video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Video load error')); };
        video.src = url;
    });
};

// ====================================
// ফর্ম সাবমিশন এবং মিডিয়া আপলোড (অফলাইন সাপোর্ট সহ)
// ====================================
function setupFormSubmissions() {
    const prayerForm = document.getElementById('prayerForm');
    if (prayerForm) {
        prayerForm.addEventListener('submit', handleNewPost);
        setupMediaUploads();
        setupAudioRecording();
        setupProfileImageUploads(); 
    }
}

async function handleNewPost(e) {
    e.preventDefault();
    const btn = document.getElementById('submitPrayerBtn');
    
    const title = document.getElementById('prayerTitleInput').value.trim();
    let details = document.getElementById('prayerDetailsTextarea').value.trim();
    
    if (!details && !isPollMode) { alert('বিস্তারিত লিখুন।'); return; }
    if (isPollMode && !title) { alert('পোলের একটি শিরোনাম দিন।'); return; }
    if (isPollMode && !details) details = title;

    const imageFile = document.getElementById('imageUploadInput').files[0];
    const videoFile = document.getElementById('videoUploadInput').files[0];
    const audioInputFile = document.getElementById('audioUploadInput').files[0];
    
    setLoading(btn, true);

    // --- AI MODERATION CHECK (Online Only) ---
    // অফলাইনে থাকলে AI চেক স্কিপ করা হবে, আপলোডের সময় আবার চেক হতে পারে
    if (navigator.onLine) {
        try {
            if (imageFile) {
                console.log("Checking image safety...");
                const img = new Image();
                img.src = URL.createObjectURL(imageFile);
                await new Promise(r => img.onload = r);
                
                const isSafe = await checkContentSafety(img);
                if (!isSafe) {
                    alert("দুঃখিত! আপনার ছবিতে আপত্তিকর কন্টেন্ট শনাক্ত হয়েছে। এটি আপলোড করা যাবে না।");
                    setLoading(btn, false);
                    return; 
                }
            }
        } catch (checkError) {
            console.error("Moderation check failed:", checkError);
        }
    }

    const youtubeUrl = document.getElementById('youtubeLinkInput').value.trim();

    try {
        let pollOptions = [];
        if (isPollMode) {
            const inputs = document.querySelectorAll('.poll-option-input');
            inputs.forEach((input, index) => {
                if (input.value.trim()) {
                    pollOptions.push({ id: index + 1, text: input.value.trim() });
                }
            });

            if (pollOptions.length < 2) {
                alert("পোলের জন্য অন্তত ২টি অপশন দিন।");
                setLoading(btn, false);
                return;
            }
        }

        // --- POST DATA OBJECT PREPARATION ---
        const postData = {
            author_uid: currentUser.id,
            title,
            details,
            youtube_url: youtubeUrl,
            is_poll: isPollMode,
            poll_options: isPollMode ? pollOptions : [],
            poll_votes: isPollMode ? {} : null,
            is_fundraising: false,
            status: 'active'
        };

        // Fundraising Logic
        if (postType === 'fundraising') {
            const organization_name = document.getElementById('organizationName').value.trim();
            const goal_amount = parseFloat(document.getElementById('goalAmount').value);
            const paymentRows = document.querySelectorAll('.payment-dynamic-row');
            const methods = [];
            
            paymentRows.forEach(row => {
                const type = row.querySelector('.pay-method-name').textContent.toLowerCase();
                const number = row.querySelector('.pay-number-input').value.trim();
                const mode = row.querySelector('.pay-type-select').value;
                if (number) methods.push({ type, number, mode });
            });

            const otherDetails = document.getElementById('campaignOtherDetails').value.trim();
            
            postData.is_fundraising = true;
            postData.organization_name = organization_name;
            postData.goal_amount = goal_amount;
            postData.current_amount = 0;
            postData.payment_details = { methods: methods, other_info: otherDetails };
        } else {
            const anonCheck = document.getElementById('anonymousCheckbox');
            postData.is_anonymous = anonCheck ? anonCheck.checked : false;
        }

        // --- OFFLINE CHECK & SAVE ---
        if (!navigator.onLine) {
            console.log("No internet. Saving to IndexedDB...");
            if (window.savePostOffline) {
                await window.savePostOffline(postData, imageFile, videoFile, audioInputFile, recordedAudioBlob);
                alert("ইন্টারনেট সংযোগ নেই। পোস্টটি অফলাইনে সংরক্ষণ করা হয়েছে। ইন্টারনেট সংযোগ ফিরে আসলে এটি স্বয়ংক্রিয়ভাবে আপলোড হবে।");
                window.location.href = '/index.html';
                return;
            } else {
                alert("ইন্টারনেট সংযোগ নেই এবং অফলাইন সেভ ফিচার লোড হয়নি।");
                setLoading(btn, false);
                return;
            }
        }

        // --- ONLINE UPLOAD LOGIC ---
        let imageUrl = null, uploadedVideoUrl = null, audioFileUrl = null, videoThumbnailUrl = null;

        if (!isPollMode) {
            if (imageFile) {
                const compressedFile = await window.compressImageFile(imageFile); // utils.js থেকে
                imageUrl = await window.uploadWithProgress('post_images', `${currentUser.id}_img_${Date.now()}`, compressedFile);
            } 
            else if (videoFile) {
                // Video Size Limit Check
                if (videoFile.size > 100 * 1024 * 1024) {
                    alert("ভিডিওর সাইজ ১০০ এমবির বেশি হতে পারবে না।");
                    setLoading(btn, false);
                    return;
                }
                uploadedVideoUrl = await window.uploadWithProgress('post_videos', `${currentUser.id}_vid_${Date.now()}`, videoFile);
            } 
            else if (recordedAudioBlob) {
                audioFileUrl = await window.uploadWithProgress('audio_prayers', `audio-${currentUser.id}-${Date.now()}.webm`, recordedAudioBlob);
            } else if (audioInputFile) {
                const fileName = `audio-${currentUser.id}-${Date.now()}.${audioInputFile.name.split('.').pop()}`;
                audioFileUrl = await window.uploadWithProgress('audio_prayers', fileName, audioInputFile);
            }
        }

        // ফাইনাল ডাটা আপডেট
        postData.image_url = imageUrl;
        postData.uploaded_video_url = uploadedVideoUrl;
        postData.audio_url = audioFileUrl;
        postData.video_thumbnail_url = videoThumbnailUrl;

        const { error: insertError } = await supabaseClient.from('prayers').insert([postData]);

        if (insertError) throw insertError;
        
        alert("সফলভাবে পোস্ট করা হয়েছে!");
        window.location.href = '/index.html';

    } catch (error) {
        console.error(error);
        alert('পোস্ট করতে সমস্যা হয়েছে: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

// ====================================
// মিডিয়া প্রিভিউ এবং অডিও রেকর্ডিং
// ====================================
function setupMediaUploads() {
    document.getElementById('imageUploadInput').addEventListener('change', e => {
        const f = e.target.files[0];
        if(f) { resetAllMediaInputs('image'); document.getElementById('imagePreview').src = URL.createObjectURL(f); document.getElementById('imagePreviewContainer').style.display = 'block'; }
    });
    document.getElementById('videoUploadInput').addEventListener('change', e => {
        const f = e.target.files[0];
        if(f) { resetAllMediaInputs('video'); document.getElementById('videoPreview').src = URL.createObjectURL(f); document.getElementById('videoPreviewContainer').style.display = 'block'; }
    });
    document.getElementById('audioUploadInput').addEventListener('change', e => {
        const f = e.target.files[0];
        if(f) { resetAllMediaInputs('audioFile'); document.getElementById('audioFilePreview').src = URL.createObjectURL(f); document.getElementById('audioFilePreviewContainer').style.display = 'block'; }
    });
    document.getElementById('removeImageBtn').addEventListener('click', () => resetAllMediaInputs('none'));
    document.getElementById('removeVideoBtn').addEventListener('click', () => resetAllMediaInputs('none'));
    document.getElementById('removeAudioFileBtn').addEventListener('click', () => resetAllMediaInputs('none'));
}

function resetAllMediaInputs(keepType) {
    if (keepType !== 'image') { document.getElementById('imageUploadInput').value = ''; document.getElementById('imagePreviewContainer').style.display = 'none'; }
    if (keepType !== 'video') { document.getElementById('videoUploadInput').value = ''; document.getElementById('videoPreviewContainer').style.display = 'none'; }
    if (keepType !== 'audioFile') { document.getElementById('audioUploadInput').value = ''; document.getElementById('audioFilePreviewContainer').style.display = 'none'; }
    if (keepType !== 'audioRecord') { recordedAudioBlob = null; document.getElementById('audioPlaybackContainer').style.display = 'none'; document.getElementById('recordingControls').style.display = 'none'; }
}

function setupAudioRecording() {
    document.getElementById('addAudioBtn').addEventListener('click', startRecording);
    document.getElementById('stopRecordingBtn').addEventListener('click', stopRecording);
    document.getElementById('rerecordBtn').addEventListener('click', () => { resetAllMediaInputs('audioRecord'); startRecording(); });
}

async function startRecording() {
    try {
        resetAllMediaInputs('audioRecord');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorderStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            document.getElementById('audioPlayback').src = URL.createObjectURL(recordedAudioBlob);
            document.getElementById('recordingControls').style.display = 'none';
            document.getElementById('audioPlaybackContainer').style.display = 'block';
        };
        mediaRecorder.start();
        document.getElementById('recordingControls').style.display = 'block';
        startTimer();
    } catch (e) { alert("মাইক্রোফোনের অনুমতি নেই।"); }
}

function stopRecording() {
    if(mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); if(recorderStream) recorderStream.getTracks().forEach(t => t.stop()); clearInterval(timerInterval); }
}

function startTimer() {
    let s = 0; const el = document.getElementById('recordingTimer'); el.innerText = "00:00";
    timerInterval = setInterval(() => { s++; const m = Math.floor(s / 60).toString().padStart(2, '0'); const sec = (s % 60).toString().padStart(2, '0'); el.innerText = `${m}:${sec}`; if(s >= 300) stopRecording(); }, 1000);
}

// ====================================
// প্রোফাইল ইমেজ কমপ্রেশন ও আপলোড
// ====================================
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

    if (file.size > 5 * 1024 * 1024) {
        alert("ফাইলের আকার খুব বেশি! ৫ এমবির নিচে হতে হবে।");
        return;
    }

    const loadingModal = document.getElementById('uploadProgressModal');
    if(loadingModal) loadingModal.style.display = 'flex';

    try {
        const compressedFile = await window.compressImageFile(file); // utils.js থেকে

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
        
        const { data, error: uploadError } = await supabaseClient.storage.from('post_images').upload(filePath, compressedFile, { upsert: true });
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