// ===========================================
// FILE: qibla.js
// বিবরণ: স্মুথ কিবলা কম্পাস, লো-পাস ফিল্টার এবং অটো লোকেশন (ফিক্সড)
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
    const degreeLabel = document.querySelector('.degree-label');

    // কনস্ট্যান্টস
    const MECCA_LAT = 21.422487;
    const MECCA_LNG = 39.826206;

    // ভ্যারিয়েবলস
    let qiblaAngle = 0; // মক্কার দিক (ফিক্সড)
    let currentHeading = 0; // ফোনের বর্তমান দিক (রিয়েলটাইম)
    let smoothHeading = 0; // ফিল্টার করা দিক
    let isAbsolute = false; // সেন্সর কি সঠিক উত্তর দিক দিচ্ছে?

    // স্মুথিং ফ্যাক্টর (০.১ - ০.২ এর মধ্যে রাখা ভালো)
    const SMOOTHING_FACTOR = 0.15; 

    // ১. অ্যাপ শুরু এবং অটো লোকেশন
    function startApp() {
        initLocation();

        // iOS ডিটেকশন (পারমিশন বাটন লাগবে)
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            permissionBtn.style.display = 'block';
            permissionBtn.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            permissionBtn.style.display = 'none';
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            alert('সেন্সর পারমিশন ছাড়া কম্পাস কাজ করবে না।');
                        }
                    })
                    .catch(console.error);
            });
        } else {
            // Android: 'deviceorientationabsolute' ইভেন্ট ট্রাই করবে (সঠিক উত্তর দিকের জন্য)
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', (e) => handleOrientation(e, true));
            } else {
                window.addEventListener('deviceorientation', (e) => handleOrientation(e, false));
            }
        }
        
        // এনিমেশন লুপ
        requestAnimationFrame(updateCompassFrame);
    }

    // ২. অটোমেটিক লোকেশন (GPS)
    function initLocation() {
        loader.style.display = 'block';
        cityDisplay.innerText = "লোকেশন খুঁজছে...";
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(successLocation, errorLocation, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        } else {
            cityDisplay.innerText = "লোকেশন অফ";
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
        cityDisplay.innerText = "লোকেশন পাওয়া যায়নি";
        // ডিফল্ট ঢাকা (যাতে অ্যাপ খালি না থাকে)
        calculateQiblaDetails(23.8103, 90.4125); 
        console.warn("Location Error: " + err.message);
    }

    // ৩. গাণিতিক হিসাব (কিবলা এঙ্গেল)
    function calculateQiblaDetails(lat, lng) {
        const phiK = MECCA_LAT * Math.PI / 180.0;
        const lambdaK = MECCA_LNG * Math.PI / 180.0;
        const phi = lat * Math.PI / 180.0;
        const lambda = lng * Math.PI / 180.0;
        
        const y = Math.sin(lambdaK - lambda);
        const x = Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(lambdaK - lambda);
        
        let qibla = Math.atan2(y, x) * 180.0 / Math.PI;
        qiblaAngle = (qibla + 360) % 360; 

        // দূরত্ব
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

    // ৪. সেন্সর ডেটা হ্যান্ডলিং (আসল সমস্যা ফিক্স)
    function handleOrientation(event, isAbsoluteEvent) {
        let heading = null;

        if (event.webkitCompassHeading) {
            // iOS (সরাসরি সঠিক দিক দেয়)
            heading = event.webkitCompassHeading;
            isAbsolute = true;
        } else if (isAbsoluteEvent && event.alpha != null) {
            // Android Absolute (সঠিক উত্তর দিক)
            // Android এ alpha বাড়ে এন্টি-ক্লকওয়াইজ, তাই ৩৬০ থেকে বিয়োগ করতে হয়
            heading = 360 - event.alpha;
            isAbsolute = true;
        } else if (event.alpha != null) {
            // সাধারণ ফলব্যাক (হয়তো সঠিক উত্তর দিক নাও হতে পারে)
            heading = 360 - event.alpha;
        }

        if (heading == null) return;
        
        // নরমালাইজেশন (০-৩৬০ এর মধ্যে রাখা)
        currentHeading = heading % 360;
    }

    // ৫. স্মুথ এনিমেশন এবং UI আপডেট লুপ
    function updateCompassFrame() {
        // --- স্মার্ট স্মুথিং লজিক (জাম্প ফিক্স সহ) ---
        // ৩৬০ থেকে ০ ডিগ্রিতে যাওয়ার সময় যাতে চাকা উল্টো না ঘোরে
        let delta = currentHeading - smoothHeading;
        
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        smoothHeading += delta * SMOOTHING_FACTOR;

        // ভ্যালু নরমালাইজ করা
        let displayHeading = (smoothHeading % 360);
        if(displayHeading < 0) displayHeading += 360;

        // --- UI রোটেশন ---
        
        // ১. ডায়াল ঘোরানো (বিপরীত দিকে)
        // ফোন ডান দিকে (৯০°) ঘুরলে, ডায়াল বাম দিকে (-৯০°) ঘুরবে যাতে "N" উত্তরে স্থির থাকে।
        dialGroup.style.transform = `rotate(${-displayHeading}deg)`;

        // ২. কিবলা পয়েন্টার ঘোরানো
        // পয়েন্টার সবসময় কাবার দিকে (qiblaAngle) থাকবে।
        // যেহেতু ডায়াল ঘুরছে, তাই পয়েন্টারকেও ডায়ালের সাপেক্ষে এডজাস্ট করতে হবে।
        const pointerRotation = qiblaAngle - displayHeading;
        qiblaPointerGroup.style.transform = `rotate(${pointerRotation}deg)`;

        // ৩. ডিজিটাল ডিসপ্লে আপডেট (এখন এটি ফোনের ঘূর্ণন দেখাবে)
        // এটি আপনার চাওয়া অনুযায়ী ফিক্স করা হয়েছে। ফোন ঘোরালে সংখ্যা কমবে/বাড়বে।
        degreeDisplay.innerText = `${Math.round(displayHeading)}°`;
        
        // লেবেল আপডেট (বোঝার সুবিধার জন্য)
        if (Math.abs(displayHeading - qiblaAngle) < 5) {
            degreeLabel.innerText = "QIBLA ALIGNED";
            degreeLabel.style.color = "#2ecc71";
        } else {
            degreeLabel.innerText = `QIBLA IS AT ${Math.round(qiblaAngle)}°`;
            degreeLabel.style.color = "#D4AF37";
        }

        // ৪. এলাইনমেন্ট চেক (স্মার্ট গ্রিন গ্লো)
        // যখন ফোনের মাথা (0°) এবং কিবলা এঙ্গেল (qiblaAngle) একই লাইনে আসবে।
        let diff = Math.abs(displayHeading - qiblaAngle);
        // ৩৬০ ডিগ্রির র‍্যাপ অ্যারাউন্ড হ্যান্ডেল করা
        if (diff > 180) diff = 360 - diff;

        // ৩ ডিগ্রি মার্জিন
        if (diff < 3) {
            compassFrame.classList.add('aligned');
            if (navigator.vibrate) {
               // ভাইব্রেশন (খুব হালকা)
               // navigator.vibrate(10); 
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
            cityDisplay.innerText = "GPS Connected";
        }
    }

    // শুরু করুন
    startApp();
});
