// ====================================
// FILE: config.js
// বিবরণ: Supabase কনফিগারেশন এবং গ্লোবাল ভ্যারিয়েবল
// ====================================

const SUPABASE_URL = 'https://pnsvptaanvtdaspqjwbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuc3ZwdGFhbnZ0ZGFzcHFqd2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMzcxNjMsImV4cCI6MjA3NTkxMzE2M30.qposYOL-W17DnFF11cJdZ7zrN1wh4Bop6YnclkUe_rU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================================
// GLOBAL VARIABLES (সারা প্রজেক্টে ব্যবহৃত হবে)
// ====================================
let currentUser = null;
let prayersSubscription = null;
let allFetchedPrayers = new Map();
let isVideoFeedActive = false;
const ADMIN_USERS = ['bm15.telecom@gmail.com', 'alaminsarkar.bsc@gmail.com'];

// Feed & Pagination State
let currentPage = 0;
const prayersPerPage = 8; 
let isLoadingMore = false;
let noMorePrayers = false;
let shuffledPrayerIds = [];
let isFeedInitialized = false;
let fundraisingPosts = [];
let currentFundraisingIndex = 0;
let currentFeedType = 'for_you'; 
let savedPostIds = new Set();
let filteredUserId = null;
let feedObserver = null;
let shortsObserver = null;

// Donation Variables
let activeDonationCampaignId = null;
let adminPaymentNumbers = {};

// Video Tracking
const viewedVideosSession = new Set();

// User Reaction Cache
let userLovedPrayers = new Set();
let userAmeenedPrayers = new Set();

// Story Editor State Global
let storyGroups = []; 
let storyEditorState = {
    mode: 'text', 
    mediaFile: null,      
    mediaBlob: null,      
    bgColor: 'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    textColor: '#ffffff',
    isRecording: false,
    isMuted: false,       
    recordingTimer: null, 
    mediaRecorder: null,
    recordedChunks: [],
    stream: null,
    maxDuration: 30       
};

let storyViewerState = {
    isOpen: false,
    currentUserIndex: 0,
    currentStoryIndex: 0,
    storyTimeout: null,
    isPaused: false
};

const STORY_GRADIENTS = [
    'linear-gradient(135deg, #fc4a1a 0%, #f7b733 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
    'linear-gradient(135deg, #000000 0%, #434343 100%)',
    'linear-gradient(135deg, #FF0099 0%, #493240 100%)',
    'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)'
];
let currentGradientIndex = 0;