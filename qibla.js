// ===========================================
// FILE: qibla.js
// বিবরণ: স্মুথ কিবলা কম্পাস, লো-পাস ফিল্টার এবং অটো লোকেশন
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dialGroup = document.getElementById('dialGroup');
    const qiblaPointerGroup = document.getElementById('qiblaPointerGroup');
    const degreeDisplay = document.getElementById('degreeDisplay');
    const cityDisplay = document.getElementById('cityDisplay');
    const distanceDisplay = document.getElementById('distanceDisplay');
    const permissionBtn = document.getElementById('permission-btn');
    const loader = document.getElementById('loader');
    const compassFrame = document.getElementById('compassFrame');
    const errorMsg = document.getElementById('errorMsg');

    // কনস্ট্যান্টস
    const MECCA_LAT = 21.422487;
    const MECCA_LNG = 39.826206;

    // ভ্যারিয়েবলস
    let qiblaAngle = 0; // মক্কার দিক (True North সাপেক্ষে)
    let currentHeading = 0; // ফোনের বর্তমান দিক (Raw)
    let smoothHeading = 0; // ফিল্টার করা দিক (Smooth)
    
    // স্মুথিং ফ্যাক্টর (যত কম, তত বেশি স্মুথ কিন্তু লেট হবে। ০.১ - ০.২ আদর্শ)
    const SMOOTHING_FACTOR = 0.15; 

    // ১. অটো স্টার্ট এবং পারমিশন
    function initApp() {
        // লোকেশন আগে শুরু করি
        initLocation();

        // আইফোন (iOS 13+) হলে পারমিশন বাটন দেখাতে হবে
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            permissionBtn.style.display = 'block';
            permissionBtn.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            permissionBtn.style.display = 'none';
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            alert('সেন্সর পারমিশন প্রয়োজন।');
                        }
                    })
                    .catch(console.error);
            });
        } else {
            // অ্যান্ড্রয়েড বা অন্য ব্রাউজার (অটোমেটিক)
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', handleOrientation);
            } else if ('ondeviceorientation' in window) {
                window.addEventListener('deviceorientation', handleOrientation);
            } else {
                showError("আপনার ডিভাইসে কম্পাস সেন্সর নেই।");
            }
        }
        
        // এনিমেশন লুপ চালু করা
        requestAnimationFrame(updateCompassFrame);
    }

    // ২. অটোমেটিক লোকেশন (GPS)
    function initLocation() {
        loader.style.display = 'block';
        cityDisplay.innerText = "খোঁজা হচ্ছে...";
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(successLocation, errorLocation, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            });
        } else {
            showError("জিওলোকেশন সাপোর্ট করছে না।");
        }
    }

    function successLocation(position) {
        loader.style.display = 'none';
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // মক্কার দিক এবং দূরত্ব হিসাব
        calculateQiblaDetails(lat, lng);
        
        // শহরের নাম (API)
        fetchCityName(lat, lng);
    }

    function errorLocation(err) {
        loader.style.display = 'none';
        cityDisplay.innerText = "লোকেশন অফ";
        
        // ডিফল্ট ঢাকা (জাস্ট দেখানোর জন্য, যাতে অ্যাপ খালি না দেখায়)
        calculateQiblaDetails(23.8103, 90.4125); 
        
        // ব্যবহারকারীকে জানানো
        if (err.code === 1) alert("দয়া করে লোকেশন পারমিশন দিন।");
        else if (err.code === 2) alert("লোকেশন পাওয়া যাচ্ছে না। জিপিএস অন করুন।");
    }

    // ৩. গণিত: কিবলা এবং দূরত্ব
    function calculateQiblaDetails(lat, lng) {
        const phiK = MECCA_LAT * Math.PI / 180.0;
        const lambdaK = MECCA_LNG * Math.PI / 180.0;
        const phi = lat * Math.PI / 180.0;
        const lambda = lng * Math.PI / 180.0;
        
        const y = Math.sin(lambdaK - lambda);
        const x = Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(lambdaK - lambda);
        
        let qibla = Math.atan2(y, x) * 180.0 / Math.PI;
        qiblaAngle = (qibla + 360) % 360; 

        // দূরত্ব (Haversine)
        const R = 6371; 
        const dLat = (MECCA_LAT - lat) * Math.PI / 180;
        const dLon = (MECCA_LNG - lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(MECCA_LAT * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = Math.round(R * c);

        distanceDisplay.innerText = `${distance.toLocaleString()} km`;
    }

    // ৪. সেন্সর ডেটা হ্যান্ডলিং
    function handleOrientation(event) {
        let heading = event.alpha;

        if (event.webkitCompassHeading) {
            heading = event.webkitCompassHeading; // iOS
        } else if (event.absolute) {
            heading = 360 - heading; // Android Absolute
        }
        
        if (heading == null) return;
        
        // Raw Heading স্টোর করা, UI লুপে আপডেট হবে
        currentHeading = heading;
    }

    // ৫. স্মুথ এনিমেশন লুপ (requestAnimationFrame)
    function updateCompassFrame() {
        if (qiblaAngle === 0 && currentHeading === 0) {
            requestAnimationFrame(updateCompassFrame);
            return;
        }

        // --- স্মার্ট স্মুথিং লজিক (Low Pass Filter) ---
        // ৩৬০ ডিগ্রি থেকে ০ ডিগ্রিতে লাফানো আটকানো
        let delta = currentHeading - smoothHeading;
        
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        smoothHeading += delta * SMOOTHING_FACTOR;

        // নরমালাইজেশন (০-৩৬০ এর মধ্যে রাখা)
        smoothHeading = (smoothHeading + 360) % 360;

        // --- UI আপডেট ---
        
        // ১. ডায়াল ঘোরানো (বিপরীত দিকে)
        // আমরা যখন ফোন ঘোরাই, ডায়াল স্থির থাকার কথা (নর্থের দিকে), তাই এটি উল্টো ঘোরে।
        dialGroup.style.transform = `rotate(${-smoothHeading}deg)`;

        // ২. কিবলা পয়েন্টার ঘোরানো
        // পয়েন্টার সবসময় মক্কার দিকে থাকবে।
        // লজিক: মক্কার দিক (qiblaAngle) - ফোনের দিক (smoothHeading)
        const pointerRotation = qiblaAngle - smoothHeading;
        
        // পয়েন্টারটি ৩৬০ ডিগ্রির শর্টেস্ট পথে ঘোরানো (জাম্প ফিক্স)
        // এটি CSS transition এর ঝামেলা কমায়, তবে এখানে আমরা JS দিয়ে পজিশন দিচ্ছি
        qiblaPointerGroup.style.transform = `rotate(${pointerRotation}deg)`;

        // ৩. ডিজিটাল ডিসপ্লে
        degreeDisplay.innerText = `${Math.round(qiblaAngle)}°`;

        // ৪. এলাইনমেন্ট চেক (স্মার্ট গ্রিন গ্লো)
        // যখন পয়েন্টার একদম সোজাসুজি (0 এর কাছে) থাকে
        let relativeAngle = (pointerRotation % 360);
        if(relativeAngle < 0) relativeAngle += 360;

        // ৫ ডিগ্রি মার্জিন
        if (relativeAngle < 5 || relativeAngle > 355) {
            compassFrame.classList.add('aligned');
            // ভাইব্রেশন (অল্প)
            if (navigator.vibrate) {
                // লুপে বারবার ভাইব্রেশন না হওয়ার জন্য চেক করা উচিত, তবে এখানে সিম্পল রাখা হলো
            }
        } else {
            compassFrame.classList.remove('aligned');
        }

        // লুপ চালিয়ে যাওয়া
        requestAnimationFrame(updateCompassFrame);
    }

    // শহরের নাম আনা
    async function fetchCityName(lat, lng) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            const city = data.address.city || data.address.town || data.address.suburb || "আপনার অবস্থান";
            cityDisplay.innerText = city;
        } catch (e) {
            cityDisplay.innerText = "লোকেশন ডিটেক্টেড";
        }
    }

    function showError(msg) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = msg;
    }

    // শুরু করুন
    initApp();
});