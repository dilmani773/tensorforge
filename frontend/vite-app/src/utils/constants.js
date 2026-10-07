import {
  Ban,
  Bike,
  BriefcaseBusiness,
  CarFront,
  CreditCard,
  Headphones,
  Mail,
  MessageSquare,
  Shield,
  Smartphone,
  Utensils,
  UserRound,
} from 'lucide-react';

/* Category → team mapping from the API contract (labels.py) */
export const TEAM_BY_CATEGORY = {
  payment_refund: 'Payments & Refunds',
  ride_trip_issue: 'Ride Operations',
  lost_item: 'Lost & Found',
  order_missing_wrong: 'Food Operations',
  delivery_delay: 'Delivery Operations',
  food_quality: 'Restaurant Quality',
  account_promo: 'Account Services',
  safety_conduct: 'Trust & Safety',
  app_technical: 'Tech Support',
  general_inquiry: 'Front-line Support',
  spam_irrelevant: 'Auto-close / Spam Filter',
};

/* 11 Production Backend Routing Teams with official category keys matching the API contract */
export const TEAMS_METADATA = [
  {
    name: 'Payments & Refunds',
    key: 'payment_refund',
    category: 'payment_refund',
    icon: CreditCard,
    desc: 'Disputed charges, wallet & payouts',
  },
  {
    name: 'Ride Operations',
    key: 'ride_trip_issue',
    category: 'ride_trip_issue',
    icon: CarFront,
    desc: 'Fares, pickups & ride cancellations',
  },
  {
    name: 'Lost & Found',
    key: 'lost_item',
    category: 'lost_item',
    icon: BriefcaseBusiness,
    desc: 'Left items in cabs & vehicle recovery',
  },
  {
    name: 'Food Operations',
    key: 'order_missing_wrong',
    category: 'order_missing_wrong',
    icon: Utensils,
    desc: 'Missing portions & dish preparation',
  },
  {
    name: 'Delivery Operations',
    key: 'delivery_delay',
    category: 'delivery_delay',
    icon: Bike,
    desc: 'Rider routing, delays & GPS dropoffs',
  },
  {
    name: 'Restaurant Quality',
    key: 'food_quality',
    category: 'food_quality',
    icon: Utensils,
    desc: 'Food temp, spillage & packaging standards',
  },
  {
    name: 'Account Services',
    key: 'account_promo',
    category: 'account_promo',
    icon: UserRound,
    desc: 'Profile updates, KYC & login verification',
  },
  {
    name: 'Trust & Safety',
    key: 'safety_conduct',
    category: 'safety_conduct',
    icon: Shield,
    desc: 'Immediate threat & harassment triage',
  },
  {
    name: 'Tech Support',
    key: 'app_technical',
    category: 'app_technical',
    icon: Smartphone,
    desc: 'App crashes, bugs & checkout errors',
  },
  {
    name: 'Front-line Support',
    key: 'general_inquiry',
    category: 'general_inquiry',
    icon: Headphones,
    desc: 'General questions & promo guidance',
  },
  {
    name: 'Auto-close / Spam Filter',
    key: 'spam_irrelevant',
    category: 'spam_irrelevant',
    icon: Ban,
    desc: 'Automated bot filters & non-actionable',
  },
];

export const TEAM_ICONS = {
  'Payments & Refunds': CreditCard,
  'Ride Operations': CarFront,
  'Lost & Found': BriefcaseBusiness,
  'Food Operations': Utensils,
  'Delivery Operations': Bike,
  'Restaurant Quality': Utensils,
  'Account Services': UserRound,
  'Trust & Safety': Shield,
  'Tech Support': Smartphone,
  'Front-line Support': Headphones,
  'Auto-close / Spam Filter': Ban,
};

export function getTeamIcon(teamName) {
  return TEAM_ICONS[teamName] || BriefcaseBusiness;
}

/* Humanise a snake_case category name */
export function niceCategory(c) {
  if (!c || c === 'none') return 'None';
  return c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());
}

/* Detect language from text */
export function detectLanguage(text) {
  if (!text) return 'English';
  if (/[\u0D80-\u0DFF]/.test(text)) return 'Sinhala (සිංහල)';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'Tamil (தமிழ்)';
  const lower = text.toLowerCase();
  const singlishTokens = ['mage', 'eka', 'nisa', 'thiyenawa', 'salli', 'danna', 'nehe', 'wela', 'kottu', 'awe', 'pls', 'bro'];
  const tanglishTokens = ['aagala', 'varala', 'enna', 'panreenga', 'ila', 'romba', 'kedaikula', 'bro'];
  const words = lower.split(/\s+/);
  if (words.some((w) => singlishTokens.includes(w))) return 'Singlish (Sinhala-English Mix)';
  if (words.some((w) => tanglishTokens.includes(w))) return 'Tanglish (Tamil-English Mix)';
  return 'English';
}

/* Multilingual sample presets matching the design */
export const PRESETS = [
  {
    id: 'sinhala',
    languageCode: 'SI',
    title: 'Delivery delay (Sinhala)',
    tag: 'Delivery',
    channel: 'chat',
    subject: 'කෑම ඇනවුම තවම ලැබුනේ නැත',
    message: 'මගේ කෑම එක තවම ආවෙ නෑ, පැයක් ගියා. රයිඩර් කෝල් එක ආන්සර් කරන්නෙ නෑ. කරුණාකරලා ඉක්මනින් බලන්න.',
  },
  {
    id: 'tamil',
    languageCode: 'TA',
    title: 'Missing item (Tamil)',
    tag: 'Food Ops',
    channel: 'chat',
    subject: 'உணவு விடுபட்டுள்ளது',
    message: 'என் ஆர்டரில் ஜூස් பாக்கெட் விடுபட்டுள்ளது. ஹோட்டல் காரங்க சேர்க்க மறந்துட்டாங்க, உடனே ரீபண்ட் தாங்க.',
  },
  {
    id: 'singlish',
    languageCode: 'MIX',
    title: 'Payment query (Singlish)',
    tag: 'Payments',
    channel: 'email',
    subject: 'Double charge on card during checkout',
    message: 'Card eken 2 times charge wela thiyenne checkout eke glitch ekak nisa. Pls refund excess deduction asap bro.',
  },
  {
    id: 'english',
    languageCode: 'EN',
    title: 'Urgent safety (English)',
    tag: 'Trust & Safety',
    channel: 'call_transcript',
    subject: 'Driver verbal altercation',
    message: 'Driver was aggressive during ride dropoff, shouted at me and refused to move vehicle. Need urgent help.',
  },
];

export const CHANNELS = [
  { id: 'chat', label: 'In-App Chat', icon: MessageSquare },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'call_transcript', label: 'Call Note', icon: Headphones },
];
