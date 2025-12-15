// ===========================================
// FILE: finder.js
// বিবরণ: মসজিদ এবং হালাল রেস্টুরেন্ট ফাইন্ডার লজিক
// ===========================================

let map;
let userMarker;
let markersLayer;
let currentMode = 'mosque'; // 'mosque' or 'halal'
let userLat = 23.8103; // ডিফল্ট ঢাকা
let userLng = 90.4125;

// ১. অ্যাপ শুরু
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    getUserLocation();
});

// ২. ম্যাপ ইনিশিয়ালাইজেশন
function initMap() {
    // ডার্ক ম্যাপ টাইলস
    map = L.map('map', { zoomControl: false }).setView([userLat, userLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);

    // ম্যাপ মুভ করলে "Search Here" বাটন দেখাবে
    map.on('moveend', () => {
        document.getElementById('reloadBtn').style.display = 'block';
    });
}

// ৩. ইউজার লোকেশন
function getUserLocation() {
    const loader = document.getElementById('loader');
    loader.style.display = 'flex';

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;
                
                // ম্যাপ আপডেট
                map.setView([userLat, userLng], 15);
                addUserMarker();
                
                // অটোমেটিক সার্চ শুরু
                fetchPlaces();
            },
            (error) => {
                loader.style.display = 'none';
                alert("লোকেশন পাওয়া যায়নি। ডিফল্ট লোকেশনে দেখানো হচ্ছে।");
                fetchPlaces(); // ডিফল্ট লোকেশনেই খুঁজবে
            },
            { enableHighAccuracy: true }
        );
    } else {
        loader.style.display = 'none';
        alert("আপনার ব্রাউজার জিওলোকেশন সাপোর্ট করে না।");
    }
}

// ইউজার মার্কার (গোল্ডেন রিং)
function addUserMarker() {
    if (userMarker) map.removeLayer(userMarker);
    
    const userIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="custom-marker marker-user"><i class="fas fa-user"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
}

// ৪. মোড সুইচিং (মসজিদ <-> খাবার)
function switchMode(mode) {
    currentMode = mode;
    
    // বাটন স্টাইল আপডেট
    document.getElementById('btn-mosque').classList.toggle('active', mode === 'mosque');
    document.getElementById('btn-halal').classList.toggle('active', mode === 'halal');
    
    // নতুন করে খোঁজা
    fetchPlaces();
}

// ৫. বাটন ক্লিক করলে ভিউপোর্টে খোঁজা
function searchInView() {
    const center = map.getCenter();
    userLat = center.lat;
    userLng = center.lng;
    fetchPlaces();
    document.getElementById('reloadBtn').style.display = 'none';
}

// ৬. এপিআই কল (Overpass API - Free)
async function fetchPlaces() {
    const loader = document.getElementById('loader');
    const listContainer = document.getElementById('resultsList');
    
    loader.style.display = 'flex';
    listContainer.innerHTML = '';
    markersLayer.clearLayers(); // আগের মার্কার রিমুভ

    // বাউন্ডারি সেট করা (আশেপাশের ২ কিমি)
    // Overpass API Query Language
    let query = '';
    const bounds = map.getBounds();
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

    if (currentMode === 'mosque') {
        // মসজিদ খোঁজার কুয়েরি
        query = `
            [out:json][timeout:25];
            (
              node["amenity"="place_of_worship"]["religion"="muslim"](${bbox});
              way["amenity"="place_of_worship"]["religion"="muslim"](${bbox});
            );
            out center;
        `;
    } else {
        // হালাল রেস্টুরেন্ট খোঁজার কুয়েরি
        query = `
            [out:json][timeout:25];
            (
              node["diet:halal"="yes"](${bbox});
              node["cuisine"="halal"](${bbox});
              way["diet:halal"="yes"](${bbox});
            );
            out center;
        `;
    }

    try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        loader.style.display = 'none';
        
        if (data.elements.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#aaa;">আশেপাশে কিছু পাওয়া যায়নি। ম্যাপ জুম আউট করে আবার চেষ্টা করুন।</p>';
            return;
        }

        renderResults(data.elements);

    } catch (error) {
        loader.style.display = 'none';
        listContainer.innerHTML = '<p style="text-align:center; color:#e74c3c;">নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।</p>';
        console.error(error);
    }
}

// ৭. রেজাল্ট রেন্ডার করা (লিস্ট এবং ম্যাপ মার্কার)
function renderResults(places) {
    const listContainer = document.getElementById('resultsList');
    
    places.forEach(place => {
        // কো-অর্ডিনেট বের করা (Node বা Way এর সেন্টার)
        const lat = place.lat || place.center.lat;
        const lon = place.lon || place.center.lon;
        const name = place.tags.name || (currentMode === 'mosque' ? 'মসজিদ' : 'রেস্টুরেন্ট');
        const address = place.tags['addr:street'] || place.tags['addr:city'] || "ঠিকানা নেই";
        
        // মার্কার যোগ করা
        const iconClass = currentMode === 'mosque' ? 'marker-mosque' : 'marker-food';
        const faIcon = currentMode === 'mosque' ? 'fa-mosque' : 'fa-utensils';
        
        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="custom-marker ${iconClass}"><i class="fas ${faIcon}"></i></div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });

        const marker = L.marker([lat, lon], { icon: customIcon })
            .bindPopup(`<b>${name}</b><br>${address}`)
            .addTo(markersLayer);

        // লিস্ট আইটেম যোগ করা
        const distance = getDistance(userLat, userLng, lat, lon).toFixed(2);
        
        const item = document.createElement('div');
        item.className = 'place-card';
        item.innerHTML = `
            <div class="place-icon">
                <i class="fas ${faIcon}"></i>
            </div>
            <div class="place-info">
                <h3>${name}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${address}</p>
                <p style="color:var(--accent-green); font-size:0.75rem; margin-top:2px;">
                    <i class="fas fa-location-arrow"></i> ${distance} km
                </p>
            </div>
            <button class="direction-btn" onclick="openMaps(${lat}, ${lon})">
                <i class="fas fa-directions"></i>
            </button>
        `;
        
        // লিস্টে ক্লিক করলে ম্যাপ জুম হবে
        item.addEventListener('click', (e) => {
            if(!e.target.closest('.direction-btn')) {
                map.flyTo([lat, lon], 18);
                marker.openPopup();
            }
        });

        listContainer.appendChild(item);
    });
}

// ৮. গুগল ম্যাপে ওপেন করা
window.openMaps = function(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

// ৯. দূরত্ব মাপার ফাংশন (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}