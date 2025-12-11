// permission-check.js
async function requestMediaPermissions() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("getUserMedia is not supported in this browser");
            showPermissionPrompt("Your browser doesn't support media devices. Please use Chrome, Firefox, or Safari.");
            return false;
        }

        // প্রথমে মাইক্রোফোন পারমিশন চেক
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone permission granted");
            stream.getTracks().forEach(track => track.stop());
        } catch (err) {
            console.warn("Microphone permission denied:", err);
            showPermissionPrompt("Microphone permission is required for voice calls and audio messages. Please allow microphone access.");
            return false;
        }

        // তারপর ক্যামেরা পারমিশন চেক
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            console.log("Camera permission granted");
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (err) {
            console.warn("Camera permission denied:", err);
            showPermissionPrompt("Camera permission is required for video calls. Please allow camera access for full calling features.");
            return false;
        }
    } catch (err) {
        console.error("Error checking media permissions:", err);
        return false;
    }
}

function showPermissionPrompt(message) {
    // যদি ইতিমধ্যে প্রম্পট থাকে, তাহলে নতুন তৈরি করবেন না
    if (document.querySelector('.permission-prompt')) return;
    
    const prompt = document.createElement('div');
    prompt.className = 'permission-prompt';
    prompt.innerHTML = `
        <p>${message}</p>
        <div style="margin-top: 10px;">
            <button onclick="this.parentElement.parentElement.remove();" style="background:#666;color:white;border:none;padding:8px 15px;border-radius:5px;margin-right:10px;">
                Dismiss
            </button>
            <button onclick="location.reload()" style="background:#0084ff;color:white;border:none;padding:8px 15px;border-radius:5px;">
                Refresh & Allow
            </button>
        </div>
    `;
    document.body.appendChild(prompt);
    
    // ১৫ সেকেন্ড পর অটোমেটিক রিমুভ
    setTimeout(() => {
        if (prompt.parentNode) {
            prompt.parentNode.removeChild(prompt);
        }
    }, 15000);
}

// DOM লোড হওয়ার পরে পারমিশন চেক করুন
document.addEventListener('DOMContentLoaded', function() {
    // ZegoCloud লোড হওয়ার পরে পারমিশন চেক করুন
    setTimeout(async () => {
        // শুধুমাত্র কল ফিচার থাকলে পারমিশন চেক করুন
        if (document.getElementById('audioCallBtn') || document.getElementById('videoCallBtn')) {
            const hasPermissions = await requestMediaPermissions();
            if (!hasPermissions) {
                console.log("Media permissions not fully granted. Some features may be limited.");
            }
        }
    }, 3000);
});

// ব্রাউজার পারমিশন স্ট্যাটাস ট্র্যাক করুন
if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
        permissionStatus.onchange = () => {
            console.log('Microphone permission changed to:', permissionStatus.state);
        };
    });

    navigator.permissions.query({ name: 'camera' }).then(permissionStatus => {
        permissionStatus.onchange = () => {
            console.log('Camera permission changed to:', permissionStatus.state);
        };
    });
}