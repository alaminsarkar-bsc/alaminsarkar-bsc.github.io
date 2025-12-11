// permission-check.js
function requestMediaPermissions() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // মাইক্রোফোন পারমিশন রিকোয়েস্ট
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function(stream) {
                console.log("Microphone permission granted");
                stream.getTracks().forEach(track => track.stop());
                
                // ক্যামেরা পারমিশন রিকোয়েস্ট
                return navigator.mediaDevices.getUserMedia({ video: true });
            })
            .then(function(stream) {
                console.log("Camera permission granted");
                stream.getTracks().forEach(track => track.stop());
            })
            .catch(function(err) {
                console.warn("Permission denied:", err);
                if (err.name === 'NotAllowedError') {
                    showPermissionPrompt();
                }
            });
    } else {
        console.warn("getUserMedia is not supported in this browser");
    }
}

function showPermissionPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'permission-prompt';
    prompt.innerHTML = `
        <p>Please allow microphone and camera permissions for calling features.</p>
        <button onclick="window.location.reload()" style="background:#0084ff;color:white;border:none;padding:8px 15px;border-radius:5px;margin-top:10px;">
            Refresh & Allow
        </button>
    `;
    document.body.appendChild(prompt);
    
    setTimeout(() => {
        if (prompt.parentNode) {
            prompt.parentNode.removeChild(prompt);
        }
    }, 10000);
}

// DOM লোড হওয়ার পরে পারমিশন চেক করুন
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(requestMediaPermissions, 2000);
});