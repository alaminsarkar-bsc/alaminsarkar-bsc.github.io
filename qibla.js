// ===========================================
// FILE: qibla.js
// বিবরণ: কিবলা কম্পাস লজিক, সেন্সর হ্যান্ডলিং এবং ক্যালকুলেশন
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const compassDial = document.getElementById('compassDial');
    const qiblaPointer = document.getElementById('qiblaPointer');
    const degreeDisplay = document.getElementById('degreeDisplay');
    const cityDisplay = document.getElementById('cityDisplay');
    const distanceDisplay = document.getElementById('distanceDisplay');
    const permissionBtn = document.getElementById('permission-btn');
    const loader = document.getElementById('loader');
    const compassFrame = document.getElementById('compassFrame');

    // কনস্ট্যান্টস
    const MECCA_LAT = 21.422487;
    const MECCA_LNG = 39.826206;

    // স্টেট ভ্যারিয়েবলস
    let qiblaAngle = 0;
    let userLat = null;
    let userLng = null;

    // ১. পারমিশন চেক এবং অ্যাপ শুরু
    function startApp() {
        // iOS ডিটেকশন
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            permissionBtn.style.display = 'block';
            permissionBtn.addEventListener('click', requestIOSPermission);
        } else {
            // Android বা অন্য ব্রাউজার (সরাসরি শুরু হবে)
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            window.addEventListener('deviceorientation', handleOrientation, true);
            initLocation(); // অটো লোকেশন কল
        }
    }

    // iOS পারমিশন রিকোয়েস্ট
    function requestIOSPermission() {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    permissionBtn.style.display = 'none';
                    window.addEventListener('deviceorientation', handleOrientation);
                    initLocation();
                } else {
                    alert('কম্পাস ব্যবহারের জন্য অনুমতি প্রয়োজন।');
                }
            })
            .catch(console.error);
    }

    // ২. অটো লোকেশন বের করা (GPS)
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
            showError("জিওলোকেশন সাপোর্ট করছে না।");
        }
    }

    function successLocation(position) {
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        
        loader.style.display = 'none';

        // কিবলা এঙ্গেল এবং দূরত্ব বের করা
        calculateQiblaDetails(userLat, userLng);
        
        // শহরের নাম বের করা (Reverse Geocoding)
        fetchCityName(userLat, userLng);
    }

    function errorLocation(err) {
        loader.style.display = 'none';
        console.warn(`ERROR(${err.code}): ${err.message}`);
        cityDisplay.innerText = "লোকেশন অফ";
        distanceDisplay.innerText = "--";
        // ডিফল্ট ঢাকা (জাস্ট দেখানোর জন্য)
        userLat = 23.8103; 
        userLng = 90.4125;
        calculateQiblaDetails(userLat, userLng);
        alert("সঠিক কিবলা পেতে দয়া করে লোকেশন চালু করুন।");
    }

    // ৩. গাণিতিক হিসাব (Qibla Angle Calculation)
    function calculateQiblaDetails(lat, lng) {
        // কিবলা এঙ্গেল (True North সাপেক্ষে)
        const phiK = MECCA_LAT * Math.PI / 180.0;
        const lambdaK = MECCA_LNG * Math.PI / 180.0;
        const phi = lat * Math.PI / 180.0;
        const lambda = lng * Math.PI / 180.0;
        
        const y = Math.sin(lambdaK - lambda);
        const x = Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(lambdaK - lambda);
        
        let qibla = Math.atan2(y, x) * 180.0 / Math.PI;
        qiblaAngle = (qibla + 360) % 360; // পজিটিভ এঙ্গেল

        // দূরত্ব বের করা (Haversine Formula)
        const R = 6371; // পৃথিবীর ব্যাসার্ধ (km)
        const dLat = (MECCA_LAT - lat) * Math.PI / 180;
        const dLon = (MECCA_LNG - lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat * Math.PI / 180) * Math.cos(MECCA_LAT * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = Math.round(R * c);

        distanceDisplay.innerText = `${distance.toLocaleString()} km`;
    }

    // ৪. সেন্সর হ্যান্ডলিং (Compass Rotation)
    function handleOrientation(event) {
        let heading = event.alpha;

        // Android Absolute Heading Fix
        if (event.webkitCompassHeading) {
            // iOS
            heading = event.webkitCompassHeading;
        } else if (event.absolute) {
            // Android Absolute property
            heading = 360 - heading; 
        }
        
        // হেডিং না পেলে থামুন
        if (heading === null || heading === undefined) return;

        updateCompassUI(heading);
    }

    // ৫. UI আপডেট
    function updateCompassUI(currentHeading) {
        if (qiblaAngle === 0) return;

        // ১. ডায়াল ঘোরানো (যাতে নর্থ সবসময় উত্তরে থাকে)
        // CSS এর transform ব্যবহার করে স্মুথ রোটেশন
        compassDial.style.transform = `rotate(${-currentHeading}deg)`;

        // ২. কিবলা পয়েন্টার ঘোরানো
        // পয়েন্টারটি ডায়ালের সাপেক্ষে ঘুরবে।
        // লজিক: ডায়াল -heading এ ঘুরছে। কাবার দিক (qiblaAngle) ফিক্সড।
        // তাই পয়েন্টারকে ডায়ালের সাথে সামঞ্জস্য রাখতে হবে।
        // সহজ হিসাব: পয়েন্টারকে qiblaAngle - currentHeading এ ঘোরালে এটি সবসময় কাবার দিকে থাকবে।
        
        const pointerRotation = qiblaAngle - currentHeading;
        qiblaPointer.style.transform = `rotate(${pointerRotation}deg)`;

        // ৩. ডিজিটাল রিডিং
        degreeDisplay.innerText = `${Math.round(qiblaAngle)}°`;

        // ৪. এলাইনমেন্ট চেক (যখন ফোনের মাথা কাবার দিকে)
        // ফোনের নর্থ (0) যখন qiblaAngle এর সমান হবে, তখন currentHeading == qiblaAngle হবে।
        // তখন পয়েন্টারটি সোজাসুজি (0 ডিগ্রি রিলেটিভ টু ফোন) থাকবে না।
        
        // ইউজার ফোন ঘোরাচ্ছে। যখন পয়েন্টারটি ঠিক মাঝখানে (উপরের দিকে) আসবে।
        // পয়েন্টার রোটেশন যখন ০ এর কাছাকাছি।
        
        // নরমালাইজ করা যাতে ৩৬০ এবং ০ এর জাম্প ইস্যু না হয়
        let relativeAngle = (pointerRotation % 360);
        if(relativeAngle < 0) relativeAngle += 360;

        // যদি পয়েন্টার সোজাসুজি (উপরে) থাকে, তার মানে আপনি কাবার দিকে মুখ করে আছেন
        const isAligned = relativeAngle < 5 || relativeAngle > 355;

        if (isAligned) {
            compassFrame.classList.add('aligned');
            if (navigator.vibrate) {
                // ব্যাটারি বাচাতে খুব ঘন ঘন ভাইব্রেশন এড়ানো ভালো
                // navigator.vibrate(20); 
            }
        } else {
            compassFrame.classList.remove('aligned');
        }
    }

    // শহরের নাম আনা (OpenStreetMap API)
    async function fetchCityName(lat, lng) {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            const city = data.address.city || data.address.town || data.address.village || data.address.county || "অজানা স্থান";
            cityDisplay.innerText = city;
        } catch (e) {
            cityDisplay.innerText = "লোকেশন ডিটেক্টেড";
        }
    }

    // অ্যাপ চালু
    startApp();
});