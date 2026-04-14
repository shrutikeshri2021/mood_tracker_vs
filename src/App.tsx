import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { storage } from './services/storage';
import { calculateBurnout } from './services/burnoutEngine';
import { detectPatterns } from './services/patternDetector';
import { calculateBalance, getBalanceLabel } from './services/balanceScore';
import { forecastMood } from './services/moodForecast';
import { notificationService } from './services/notificationService';
import { systemSounds } from './services/systemSounds';
import type { MoodEntry, MoodType, JournalEntry, ScreenName, BurnoutResult, DetectedPattern, WeeklyReport } from './types';
import { CBTScreen, SafetyPlanScreen, GratitudeScreen, SleepTrackerScreen, GroundingScreen, MedicationScreen, SocialScreen, EnergyBudgetScreen, AffirmationScreen, PMRScreen, CalendarScreen, WorryTimeScreen, SelfCompassionScreen, EmergencyScreen, WellnessScoreScreen } from './features/ClinicalFeatures';
import { PHQ9Screen, GAD7Screen, CognitiveDistortionsScreen, BehavioralActivationScreen, HydrationScreen, SunlightScreen, DBTSkillsScreen, BoundariesScreen, SomaticPainScreen, DigitalWellbeingScreen, BehavioralExperimentScreen, ForgivenessScreen, SelfCareChecklistScreen, RelapsePlanScreen, MeaningExistentialScreen } from './features/DoctorPrescribed';
import { MindfulnessScreen, RecoveryJournalScreen, SoundTherapyScreen, DreamJournalScreen, MoodThermometerScreen, PeerSupportScreen, ValuesClarificationScreen, EmotionWheelScreen, MicroJoyScreen, ExerciseLogScreen, NatureTherapyScreen, LetterTherapyScreen, CompassionFatigueScreen, RecoveryGoalsScreen, WindDownScreen } from './features/AdvancedHealing';

// ─── Constants ───
const MOODS: { type: MoodType; emoji: string; label: string; color: string }[] = [
  { type: 'happy', emoji: '😊', label: 'Happy', color: '#FFD93D' },
  { type: 'calm', emoji: '😌', label: 'Calm', color: '#6BCB77' },
  { type: 'neutral', emoji: '😐', label: 'Neutral', color: '#4D96FF' },
  { type: 'anxious', emoji: '😟', label: 'Anxious', color: '#FF6B6B' },
  { type: 'sad', emoji: '😢', label: 'Sad', color: '#9B59B6' },
  { type: 'angry', emoji: '😤', label: 'Angry', color: '#E74C3C' },
  { type: 'tired', emoji: '😮‍💨', label: 'Tired', color: '#95A5A6' },
];

const TAGS = ['meeting', 'deadline', 'exercise', 'meditation', 'conflict', 'win', 'overtime', 'rest', 'caffeine', 'social', 'alone', 'creative', 'outdoors', 'travel'];

const JOURNAL_PROMPTS = [
  'What drained me today?',
  'What gave me energy?',
  'What am I grateful for right now?',
  'What boundary do I need to set?',
  'What can I let go of tonight?',
  'What went better than expected?',
  'What does my body need right now?',
  'What triggered my stress today?',
];

const COPING_SUGGESTIONS: Record<string, string[]> = {
  anxious: ['Try box breathing for 2 minutes 🫁', 'Write down 3 things you can control ✍️', 'Ground yourself with 5-4-3-2-1 senses 🌿'],
  stressed: ['Step away for a 5-minute walk 🚶', 'Do a quick body scan meditation 🧘', 'Write a brain dump in your journal 📝'],
  tired: ['Take a power rest — even 10 minutes help 😴', 'Hydrate and have a healthy snack 💧', 'Gentle stretching can recharge you 🤸'],
  sad: ['Reach out to someone you trust 💬', 'Write about what you\'re feeling ✍️', 'Be gentle with yourself today 💜'],
  angry: ['Take 10 slow deep breaths 🌬️', 'Write it out — don\'t hold it in 📝', 'Physical activity can help release tension 🏃'],
  default: ['Check in with yourself 🌱', 'A short journal entry can help 📝', 'Take 3 conscious breaths 🫁'],
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ─── Adaptive Theme ───
const ADAPTIVE_THEMES: Record<string, { bg: string; accent: string; glow: string }> = {
  default: { bg: 'linear-gradient(160deg, #fff8f9 0%, #f3e8ff 50%, #e0f7f5 100%)', accent: '#8a6cf0', glow: 'rgba(138,108,240,0.15)' },
  happy: { bg: 'linear-gradient(160deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)', accent: '#f59e0b', glow: 'rgba(245,158,11,0.12)' },
  calm: { bg: 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%)', accent: '#22c55e', glow: 'rgba(34,197,94,0.12)' },
  anxious: { bg: 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 50%, #f5d0fe 100%)', accent: '#a855f7', glow: 'rgba(168,85,247,0.12)' },
  sad: { bg: 'linear-gradient(160deg, #f5f3ff 0%, #ede9fe 50%, #ddd6fe 100%)', accent: '#7c3aed', glow: 'rgba(124,58,237,0.12)' },
  angry: { bg: 'linear-gradient(160deg, #fff1f2 0%, #ffe4e6 50%, #fecdd3 100%)', accent: '#e11d48', glow: 'rgba(225,29,72,0.08)' },
  tired: { bg: 'linear-gradient(160deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)', accent: '#64748b', glow: 'rgba(100,116,139,0.1)' },
};

// ─── Main App ───
export default function App() {
  const [screen, setScreen] = useState<ScreenName>('home');
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [profileName, setProfileName] = useState('');
  const [adaptiveTheme, setAdaptiveTheme] = useState('default');
  const [panicLocked, setPanicLocked] = useState(false);
  const [toast, setToast] = useState('');
  const refreshKey = useRef(0);

  // Load data
  useEffect(() => {
    setEntries(storage.getEntries());
    setJournals(storage.getJournals());
    const p = storage.getProfile();
    setProfileName(p.name);
    const savedTheme = storage.getAdaptiveTheme();
    if (savedTheme !== 'default') setAdaptiveTheme(savedTheme);
  }, []);

  useEffect(() => {
    return notificationService.startDailyReminderLoop((message) => {
      void systemSounds.playCompletion();
      setToast(`🔔 ${message}`);
      setTimeout(() => setToast(''), 2500);
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const refreshData = useCallback(() => {
    setEntries(storage.getEntries());
    setJournals(storage.getJournals());
    refreshKey.current++;
  }, []);

  // Adaptive UI
  const updateAdaptive = useCallback((mood: string) => {
    const theme = ADAPTIVE_THEMES[mood] ? mood : 'default';
    setAdaptiveTheme(theme);
    storage.saveAdaptiveTheme(theme);
  }, []);

  const theme = ADAPTIVE_THEMES[adaptiveTheme] || ADAPTIVE_THEMES.default;

  // Computed
  const burnout = useMemo(() => calculateBurnout(entries, journals), [entries, journals]);
  const patterns = useMemo(() => detectPatterns(entries), [entries]);
  const balanceScore = useMemo(() => calculateBalance(entries), [entries]);
  const balanceInfo = useMemo(() => getBalanceLabel(balanceScore), [balanceScore]);
  const forecast = useMemo(() => forecastMood(entries), [entries]);

  // Streak
  const streak = useMemo(() => {
    if (entries.length === 0) return 0;
    const sorted = entries.slice().sort((a, b) => b.timestamp - a.timestamp);
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toDateString();
      if (sorted.some(e => new Date(e.timestamp).toDateString() === dayStr)) count++;
      else if (i > 0) break;
    }
    return count;
  }, [entries]);

  // Panic Mode
  if (panicLocked) {
    return <PanicScreen onUnlock={() => setPanicLocked(false)} />;
  }

  const nav = (s: ScreenName) => setScreen(s);

  return (
    <div style={{ background: theme.bg, minHeight: '100vh', maxWidth: 430, margin: '0 auto', position: 'relative', paddingBottom: 90 }}>
      {/* Toast */}
      {toast && (
        <div className="animate-slideUp" style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: '#2e244c', color: '#fff', padding: '12px 24px', borderRadius: 16, fontSize: 14, fontWeight: 600, zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      {/* Screens */}
      <div className="animate-fadeInUp" key={screen}>
        {screen === 'home' && (
          <HomeScreen
            name={profileName} entries={entries} burnout={burnout} balanceScore={balanceScore}
            balanceInfo={balanceInfo} streak={streak} forecast={forecast} patterns={patterns}
            nav={nav} onPanic={() => setPanicLocked(true)}
          />
        )}
        {screen === 'advanced-pack-1' && (
          <AdvancedToolsSectionScreen
            title="Mindfulness & Recovery"
            subtitle="Calm practices and deeper reflection tools"
            nav={nav}
            items={[
              { icon: '🧘', label: 'Mindfulness MBSR', screen: 'mindfulness', desc: 'Guided sessions' },
              { icon: '📖', label: 'Recovery Journal', screen: 'recovery-journal', desc: 'Narrative therapy' },
              { icon: '🎵', label: 'Sound Therapy', screen: 'sound-therapy', desc: 'Binaural beats' },
              { icon: '🌙', label: 'Dream Journal', screen: 'dream-journal', desc: 'Subconscious insight' },
            ]}
          />
        )}
        {screen === 'advanced-pack-2' && (
          <AdvancedToolsSectionScreen
            title="Emotional Insight"
            subtitle="Understand patterns and emotional language"
            nav={nav}
            items={[
              { icon: '🌡️', label: 'Mood Thermometer', screen: 'mood-thermometer', desc: 'Visual check-in' },
              { icon: '🦋', label: 'Values (ACT)', screen: 'values', desc: 'Clarify what matters' },
              { icon: '🎨', label: 'Emotion Wheel', screen: 'emotion-wheel', desc: 'Name your feelings' },
              { icon: '✨', label: 'Micro Joy', screen: 'micro-joy', desc: 'Positive moments' },
            ]}
          />
        )}
        {screen === 'advanced-pack-3' && (
          <AdvancedToolsSectionScreen
            title="Support & Movement"
            subtitle="Social and body-based recovery supports"
            nav={nav}
            items={[
              { icon: '🤝', label: 'Peer Support', screen: 'peer-support', desc: 'Ask for help scripts' },
              { icon: '🏃', label: 'Exercise & Mood', screen: 'exercise-log', desc: 'Movement therapy' },
              { icon: '🌿', label: 'Nature Therapy', screen: 'nature-therapy', desc: 'Green prescriptions' },
              { icon: '💌', label: 'Letter Therapy', screen: 'letter-therapy', desc: 'Emotional release' },
            ]}
          />
        )}
        {screen === 'advanced-pack-4' && (
          <AdvancedToolsSectionScreen
            title="Focused Recovery Plans"
            subtitle="Targeted tools for structure and prevention"
            nav={nav}
            items={[
              { icon: '🫀', label: 'Compassion Fatigue', screen: 'compassion-fatigue', desc: 'For over-givers' },
              { icon: '🎯', label: 'Recovery Goals', screen: 'recovery-goals', desc: 'SMART healing plan' },
              { icon: '🌙', label: 'Wind-Down Ritual', screen: 'wind-down', desc: 'Pre-sleep protocol' },
            ]}
          />
        )}
        {screen === 'checkin' && (
          <CheckInScreen
            onSave={(e) => { storage.saveEntry(e); refreshData(); updateAdaptive(e.mood); showToast('✅ Check-in saved!'); nav('home'); }}
            onCancel={() => nav('home')}
          />
        )}
        {screen === 'journal' && (
          <JournalScreen
            journals={journals}
            onSave={(j) => { storage.saveJournal(j); refreshData(); showToast('📝 Journal saved!'); }}
            onDelete={(id) => { storage.deleteJournal(id); refreshData(); showToast('🗑️ Entry deleted'); }}
          />
        )}
        {screen === 'insights' && (
          <InsightsScreen entries={entries} patterns={patterns} burnout={burnout} balanceScore={balanceScore} balanceInfo={balanceInfo} nav={nav} />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            name={profileName} entries={entries} journals={journals} streak={streak}
            onNameChange={(n) => { setProfileName(n); const p = storage.getProfile(); p.name = n; storage.saveProfile(p); }}
            onClear={() => { storage.clearAll(); refreshData(); setProfileName(''); showToast('🗑️ All data cleared'); }}
            onExport={() => {
              const data = storage.exportAll();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `zenithme-backup-${new Date().toISOString().slice(0,10)}.json`;
              a.click(); URL.revokeObjectURL(url);
              showToast('📥 Data exported!');
            }}
            nav={nav}
          />
        )}
        {screen === 'burnout' && <BurnoutScreen burnout={burnout} entries={entries} nav={nav} />}
        {screen === 'patterns' && <PatternsScreen patterns={patterns} nav={nav} />}
        {screen === 'breathing' && <BreathingScreen onComplete={() => showToast('🫁 Session complete!')} nav={nav} />}
        {screen === 'report' && <ReportScreen entries={entries} journals={journals} nav={nav} showToast={showToast} />}
        {screen === 'achievements' && <AchievementsScreen entries={entries} journals={journals} nav={nav} />}
        {screen === 'panic-setup' && (
          <PanicSetupScreen
            onSave={(pin) => { storage.savePanicPin(pin); showToast('🔒 Panic PIN set!'); nav('profile'); }}
            nav={nav}
          />
        )}
        {/* ─── 15 New Clinical Features ─── */}
        {screen === 'cbt' && <CBTScreen nav={nav} showToast={showToast} />}
        {screen === 'safety-plan' && <SafetyPlanScreen nav={nav} showToast={showToast} />}
        {screen === 'gratitude' && <GratitudeScreen nav={nav} showToast={showToast} />}
        {screen === 'sleep-tracker' && <SleepTrackerScreen nav={nav} showToast={showToast} />}
        {screen === 'grounding' && <GroundingScreen nav={nav} showToast={showToast} />}
        {screen === 'medications' && <MedicationScreen nav={nav} showToast={showToast} />}
        {screen === 'social' && <SocialScreen nav={nav} showToast={showToast} />}
        {screen === 'energy-budget' && <EnergyBudgetScreen nav={nav} showToast={showToast} />}
        {screen === 'affirmations' && <AffirmationScreen nav={nav} showToast={showToast} />}
        {screen === 'pmr' && <PMRScreen nav={nav} showToast={showToast} />}
        {screen === 'calendar' && <CalendarScreen nav={nav} entries={entries} />}
        {screen === 'worry-time' && <WorryTimeScreen nav={nav} showToast={showToast} />}
        {screen === 'self-compassion' && <SelfCompassionScreen nav={nav} showToast={showToast} />}
        {screen === 'emergency' && <EmergencyScreen nav={nav} showToast={showToast} />}
        {screen === 'wellness-score' && <WellnessScoreScreen nav={nav} showToast={showToast} />}

        {/* ─── 15 Doctor Prescribed Features ─── */}
        {screen === 'phq9' && <PHQ9Screen onBack={() => nav('profile')} showToast={showToast} />}
        {screen === 'gad7' && <GAD7Screen onBack={() => nav('profile')} showToast={showToast} />}
        {screen === 'distortions' && <CognitiveDistortionsScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'activation' && <BehavioralActivationScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'hydration' && <HydrationScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'sunlight' && <SunlightScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'dbt' && <DBTSkillsScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'boundaries' && <BoundariesScreen onBack={() => nav('profile')} showToast={showToast} />}
        {screen === 'pain-map' && <SomaticPainScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'experiment' && <BehavioralExperimentScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'selfcare-checklist' && <SelfCareChecklistScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'relapse' && <RelapsePlanScreen onBack={() => nav('profile')} showToast={showToast} />}
        {screen === 'meaning' && <MeaningExistentialScreen onBack={() => nav('profile')} showToast={showToast} />}
        {screen === 'digital-limits' && <DigitalWellbeingScreen onBack={() => nav('home')} showToast={showToast} />}
        {screen === 'forgiveness' && <ForgivenessScreen onBack={() => nav('home')} showToast={showToast} />}

        {/* ─── 15 Advanced Healing Features ─── */}
        {screen === 'mindfulness' && <MindfulnessScreen nav={nav} showToast={showToast} />}
        {screen === 'recovery-journal' && <RecoveryJournalScreen nav={nav} showToast={showToast} />}
        {screen === 'sound-therapy' && <SoundTherapyScreen nav={nav} showToast={showToast} />}
        {screen === 'dream-journal' && <DreamJournalScreen nav={nav} showToast={showToast} />}
        {screen === 'mood-thermometer' && <MoodThermometerScreen nav={nav} showToast={showToast} />}
        {screen === 'peer-support' && <PeerSupportScreen nav={nav} showToast={showToast} />}
        {screen === 'values' && <ValuesClarificationScreen nav={nav} showToast={showToast} />}
        {screen === 'emotion-wheel' && <EmotionWheelScreen nav={nav} showToast={showToast} />}
        {screen === 'micro-joy' && <MicroJoyScreen nav={nav} showToast={showToast} />}
        {screen === 'exercise-log' && <ExerciseLogScreen nav={nav} showToast={showToast} />}
        {screen === 'nature-therapy' && <NatureTherapyScreen nav={nav} showToast={showToast} />}
        {screen === 'letter-therapy' && <LetterTherapyScreen nav={nav} showToast={showToast} />}
        {screen === 'compassion-fatigue' && <CompassionFatigueScreen nav={nav} showToast={showToast} />}
        {screen === 'recovery-goals' && <RecoveryGoalsScreen nav={nav} showToast={showToast} />}
        {screen === 'wind-down' && <WindDownScreen nav={nav} showToast={showToast} />}
      </div>

      {/* Bottom Nav */}
      {!['checkin', 'locked', 'grounding', 'pmr'].includes(screen) && (
        <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(0,0,0,0.06)', padding: '8px 0 env(safe-area-inset-bottom, 8px)', zIndex: 50, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
          {([
            { id: 'home', icon: '🏠', label: 'Home' },
            { id: 'journal', icon: '📝', label: 'Journal' },
            { id: 'checkin', icon: '➕', label: '' },
            { id: 'insights', icon: '📊', label: 'Insights' },
            { id: 'profile', icon: '👤', label: 'Profile' },
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => nav(item.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: item.id === 'checkin' ? 'linear-gradient(135deg, #8a6cf0, #6c4fd8)' : 'none',
                border: 'none', cursor: 'pointer', padding: item.id === 'checkin' ? '0' : '6px 12px',
                width: item.id === 'checkin' ? 52 : 'auto', height: item.id === 'checkin' ? 52 : 'auto',
                borderRadius: item.id === 'checkin' ? 26 : 0,
                boxShadow: item.id === 'checkin' ? '0 4px 20px rgba(138,108,240,0.4)' : 'none',
                marginTop: item.id === 'checkin' ? -20 : 0,
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: item.id === 'checkin' ? 24 : 22, filter: screen === item.id ? 'none' : 'grayscale(0.5) opacity(0.6)' }}>{item.icon}</span>
              {item.label && <span style={{ fontSize: 10, fontWeight: screen === item.id ? 700 : 500, color: screen === item.id ? '#8a6cf0' : '#999' }}>{item.label}</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── Card Component ───
function Card({ children, style, onClick, className = '' }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; className?: string }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(16px)', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.5)', boxShadow: '0 4px 24px rgba(101,70,143,0.08)',
        padding: 20, cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.2s, box-shadow 0.2s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Slider Component ───
function Slider({ label, emoji, value, onChange, colorFrom, colorTo }: { label: string; emoji: string; value: number; onChange: (v: number) => void; colorFrom: string; colorTo: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#2e244c' }}>{emoji} {label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#8a6cf0' }}>{value}/10</span>
      </div>
      <input
        type="range" min={1} max={10} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', height: 8, borderRadius: 4, appearance: 'none', background: `linear-gradient(90deg, ${colorFrom}, ${colorTo})`, outline: 'none', cursor: 'pointer' }}
      />
    </div>
  );
}

// ─── Home Screen ───
function HomeScreen({ name, entries, burnout, balanceScore, balanceInfo, streak, forecast, patterns, nav, onPanic }: {
    name: string; entries: MoodEntry[]; burnout: BurnoutResult; balanceScore: number;
    balanceInfo: { label: string; emoji: string; color: string }; streak: number;
    forecast: ReturnType<typeof forecastMood>; patterns: DetectedPattern[];
    nav: (s: ScreenName) => void; onPanic: () => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const todayEntry = entries.find(e => new Date(e.timestamp).toDateString() === new Date().toDateString());
  const latestMood = entries.length > 0 ? entries.sort((a, b) => b.timestamp - a.timestamp)[0] : null;
  const [openAdvancedGroup, setOpenAdvancedGroup] = useState<string | null>(null);

  const advancedGroups: {
    icon: string;
    title: string;
    desc: string;
    key: string;
    items: { icon: string; label: string; desc: string; screen: ScreenName }[];
  }[] = [
    {
      icon: '🧘',
      title: 'Mindfulness & Recovery',
      desc: 'MBSR, journaling, sound, dreams',
      key: 'mindfulness-recovery',
      items: [
        { icon: '🧘', label: 'Mindfulness MBSR', desc: 'Guided sessions', screen: 'mindfulness' },
        { icon: '📖', label: 'Recovery Journal', desc: 'Narrative therapy', screen: 'recovery-journal' },
        { icon: '🎵', label: 'Sound Therapy', desc: 'Binaural beats', screen: 'sound-therapy' },
        { icon: '🌙', label: 'Dream Journal', desc: 'Subconscious insight', screen: 'dream-journal' },
      ],
    },
    {
      icon: '🌡️',
      title: 'Emotional Insight',
      desc: 'Mood tools, ACT values, emotion wheel',
      key: 'emotional-insight',
      items: [
        { icon: '🌡️', label: 'Mood Thermometer', desc: 'Visual check-in', screen: 'mood-thermometer' },
        { icon: '🦋', label: 'Values (ACT)', desc: 'Clarify what matters', screen: 'values' },
        { icon: '🎨', label: 'Emotion Wheel', desc: 'Name your feelings', screen: 'emotion-wheel' },
        { icon: '✨', label: 'Micro Joy', desc: 'Positive moments', screen: 'micro-joy' },
      ],
    },
    {
      icon: '🤝',
      title: 'Support & Movement',
      desc: 'Peer support, exercise, nature, letters',
      key: 'support-movement',
      items: [
        { icon: '🤝', label: 'Peer Support', desc: 'Ask for help scripts', screen: 'peer-support' },
        { icon: '🏃', label: 'Exercise & Mood', desc: 'Movement therapy', screen: 'exercise-log' },
        { icon: '🌿', label: 'Nature Therapy', desc: 'Green prescriptions', screen: 'nature-therapy' },
        { icon: '💌', label: 'Letter Therapy', desc: 'Emotional release', screen: 'letter-therapy' },
      ],
    },
    {
      icon: '🎯',
      title: 'Focused Recovery Plans',
      desc: 'Compassion fatigue, goals, wind-down',
      key: 'focused-recovery',
      items: [
        { icon: '🫀', label: 'Compassion Fatigue', desc: 'For over-givers', screen: 'compassion-fatigue' },
        { icon: '🎯', label: 'Recovery Goals', desc: 'SMART healing plan', screen: 'recovery-goals' },
        { icon: '🌙', label: 'Wind-Down Ritual', desc: 'Pre-sleep protocol', screen: 'wind-down' },
      ],
    },
  ];

  // Smart coping
  const copingKey = latestMood ? (latestMood.stress > 6 ? 'stressed' : latestMood.mood === 'happy' || latestMood.mood === 'calm' ? 'default' : latestMood.mood) : 'default';
  const copings = COPING_SUGGESTIONS[copingKey] || COPING_SUGGESTIONS.default;

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Header */}
      <div className="animate-fadeInUp" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 14, color: '#5C4D76', margin: 0 }}>{today}</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#2e244c', margin: '4px 0 0' }}>
            {greeting}{name ? `, ${name}` : ''} 👋
          </h1>
        </div>
        <button onClick={onPanic} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 8 }} title="Panic Mode">🔒</button>
      </div>

      {/* Balance Score */}
      <Card className="animate-fadeInUp delay-100" style={{ marginBottom: 16, background: `linear-gradient(135deg, ${balanceInfo.color}15, ${balanceInfo.color}08)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: `conic-gradient(${balanceInfo.color} ${balanceScore * 3.6}deg, #f0f0f0 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: balanceInfo.color }}>
              {balanceScore}%
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#5C4D76', margin: 0, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 1 }}>Emotional Balance</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#2e244c', margin: '4px 0 0' }}>{balanceInfo.emoji} {balanceInfo.label}</p>
            {entries.length === 0 && <p style={{ fontSize: 12, color: '#999', margin: '4px 0 0' }}>Log your first check-in to see your score</p>}
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="animate-fadeInUp delay-200" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card onClick={() => nav('checkin')} style={{ padding: 16, textAlign: 'center', background: 'linear-gradient(135deg, #eadbff, #d5c4f7)' }}>
          <span style={{ fontSize: 28 }}>✨</span>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2e244c', margin: '8px 0 0' }}>{todayEntry ? 'Check In Again' : 'Daily Check-In'}</p>
        </Card>
        <Card onClick={() => nav('breathing')} style={{ padding: 16, textAlign: 'center', background: 'linear-gradient(135deg, #cbf3e5, #a8e6cf)' }}>
          <span style={{ fontSize: 28 }}>🫁</span>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2e244c', margin: '8px 0 0' }}>Breathe</p>
        </Card>
      </div>

      {/* Streak & Burnout Row */}
      <div className="animate-fadeInUp delay-200" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Card style={{ padding: 16 }}>
          <p style={{ fontSize: 28, margin: 0 }}>🔥</p>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '4px 0 0' }}>{streak}</p>
          <p style={{ fontSize: 11, color: '#5C4D76', margin: '2px 0 0' }}>Day Streak</p>
        </Card>
        <Card onClick={() => nav('burnout')} style={{ padding: 16, cursor: 'pointer' }}>
          <p style={{ fontSize: 28, margin: 0 }}>
            {burnout.level === 'low' ? '🟢' : burnout.level === 'moderate' ? '🟡' : burnout.level === 'high' ? '🟠' : '🔴'}
          </p>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '4px 0 0' }}>{burnout.score}</p>
          <p style={{ fontSize: 11, color: '#5C4D76', margin: '2px 0 0' }}>Burnout Risk</p>
        </Card>
      </div>

      {/* Mood Forecast */}
      {forecast && (
        <Card className="animate-fadeInUp delay-300" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #ffd5c720, #eadbff20)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>🔮 Tomorrow's Forecast</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 36 }}>{MOODS.find(m => m.type === forecast.predicted)?.emoji || '🌤️'}</span>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#2e244c', margin: 0 }}>{MOODS.find(m => m.type === forecast.predicted)?.label || 'Unknown'}</p>
              <p style={{ fontSize: 12, color: '#5C4D76', margin: '2px 0 0' }}>{forecast.reason}</p>
              <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>{forecast.confidence}% confidence</p>
            </div>
          </div>
        </Card>
      )}

      {/* Smart Coping */}
      <Card className="animate-fadeInUp delay-300" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🧘 Personalized Suggestions</p>
        {copings.map((c, i) => (
          <div key={i} style={{ padding: '10px 14px', background: '#f8f5ff', borderRadius: 12, marginBottom: i < copings.length - 1 ? 8 : 0, fontSize: 13, color: '#2e244c', fontWeight: 500 }}>
            {c}
          </div>
        ))}
      </Card>

      {/* Patterns Preview */}
      {patterns.length > 0 && (
        <Card className="animate-fadeInUp delay-400" onClick={() => nav('patterns')} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>📊 Detected Patterns</p>
          {patterns.slice(0, 2).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#2e244c', margin: 0 }}>{p.title}</p>
                <p style={{ fontSize: 11, color: '#5C4D76', margin: 0 }}>{p.description.slice(0, 60)}…</p>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: '#8a6cf0', fontWeight: 600, margin: '8px 0 0' }}>See all patterns →</p>
        </Card>
      )}

      {/* Quick Links */}
      <div className="animate-fadeInUp delay-400" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { icon: '📋', label: 'Report', screen: 'report' as ScreenName },
          { icon: '🏆', label: 'Badges', screen: 'achievements' as ScreenName },
          { icon: '📊', label: 'Patterns', screen: 'patterns' as ScreenName },
        ].map(l => (
          <Card key={l.label} onClick={() => nav(l.screen)} style={{ padding: 14, textAlign: 'center' }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#2e244c', margin: '6px 0 0' }}>{l.label}</p>
          </Card>
        ))}
      </div>

      {/* Clinical Recovery Tools */}
      <Card className="animate-fadeInUp delay-400" style={{ marginBottom: 16, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🏥 Recovery & Clinical Tools</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { icon: '🧠', label: 'CBT Records', screen: 'cbt' as ScreenName, color: '#8a6cf0' },
            { icon: '🌿', label: 'Grounding', screen: 'grounding' as ScreenName, color: '#6BCB77' },
            { icon: '🧘', label: 'PMR', screen: 'pmr' as ScreenName, color: '#4D96FF' },
            { icon: '💚', label: 'Self-Compassion', screen: 'self-compassion' as ScreenName, color: '#6BCB77' },
            { icon: '📋', label: 'Worry Time', screen: 'worry-time' as ScreenName, color: '#FF9800' },
            { icon: '🛡️', label: 'Safety Plan', screen: 'safety-plan' as ScreenName, color: '#E91E63' },
          ].map(t => (
            <div key={t.label} onClick={() => nav(t.screen)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, cursor: 'pointer',
              background: `${t.color}08`, border: `1px solid ${t.color}20`, transition: 'transform 0.2s',
            }}>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2e244c' }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Wellness & Lifestyle */}
      <Card className="animate-fadeInUp delay-400" style={{ marginBottom: 16, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🌸 Wellness & Lifestyle</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { icon: '🙏', label: 'Gratitude', screen: 'gratitude' as ScreenName },
            { icon: '🌙', label: 'Sleep', screen: 'sleep-tracker' as ScreenName },
            { icon: '💊', label: 'Meds', screen: 'medications' as ScreenName },
            { icon: '👥', label: 'Social', screen: 'social' as ScreenName },
            { icon: '🥄', label: 'Energy', screen: 'energy-budget' as ScreenName },
            { icon: '💜', label: 'Affirm', screen: 'affirmations' as ScreenName },
            { icon: '📅', label: 'Calendar', screen: 'calendar' as ScreenName },
            { icon: '✨', label: 'Wellness', screen: 'wellness-score' as ScreenName },
            { icon: '📞', label: 'Emergency', screen: 'emergency' as ScreenName },
          ].map(t => (
            <div key={t.label} onClick={() => nav(t.screen)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 6px',
              borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.04)',
            }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#2e244c' }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Advanced Healing Tools */}
      <Card className="animate-fadeInUp delay-400" style={{ marginBottom: 16, padding: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🌟 Advanced Healing Tools</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {advancedGroups.map((group) => {
            const isOpen = openAdvancedGroup === group.key;
            return (
              <div
                key={group.key}
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(92,77,118,0.12)',
                  background: isOpen
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(234,219,255,0.42))'
                    : 'linear-gradient(135deg, rgba(255,255,255,0.78), rgba(245,240,255,0.28))',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setOpenAdvancedGroup((prev) => (prev === group.key ? null : group.key))}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 16, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {group.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#2e244c' }}>{group.title}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#5C4D76', lineHeight: 1.4 }}>{group.desc}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: '#8a6cf0', fontWeight: 800, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
                    {group.items.map((item) => (
                      <button
                        key={item.screen}
                        onClick={() => nav(item.screen)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: '1px solid rgba(92,77,118,0.10)',
                          borderRadius: 14,
                          background: 'rgba(255,255,255,0.88)',
                          padding: '12px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#2e244c' }}>{item.label}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#5C4D76' }}>{item.desc}</p>
                          </div>
                        </div>
                        <span style={{ fontSize: 13, color: '#8a6cf0', fontWeight: 800, flexShrink: 0 }}>Open →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Disclaimer */}
      <p style={{ fontSize: 11, color: '#999', textAlign: 'center', padding: '8px 20px', lineHeight: 1.5 }}>
        ⚕️ ZenithMe is a self-care tool, not a medical service. If you're in crisis, please contact a professional.
      </p>
    </div>
  );
}

function AdvancedToolsSectionScreen({
  title,
  subtitle,
  items,
  nav,
}: {
  title: string;
  subtitle: string;
  items: { icon: string; label: string; desc: string; screen: ScreenName }[];
  nav: (s: ScreenName) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<ScreenName>(items[0]?.screen ?? 'home');
  const selectedItem = items.find((item) => item.screen === selectedScreen) ?? items[0];

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600 }}>← Home</button>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2e244c', margin: 0 }}>{title}</h2>
        <div style={{ width: 64 }} />
      </div>

      <Card style={{ marginBottom: 14, padding: 14, background: 'linear-gradient(135deg, rgba(255,255,255,0.82), rgba(234,219,255,0.28))' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#5C4D76' }}>{subtitle}</p>
      </Card>

      <Card style={{ marginBottom: 14, padding: 14, background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(245,240,255,0.78))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5C4D76', textTransform: 'uppercase', letterSpacing: 1 }}>Choose a tool</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#8A7A9C' }}>Open the dropdown to view tools in this tab</p>
          </div>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={{
              border: '1px solid rgba(92,77,118,0.14)',
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 14,
              padding: '10px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: '#2e244c',
              cursor: 'pointer',
              minWidth: 120,
            }}
          >
            {menuOpen ? 'Hide Tools ▲' : 'Show Tools ▼'}
          </button>
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            textAlign: 'left',
            padding: '14px 12px',
            borderRadius: 16,
            border: '1px solid rgba(92,77,118,0.14)',
            background: 'rgba(255,255,255,0.86)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: '#f3ecff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {selectedItem?.icon}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#2e244c' }}>{selectedItem?.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#5C4D76' }}>{selectedItem?.desc}</p>
            </div>
          </div>
          <span style={{ fontSize: 18, color: '#8a6cf0' }}>{menuOpen ? '▲' : '▼'}</span>
        </button>

        {menuOpen && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setSelectedScreen(item.screen);
                  setMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 12px',
                  borderRadius: 14,
                  border: item.screen === selectedScreen ? '1px solid rgba(138,108,240,0.38)' : '1px solid rgba(92,77,118,0.10)',
                  background: item.screen === selectedScreen ? 'rgba(138,108,240,0.10)' : 'rgba(255,255,255,0.72)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#2e244c' }}>{item.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#5C4D76' }}>{item.desc}</p>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#8a6cf0', fontWeight: 700 }}>{item.screen === selectedScreen ? 'Selected' : 'Pick'}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedItem && (
        <Card style={{ padding: 16, background: 'linear-gradient(135deg, rgba(255,255,255,0.88), rgba(203,243,229,0.28))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 16, background: '#f3ecff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {selectedItem.icon}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#2e244c' }}>{selectedItem.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5C4D76', lineHeight: 1.5 }}>{selectedItem.desc}</p>
            </div>
          </div>
          <button
            onClick={() => nav(selectedItem.screen)}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 16,
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #8a6cf0, #6c4fd8)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 10px 24px rgba(138,108,240,0.22)',
            }}
          >
            Open {selectedItem.label} →
          </button>
        </Card>
      )}
    </div>
  );
}

// ─── Check-In Screen ───
function CheckInScreen({ onSave, onCancel }: { onSave: (e: MoodEntry) => void; onCancel: () => void }) {
  const [mood, setMood] = useState<MoodType | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [stress, setStress] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [sleep, setSleep] = useState(5);
  const [workload, setWorkload] = useState(5);
  const [focus, setFocus] = useState(5);
  const [social, setSocial] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [triggers, setTriggers] = useState<string[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening'>(() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  });
  const [step, setStep] = useState(0);

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSave = () => {
    if (!mood) return;
    onSave({
      id: uid(), mood, moodIntensity: intensity, stress, energy, sleep, workload, focus, socialBattery: social,
      tags, notes, timeOfDay, triggers, timestamp: Date.now(),
    });
  };

  return (
    <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2e244c', margin: 0 }}>Check-In</h2>
        <div style={{ width: 60 }} />
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= i ? '#8a6cf0' : '#e0d8f0', transition: 'background 0.3s' }} />
        ))}
      </div>

      {step === 0 && (
        <div className="animate-fadeInUp">
          <h3 style={{ fontSize: 22, fontWeight: 800, color: '#2e244c', margin: '0 0 8px', textAlign: 'center' }}>How are you feeling? 🌸</h3>
          <p style={{ fontSize: 14, color: '#5C4D76', textAlign: 'center', margin: '0 0 24px' }}>Select the emotion closest to how you feel right now</p>

          {/* Time of Day */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
            {(['morning', 'afternoon', 'evening'] as const).map(t => (
              <button key={t} onClick={() => setTimeOfDay(t)} style={{
                padding: '8px 16px', borderRadius: 20, border: timeOfDay === t ? '2px solid #8a6cf0' : '1px solid #e0d8f0',
                background: timeOfDay === t ? '#f3eeff' : '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#2e244c',
              }}>
                {t === 'morning' ? '🌅' : t === 'afternoon' ? '☀️' : '🌙'} {t}
              </button>
            ))}
          </div>

          {/* Moods */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {MOODS.map(m => (
              <button
                key={m.type} onClick={() => setMood(m.type)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 14,
                  borderRadius: 16, border: mood === m.type ? `2px solid ${m.color}` : '1px solid #f0ecf7',
                  background: mood === m.type ? `${m.color}15` : '#fff', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 32 }}>{m.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#2e244c' }}>{m.label}</span>
              </button>
            ))}
          </div>

          {mood && (
            <div className="animate-scaleIn">
              <Slider label="Intensity" emoji="💫" value={intensity} onChange={setIntensity} colorFrom="#eadbff" colorTo="#8a6cf0" />
              <button onClick={() => setStep(1)} style={{
                width: '100%', padding: 16, borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #8a6cf0, #6c4fd8)', color: '#fff', boxShadow: '0 4px 20px rgba(138,108,240,0.3)',
              }}>
                Continue →
              </button>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="animate-fadeInUp">
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#2e244c', margin: '0 0 20px' }}>Rate your levels 📊</h3>
          <Slider label="Stress" emoji="😰" value={stress} onChange={setStress} colorFrom="#cbf3e5" colorTo="#FF6B6B" />
          <Slider label="Energy" emoji="⚡" value={energy} onChange={setEnergy} colorFrom="#ffd5c7" colorTo="#FFD93D" />
          <Slider label="Sleep Quality" emoji="😴" value={sleep} onChange={setSleep} colorFrom="#eadbff" colorTo="#6BCB77" />
          <Slider label="Workload" emoji="📋" value={workload} onChange={setWorkload} colorFrom="#cbf3e5" colorTo="#E74C3C" />
          <Slider label="Focus" emoji="🎯" value={focus} onChange={setFocus} colorFrom="#ffd5c7" colorTo="#4D96FF" />
          <Slider label="Social Battery" emoji="👥" value={social} onChange={setSocial} colorFrom="#eadbff" colorTo="#FFD93D" />
          <button onClick={() => setStep(2)} style={{
            width: '100%', padding: 16, borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            background: 'linear-gradient(135deg, #8a6cf0, #6c4fd8)', color: '#fff', marginTop: 8,
          }}>
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-fadeInUp">
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#2e244c', margin: '0 0 8px' }}>What's going on? 🏷️</h3>
          <p style={{ fontSize: 13, color: '#5C4D76', margin: '0 0 16px' }}>Select any tags that apply (optional)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {TAGS.map(t => (
              <button key={t} onClick={() => toggleTag(t)} style={{
                padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: tags.includes(t) ? '2px solid #8a6cf0' : '1px solid #e0d8f0',
                background: tags.includes(t) ? '#f3eeff' : '#fff', color: '#2e244c',
              }}>
                {t}
              </button>
            ))}
          </div>

          <h4 style={{ fontSize: 14, fontWeight: 700, color: '#2e244c', margin: '0 0 8px' }}>💭 What caused this mood?</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {['work pressure', 'relationship', 'health', 'finances', 'self-doubt', 'positive news', 'achievement', 'nature'].map(t => (
              <button key={t} onClick={() => setTriggers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} style={{
                padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: triggers.includes(t) ? '2px solid #FF6B6B' : '1px solid #e0d8f0',
                background: triggers.includes(t) ? '#fff0f0' : '#fff', color: '#2e244c',
              }}>
                {t}
              </button>
            ))}
          </div>

          <textarea
            placeholder="Add a note about how you're feeling... (optional)"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: 14, borderRadius: 14, border: '1px solid #e0d8f0', fontSize: 14,
              resize: 'none', outline: 'none', background: '#faf8ff', marginBottom: 20, boxSizing: 'border-box',
            }}
          />

          <button onClick={handleSave} style={{
            width: '100%', padding: 16, borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            background: 'linear-gradient(135deg, #6BCB77, #4CAF50)', color: '#fff', boxShadow: '0 4px 20px rgba(76,175,80,0.3)',
          }}>
            ✨ Save Check-In
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Journal Screen ───
function JournalScreen({ journals, onSave, onDelete }: { journals: JournalEntry[]; onSave: (j: JournalEntry) => void; onDelete: (id: string) => void }) {
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isVoice, setIsVoice] = useState(false);
  const [voiceEmotion, setVoiceEmotion] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Voice not supported in this browser'); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (ev: any) => {
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setContent(t);
      // Simple emotion detection from keywords
      const lower = t.toLowerCase();
      if (/angry|frustrated|furious|hate/.test(lower)) setVoiceEmotion('angry 😤');
      else if (/sad|crying|depressed|lonely/.test(lower)) setVoiceEmotion('sad 😢');
      else if (/happy|joy|great|wonderful|amazing/.test(lower)) setVoiceEmotion('happy 😊');
      else if (/anxious|worried|nervous|scared/.test(lower)) setVoiceEmotion('anxious 😟');
      else if (/calm|peaceful|relaxed|serene/.test(lower)) setVoiceEmotion('calm 😌');
      else if (/tired|exhausted|drained/.test(lower)) setVoiceEmotion('tired 😮‍💨');
      else setVoiceEmotion('');
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
    setIsVoice(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({
      id: uid(), title: title || (prompt || 'Free Write'), content, prompt,
      tags: [], isFavorite: false, isVoice, voiceEmotion,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    setWriting(false); setTitle(''); setContent(''); setPrompt(''); setIsVoice(false); setVoiceEmotion('');
  };

  const sorted = journals.slice().sort((a, b) => b.createdAt - a.createdAt);

  if (writing) {
    return (
      <div style={{ padding: '20px 16px', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button onClick={() => setWriting(false)} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#2e244c', margin: 0 }}>✍️ Write</h2>
          <button onClick={handleSave} style={{ background: '#8a6cf0', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        </div>

        {prompt && (
          <Card style={{ marginBottom: 16, background: '#f8f5ff', padding: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#8a6cf0', margin: 0 }}>💡 {prompt}</p>
          </Card>
        )}

        <input
          placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)}
          style={{ width: '100%', padding: 14, borderRadius: 14, border: '1px solid #e0d8f0', fontSize: 16, fontWeight: 600, marginBottom: 12, background: '#faf8ff', outline: 'none', boxSizing: 'border-box' }}
        />

        <textarea
          placeholder="Write your thoughts here..." value={content} onChange={e => setContent(e.target.value)}
          rows={10} autoFocus
          style={{ width: '100%', padding: 14, borderRadius: 14, border: '1px solid #e0d8f0', fontSize: 15, lineHeight: 1.7, resize: 'none', outline: 'none', background: '#faf8ff', boxSizing: 'border-box' }}
        />

        {/* Voice */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={isListening ? stopVoice : startVoice}
            style={{
              flex: 1, padding: 14, borderRadius: 14, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: isListening ? '#FF6B6B' : '#f3eeff', color: isListening ? '#fff' : '#8a6cf0',
            }}
          >
            {isListening ? '⏹️ Stop Recording' : '🎤 Voice Journal'}
          </button>
        </div>

        {voiceEmotion && (
          <Card style={{ marginTop: 12, padding: 12, background: '#fff0f7' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#2e244c', margin: 0 }}>🎭 Detected emotion: <span style={{ color: '#8a6cf0' }}>{voiceEmotion}</span></p>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 8px' }}>📝 Journal</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 20px' }}>Your private reflection space</p>

      {/* Prompts */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
        {JOURNAL_PROMPTS.map(p => (
          <button key={p} onClick={() => { setPrompt(p); setWriting(true); }} style={{
            padding: '10px 16px', borderRadius: 20, border: '1px solid #e0d8f0', background: '#faf8ff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', color: '#2e244c', flexShrink: 0,
          }}>
            💡 {p}
          </button>
        ))}
      </div>

      {/* New Entry */}
      <button onClick={() => { setPrompt(''); setWriting(true); }} style={{
        width: '100%', padding: 16, borderRadius: 16, border: '2px dashed #e0d8f0', background: '#faf8ff',
        fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#8a6cf0', marginBottom: 24,
      }}>
        ✨ Start Writing
      </button>

      {/* Entries */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ fontSize: 48 }}>📝</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#2e244c', margin: '12px 0 4px' }}>No entries yet</p>
          <p style={{ fontSize: 13, color: '#5C4D76' }}>Start with a prompt above or free write ✨</p>
        </div>
      ) : (
        sorted.map(j => (
          <Card key={j.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  {j.isVoice && <span style={{ fontSize: 14 }}>🎤</span>}
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#2e244c', margin: 0 }}>{j.title}</p>
                </div>
                <p style={{ fontSize: 12, color: '#5C4D76', margin: '0 0 6px' }}>
                  {new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.5 }}>{j.content.slice(0, 120)}{j.content.length > 120 ? '…' : ''}</p>
                {j.voiceEmotion && <p style={{ fontSize: 11, color: '#8a6cf0', marginTop: 4 }}>🎭 {j.voiceEmotion}</p>}
              </div>
              <button onClick={() => onDelete(j.id)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: 4, color: '#ccc' }}>🗑️</button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Insights Screen ───
function InsightsScreen({ entries, patterns, burnout, balanceScore, balanceInfo, nav }: {
  entries: MoodEntry[]; patterns: DetectedPattern[];
  burnout: BurnoutResult; balanceScore: number; balanceInfo: { label: string; emoji: string; color: string }; nav: (s: ScreenName) => void;
}) {
  const last7 = entries.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 7);
  const avgStress = last7.length > 0 ? (last7.reduce((a, e) => a + e.stress, 0) / last7.length).toFixed(1) : '0';
  const avgEnergy = last7.length > 0 ? (last7.reduce((a, e) => a + e.energy, 0) / last7.length).toFixed(1) : '0';
  const avgSleep = last7.length > 0 ? (last7.reduce((a, e) => a + e.sleep, 0) / last7.length).toFixed(1) : '0';

  // Mood distribution
  const moodCounts: Record<string, number> = {};
  last7.forEach(e => { moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1; });

  // All tags frequency
  const tagCounts: Record<string, number> = {};
  entries.forEach(e => e.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Trigger frequency
  const triggerCounts: Record<string, number> = {};
  entries.forEach(e => e.triggers?.forEach(t => { triggerCounts[t] = (triggerCounts[t] || 0) + 1; }));
  const topTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ padding: '20px 16px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>📊 Insights</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 20px' }}>Your wellness at a glance</p>

      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 56 }}>📊</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#2e244c', margin: '16px 0 4px' }}>No data yet</p>
          <p style={{ fontSize: 14, color: '#5C4D76' }}>Complete your first check-in to see insights ✨</p>
        </div>
      ) : (
        <>
          {/* Averages */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Stress', value: avgStress, emoji: '😰', color: '#FF6B6B' },
              { label: 'Energy', value: avgEnergy, emoji: '⚡', color: '#FFD93D' },
              { label: 'Sleep', value: avgSleep, emoji: '😴', color: '#6BCB77' },
            ].map(m => (
              <Card key={m.label} style={{ padding: 14, textAlign: 'center' }}>
                <span style={{ fontSize: 22 }}>{m.emoji}</span>
                <p style={{ fontSize: 22, fontWeight: 800, color: m.color, margin: '4px 0 0' }}>{m.value}</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#5C4D76', margin: '2px 0 0', textTransform: 'uppercase' }}>{m.label}</p>
              </Card>
            ))}
          </div>

          {/* Balance & Burnout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Card style={{ padding: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 28, margin: 0 }}>{balanceInfo.emoji}</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: balanceInfo.color, margin: '4px 0 0' }}>{balanceScore}%</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#5C4D76' }}>Balance</p>
            </Card>
            <Card onClick={() => nav('burnout')} style={{ padding: 16, textAlign: 'center', cursor: 'pointer' }}>
              <p style={{ fontSize: 28, margin: 0 }}>{burnout.level === 'low' ? '🟢' : burnout.level === 'moderate' ? '🟡' : '🟠'}</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '4px 0 0' }}>{burnout.score}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#5C4D76' }}>Burnout</p>
            </Card>
          </div>

          {/* Mood Distribution */}
          <Card style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>Mood Distribution (7 days)</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {MOODS.filter(m => moodCounts[m.type]).map(m => (
                <div key={m.type} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: `${m.color}15`, borderRadius: 12 }}>
                  <span style={{ fontSize: 16 }}>{m.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2e244c' }}>{moodCounts[m.type]}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Top Tags */}
          {topTags.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🏷️ Top Tags</p>
              {topTags.map(([tag, count]) => (
                <div key={tag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f0ff' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2e244c' }}>{tag}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: Math.min(count * 20, 100), height: 6, borderRadius: 3, background: '#8a6cf0' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6cf0', minWidth: 20, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Trigger Analysis */}
          {topTriggers.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>🔍 Trigger Analysis</p>
              {topTriggers.map(([trigger, count]) => (
                <div key={trigger} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f0ff' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2e244c' }}>{trigger}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#FF6B6B', background: '#fff0f0', padding: '2px 10px', borderRadius: 10 }}>{count}×</span>
                </div>
              ))}
            </Card>
          )}

          {/* Patterns */}
          {patterns.length > 0 && (
            <Card onClick={() => nav('patterns')} style={{ marginBottom: 16, cursor: 'pointer' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>📊 Patterns</p>
              {patterns.slice(0, 3).map(p => (
                <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f0ff' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#2e244c', margin: 0 }}>{p.emoji} {p.title}</p>
                  <p style={{ fontSize: 11, color: '#5C4D76', margin: '2px 0 0' }}>{p.description.slice(0, 80)}</p>
                </div>
              ))}
              <p style={{ fontSize: 12, color: '#8a6cf0', fontWeight: 600, margin: '8px 0 0' }}>View all →</p>
            </Card>
          )}

          {/* Burnout Timeline */}
          <Card style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 1 }}>📈 Burnout Timeline</p>
            <BurnoutTimeline entries={entries} />
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Burnout Timeline ───
function BurnoutTimeline({ entries }: { entries: MoodEntry[] }) {
  const sorted = entries.slice().sort((a, b) => a.timestamp - b.timestamp).slice(-14);
  if (sorted.length < 2) return <p style={{ fontSize: 12, color: '#999', margin: 0 }}>Need more data to show timeline</p>;

  const phases = sorted.map(e => {
    const score = (e.stress * 0.4 + (10 - e.energy) * 0.3 + (10 - e.sleep) * 0.3);
    if (score <= 3) return { label: 'Calm', color: '#6BCB77', emoji: '🌿' };
    if (score <= 5) return { label: 'Building', color: '#FFD93D', emoji: '⚡' };
    if (score <= 7) return { label: 'Stress', color: '#FF9800', emoji: '🔥' };
    return { label: 'Burnout', color: '#E74C3C', emoji: '🔴' };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {phases.map((p, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10 }}>{p.emoji}</span>
          <div style={{
            width: '100%', borderRadius: 4,
            height: p.label === 'Calm' ? 20 : p.label === 'Building' ? 40 : p.label === 'Stress' ? 60 : 80,
            background: `linear-gradient(to top, ${p.color}, ${p.color}80)`,
            transition: 'height 0.5s',
          }} />
          <span style={{ fontSize: 8, color: '#999' }}>{new Date(sorted[i].timestamp).toLocaleDateString('en-US', { day: 'numeric' })}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Burnout Screen ───
function BurnoutScreen({ burnout, entries, nav }: { burnout: BurnoutResult; entries: MoodEntry[]; nav: (s: ScreenName) => void }) {
  const levelColors = { low: '#4CAF50', moderate: '#FFC107', high: '#FF9800', critical: '#E74C3C' };
  const color = levelColors[burnout.level];

  return (
    <div style={{ padding: '20px 16px' }}>
      <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>

      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 24px', textAlign: 'center' }}>🧠 Burnout Prediction</h2>

      {entries.length < 3 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 56 }}>🧠</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#2e244c', margin: '16px 0 4px' }}>Not enough data</p>
          <p style={{ fontSize: 14, color: '#5C4D76' }}>Log 3+ check-ins to activate burnout prediction</p>
        </div>
      ) : (
        <>
          {/* Gauge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', width: 180, height: 180 }}>
              <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="#f0ecf7" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
                  strokeDasharray="314" strokeDashoffset={314 - (314 * burnout.score / 100)}
                  strokeLinecap="round" className="animate-gauge"
                />
              </svg>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <p style={{ fontSize: 36, fontWeight: 800, color, margin: 0 }}>{burnout.score}</p>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#5C4D76', margin: 0, textTransform: 'uppercase' }}>{burnout.level}</p>
              </div>
            </div>
          </div>

          {/* Trend */}
          <Card style={{ marginBottom: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', margin: 0 }}>
              Trend: {burnout.trend === 'improving' ? '📈 Improving' : burnout.trend === 'worsening' ? '📉 Worsening' : '→ Stable'}
            </p>
          </Card>

          {/* Signals */}
          {burnout.signals.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 10px', textTransform: 'uppercase' }}>Active Signals</p>
              {burnout.signals.map((s, i) => (
                <Card key={i} style={{ marginBottom: 8, padding: 14, borderLeft: `3px solid ${s.severity === 'alert' ? '#E74C3C' : s.severity === 'warning' ? '#FFC107' : '#4D96FF'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{s.emoji}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#2e244c', margin: 0 }}>{s.name}</p>
                      <p style={{ fontSize: 12, color: '#5C4D76', margin: '2px 0 0' }}>{s.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Recommendation */}
          <Card style={{ background: 'linear-gradient(135deg, #f3eeff, #eadbff)', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#8a6cf0', margin: '0 0 8px' }}>💡 Recommendation</p>
            <p style={{ fontSize: 14, color: '#2e244c', margin: 0, lineHeight: 1.6 }}>{burnout.recommendation}</p>
          </Card>

          <p style={{ fontSize: 11, color: '#999', textAlign: 'center', lineHeight: 1.5 }}>
            ⚕️ This is a self-awareness tool, not a medical diagnosis. If you feel overwhelmed, please reach out to a qualified professional.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Patterns Screen ───
function PatternsScreen({ patterns, nav }: { patterns: DetectedPattern[]; nav: (s: ScreenName) => void }) {
  const confColors = { emerging: '#4D96FF', confirmed: '#6BCB77', strong: '#8a6cf0' };
  return (
    <div style={{ padding: '20px 16px' }}>
      <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>📊 Emotional Patterns</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 20px' }}>AI-detected insights from your data</p>

      {patterns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 56 }}>🔍</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#2e244c', margin: '16px 0 4px' }}>No patterns yet</p>
          <p style={{ fontSize: 14, color: '#5C4D76' }}>Log 3+ check-ins with tags to discover patterns</p>
        </div>
      ) : (
        patterns.map(p => (
          <Card key={p.id} style={{ marginBottom: 12, borderLeft: `3px solid ${confColors[p.confidence]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#2e244c', margin: 0 }}>{p.title}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: confColors[p.confidence], background: `${confColors[p.confidence]}15`, padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
                {p.confidence}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#5C4D76', margin: 0, lineHeight: 1.5 }}>{p.description}</p>
            <p style={{ fontSize: 11, color: '#999', margin: '6px 0 0' }}>Based on {p.dataPoints} data points</p>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Breathing Screen ───
function BreathingScreen({ onComplete, nav }: { onComplete: () => void; nav: (s: ScreenName) => void }) {
  const [technique, setTechnique] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'inhale' | 'hold' | 'exhale' | 'hold2' | 'done'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const techniques: Record<string, { label: string; emoji: string; desc: string; phases: [string, number][] }> = {
    box: { label: 'Box Breathing', emoji: '🫁', desc: 'Equal rhythm for focus', phases: [['inhale', 4], ['hold', 4], ['exhale', 4], ['hold2', 4]] },
    sleep: { label: '4-7-8 Sleep', emoji: '🌙', desc: 'Deep relaxation', phases: [['inhale', 4], ['hold', 7], ['exhale', 8]] },
    coherent: { label: 'Coherent', emoji: '💚', desc: 'Calm nervous system', phases: [['inhale', 5], ['exhale', 5]] },
    energize: { label: 'Energizing', emoji: '⚡', desc: 'Boost alertness', phases: [['inhale', 2], ['hold', 1], ['exhale', 4], ['hold2', 1]] },
  };

  const start = useCallback((tech: string) => {
    void systemSounds.prime();
    setTechnique(tech);
    setPhase('idle');
    setCycles(0);
    setTotalSeconds(0);
    setTimeout(() => runCycle(tech, 0), 300);
  }, []);

  const runCycle = useCallback((tech: string, cycleNum: number) => {
    const phases = techniques[tech].phases;
    let phaseIdx = 0;

    const runPhase = () => {
      if (cycleNum >= 8) {
        setPhase('done');
        void systemSounds.playCompletion();
        const session = { id: uid(), technique: tech, duration: 0, completedAt: Date.now() };
        storage.saveBreathingSession(session);
        onComplete();
        return;
      }
      if (phaseIdx >= phases.length) {
        setCycles(c => c + 1);
        runCycle(tech, cycleNum + 1);
        return;
      }
      const [phaseName, duration] = phases[phaseIdx];
      setPhase(phaseName as any);
      setSeconds(duration);
      let remaining = duration;
      timerRef.current = setInterval(() => {
        remaining--;
        setTotalSeconds(t => t + 1);
        setSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          phaseIdx++;
          runPhase();
        }
      }, 1000);
    };
    runPhase();
  }, []);

  useEffect(() => () => { clearInterval(timerRef.current); }, []);

  const stop = () => { clearInterval(timerRef.current); setPhase('idle'); setTechnique(null); };

  const phaseLabel = phase === 'inhale' ? 'Breathe In' : phase === 'exhale' ? 'Breathe Out' : phase === 'hold' || phase === 'hold2' ? 'Hold' : '';
  const phaseColor = phase === 'inhale' ? '#6BCB77' : phase === 'exhale' ? '#4D96FF' : '#FFD93D';

  if (!technique || phase === 'idle') {
    return (
      <div style={{ padding: '20px 16px' }}>
        <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>🫁 Breathing</h2>
        <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 20px' }}>Choose a technique to begin</p>

        <div style={{ display: 'grid', gap: 12 }}>
          {Object.entries(techniques).map(([key, t]) => (
            <Card key={key} onClick={() => start(key)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 36 }}>{t.emoji}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#2e244c', margin: 0 }}>{t.label}</p>
                <p style={{ fontSize: 12, color: '#5C4D76', margin: '2px 0 0' }}>{t.desc}</p>
                <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>{t.phases.map(p => `${p[1]}s`).join(' · ')}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* History */}
        {(() => {
          const sessions = storage.getBreathingSessions();
          if (sessions.length === 0) return (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <p style={{ fontSize: 13, color: '#999' }}>Your breathing sessions will appear here ✨</p>
            </div>
          );
          return (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 10px', textTransform: 'uppercase' }}>Recent Sessions</p>
              {sessions.slice(-5).reverse().map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f0ff' }}>
                  <span style={{ fontSize: 13, color: '#2e244c' }}>{techniques[s.technique]?.emoji} {techniques[s.technique]?.label || s.technique}</span>
                  <span style={{ fontSize: 12, color: '#999' }}>{new Date(s.completedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div style={{ padding: '20px 16px', textAlign: 'center', paddingTop: 80 }}>
        <p style={{ fontSize: 64 }}>🎉</p>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '16px 0 8px' }}>Well done!</h2>
        <p style={{ fontSize: 16, color: '#5C4D76', margin: '0 0 8px' }}>{cycles} cycles completed</p>
        <p style={{ fontSize: 14, color: '#999' }}>{Math.floor(totalSeconds / 60)}m {totalSeconds % 60}s total</p>
        <button onClick={() => { setTechnique(null); setPhase('idle'); }} style={{
          marginTop: 32, padding: '14px 32px', borderRadius: 16, border: 'none', background: '#8a6cf0', color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          Done ✨
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', textAlign: 'center', paddingTop: 40 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#5C4D76', margin: '0 0 40px' }}>
        {techniques[technique]?.emoji} {techniques[technique]?.label} · Cycle {cycles + 1}
      </p>

      {/* Breathing Circle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
        <div
          style={{
            width: phase === 'inhale' ? 200 : phase === 'exhale' ? 120 : 160,
            height: phase === 'inhale' ? 200 : phase === 'exhale' ? 120 : 160,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${phaseColor}40, ${phaseColor}20)`,
            border: `3px solid ${phaseColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            transition: 'all 1s ease-in-out',
            boxShadow: `0 0 40px ${phaseColor}30`,
          }}
        >
          <p style={{ fontSize: 42, fontWeight: 800, color: phaseColor, margin: 0 }}>{seconds}</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', margin: '4px 0 0' }}>{phaseLabel}</p>
        </div>
      </div>

      <button onClick={stop} style={{
        padding: '14px 32px', borderRadius: 16, border: '2px solid #e0d8f0', background: '#fff',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#5C4D76',
      }}>
        Stop Session
      </button>
    </div>
  );
}

// ─── Report Screen ───
function ReportScreen({ entries, journals, nav, showToast }: { entries: MoodEntry[]; journals: JournalEntry[]; nav: (s: ScreenName) => void; showToast: (m: string) => void }) {
  const [generated, setGenerated] = useState<WeeklyReport | null>(null);

  const generate = () => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekEntries = entries.filter(e => e.timestamp >= weekAgo);
    const weekJournals = journals.filter(j => j.createdAt >= weekAgo);

    if (weekEntries.length < 1) { showToast('Need at least 1 check-in this week'); return; }

    const avgMood = weekEntries.reduce((a, e) => a + ({'happy': 10, 'calm': 8, 'neutral': 6, 'tired': 4, 'anxious': 3, 'sad': 2, 'angry': 2}[e.mood] || 5), 0) / weekEntries.length;
    const avgStress = weekEntries.reduce((a, e) => a + e.stress, 0) / weekEntries.length;
    const avgEnergy = weekEntries.reduce((a, e) => a + e.energy, 0) / weekEntries.length;
    const avgSleep = weekEntries.reduce((a, e) => a + e.sleep, 0) / weekEntries.length;
    const bal = calculateBalance(weekEntries);
    const burnout = calculateBurnout(weekEntries, weekJournals);

    const tagC: Record<string, number> = {};
    weekEntries.forEach(e => e.tags.forEach(t => { tagC[t] = (tagC[t] || 0) + 1; }));
    const topTags = Object.entries(tagC).sort((a, b) => b[1] - a[1]).slice(0, 3).map(t => t[0]);

    const dayScores = weekEntries.map(e => ({
      day: new Date(e.timestamp).toLocaleDateString('en-US', { weekday: 'long' }),
      score: ({'happy': 10, 'calm': 8, 'neutral': 6, 'tired': 4, 'anxious': 3, 'sad': 2, 'angry': 2}[e.mood] || 5) - e.stress * 0.5 + e.energy * 0.3,
    }));
    const best = dayScores.sort((a, b) => b.score - a.score)[0]?.day || '-';
    const hardest = dayScores.sort((a, b) => a.score - b.score)[0]?.day || '-';

    let insight = '';
    if (avgStress > 7 && avgSleep < 5) insight = 'Tough week — high stress with low sleep. Your body needs deep rest. 💜';
    else if (avgMood > 7) insight = 'Strong week! Your mood stayed positive. Keep doing what works. ✨';
    else if (weekEntries.length < 3) insight = 'Logged fewer check-ins this week. That\'s okay — showing up now matters. 🌱';
    else if (avgEnergy < 4) insight = 'Low energy this week. Consider adding more rest and physical activity. 🔋';
    else insight = 'A balanced week overall. Small wins compound into big wellness. 🌿';

    const report: WeeklyReport = {
      id: uid(),
      weekStart: new Date(weekAgo).toLocaleDateString(),
      weekEnd: new Date().toLocaleDateString(),
      avgMood: Math.round(avgMood * 10) / 10,
      avgStress: Math.round(avgStress * 10) / 10,
      avgEnergy: Math.round(avgEnergy * 10) / 10,
      avgSleep: Math.round(avgSleep * 10) / 10,
      totalCheckins: weekEntries.length,
      totalJournals: weekJournals.length,
      topTags, bestDay: best, hardestDay: hardest, insight,
      burnoutLevel: burnout.level,
      balanceScore: bal,
      createdAt: Date.now(),
    };

    storage.saveReport(report);
    setGenerated(report);
    showToast('📋 Report generated!');
  };

  const pastReports = storage.getReports().slice().sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div style={{ padding: '20px 16px' }}>
      <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>📋 Weekly Report</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 20px' }}>Your mental health wrapped ✨</p>

      {!generated ? (
        <>
          <button onClick={generate} style={{
            width: '100%', padding: 18, borderRadius: 16, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            background: 'linear-gradient(135deg, #8a6cf0, #6c4fd8)', color: '#fff', boxShadow: '0 4px 20px rgba(138,108,240,0.3)', marginBottom: 24,
          }}>
            ✨ Generate This Week's Report
          </button>

          {pastReports.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#5C4D76', margin: '0 0 10px', textTransform: 'uppercase' }}>Past Reports</p>
              {pastReports.map(r => (
                <Card key={r.id} onClick={() => setGenerated(r)} style={{ marginBottom: 10, cursor: 'pointer' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#2e244c', margin: 0 }}>{r.weekStart} — {r.weekEnd}</p>
                  <p style={{ fontSize: 12, color: '#5C4D76', margin: '4px 0 0' }}>Balance: {r.balanceScore}% · {r.totalCheckins} check-ins</p>
                </Card>
              ))}
            </>
          )}

          {pastReports.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 48 }}>📊</p>
              <p style={{ fontSize: 14, color: '#5C4D76' }}>Generate your first weekly report to see your mental health wrapped ✨</p>
            </div>
          )}
        </>
      ) : (
        <div className="animate-fadeInUp">
          <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f3eeff, #eadbff)' }}>
            <p style={{ fontSize: 12, color: '#5C4D76', margin: '0 0 4px' }}>{generated.weekStart} — {generated.weekEnd}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#2e244c', margin: 0 }}>Your Week In Review ✨</p>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Mood', value: generated.avgMood.toFixed(1), emoji: '😊', color: '#FFD93D' },
              { label: 'Stress', value: generated.avgStress.toFixed(1), emoji: '😰', color: '#FF6B6B' },
              { label: 'Energy', value: generated.avgEnergy.toFixed(1), emoji: '⚡', color: '#6BCB77' },
              { label: 'Sleep', value: generated.avgSleep.toFixed(1), emoji: '😴', color: '#4D96FF' },
            ].map(m => (
              <Card key={m.label} style={{ padding: 14, textAlign: 'center' }}>
                <span style={{ fontSize: 20 }}>{m.emoji}</span>
                <p style={{ fontSize: 20, fontWeight: 800, color: m.color, margin: '4px 0 0' }}>{m.value}</p>
                <p style={{ fontSize: 10, fontWeight: 600, color: '#5C4D76', textTransform: 'uppercase' }}>{m.label}</p>
              </Card>
            ))}
          </div>

          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><p style={{ fontSize: 11, color: '#999', margin: 0 }}>Check-ins</p><p style={{ fontSize: 18, fontWeight: 800, color: '#2e244c', margin: '2px 0 0' }}>{generated.totalCheckins}</p></div>
              <div><p style={{ fontSize: 11, color: '#999', margin: 0 }}>Journals</p><p style={{ fontSize: 18, fontWeight: 800, color: '#2e244c', margin: '2px 0 0' }}>{generated.totalJournals}</p></div>
              <div><p style={{ fontSize: 11, color: '#999', margin: 0 }}>Balance</p><p style={{ fontSize: 18, fontWeight: 800, color: '#8a6cf0', margin: '2px 0 0' }}>{generated.balanceScore}%</p></div>
            </div>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#5C4D76', margin: '0 0 6px' }}>🌟 Best Day: <span style={{ color: '#2e244c' }}>{generated.bestDay}</span></p>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#5C4D76', margin: 0 }}>💪 Hardest Day: <span style={{ color: '#2e244c' }}>{generated.hardestDay}</span></p>
          </Card>

          <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, #cbf3e520, #eadbff20)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#8a6cf0', margin: '0 0 6px' }}>💡 Insight</p>
            <p style={{ fontSize: 14, color: '#2e244c', margin: 0, lineHeight: 1.6 }}>{generated.insight}</p>
          </Card>

          <button onClick={() => setGenerated(null)} style={{
            width: '100%', padding: 14, borderRadius: 14, border: '2px solid #e0d8f0', background: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#5C4D76',
          }}>
            ← Back to Reports
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Achievements Screen ───
function AchievementsScreen({ entries, journals, nav }: { entries: MoodEntry[]; journals: JournalEntry[]; nav: (s: ScreenName) => void }) {
  const breathingSessions = storage.getBreathingSessions();

  const streak = (() => {
    if (entries.length === 0) return 0;
    const sorted = entries.slice().sort((a, b) => b.timestamp - a.timestamp);
    let count = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if (sorted.some(e => new Date(e.timestamp).toDateString() === d.toDateString())) count++;
      else if (i > 0) break;
    }
    return count;
  })();

  const achievements = [
    { id: 'first-step', emoji: '🌱', title: 'First Step', desc: 'Log your first check-in', progress: Math.min(entries.length, 1), target: 1, cat: 'Consistency' },
    { id: '3-days', emoji: '🌿', title: 'Three Days', desc: 'Check in 3 days in a row', progress: Math.min(streak, 3), target: 3, cat: 'Consistency' },
    { id: '7-days', emoji: '🌳', title: 'One Week', desc: 'Check in 7 days in a row', progress: Math.min(streak, 7), target: 7, cat: 'Consistency' },
    { id: '14-days', emoji: '🏔️', title: 'Fortnight', desc: '14-day streak', progress: Math.min(streak, 14), target: 14, cat: 'Consistency' },
    { id: '30-days', emoji: '💎', title: 'Month Strong', desc: '30-day streak', progress: Math.min(streak, 30), target: 30, cat: 'Consistency' },
    { id: 'first-breath', emoji: '🫁', title: 'First Breath', desc: 'Complete a breathing session', progress: Math.min(breathingSessions.length, 1), target: 1, cat: 'Self-Care' },
    { id: '10-breaths', emoji: '🌬️', title: 'Breath Builder', desc: '10 breathing sessions', progress: Math.min(breathingSessions.length, 10), target: 10, cat: 'Self-Care' },
    { id: 'first-journal', emoji: '✍️', title: 'First Words', desc: 'Write your first journal', progress: Math.min(journals.length, 1), target: 1, cat: 'Reflection' },
    { id: '10-journals', emoji: '📖', title: 'Story Weaver', desc: '10 journal entries', progress: Math.min(journals.length, 10), target: 10, cat: 'Reflection' },
    { id: '10-checkins', emoji: '📊', title: 'Data Driven', desc: '10 check-ins total', progress: Math.min(entries.length, 10), target: 10, cat: 'Growth' },
    { id: '25-checkins', emoji: '🏅', title: 'Quarter Century', desc: '25 check-ins total', progress: Math.min(entries.length, 25), target: 25, cat: 'Growth' },
    { id: '50-checkins', emoji: '🌟', title: 'Half Century', desc: '50 check-ins total', progress: Math.min(entries.length, 50), target: 50, cat: 'Growth' },
  ];

  const unlocked = achievements.filter(a => a.progress >= a.target).length;

  return (
    <div style={{ padding: '20px 16px' }}>
      <button onClick={() => nav('home')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>🏆 Achievements</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 6px' }}>Every step counts — no pressure, only pride 💜</p>

      {/* Progress */}
      <Card style={{ marginBottom: 20, background: 'linear-gradient(135deg, #f3eeff, #eadbff)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#8a6cf0', margin: '0 0 8px' }}>{unlocked} of {achievements.length} milestones reached</p>
        <div style={{ height: 8, borderRadius: 4, background: '#e0d8f0' }}>
          <div style={{ height: 8, borderRadius: 4, background: '#8a6cf0', width: `${(unlocked / achievements.length) * 100}%`, transition: 'width 0.5s' }} />
        </div>
      </Card>

      {/* Achievements Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {achievements.map(a => {
          const done = a.progress >= a.target;
          return (
            <Card key={a.id} style={{ padding: 16, textAlign: 'center', opacity: done ? 1 : 0.6, background: done ? 'linear-gradient(135deg, #fffbeb, #fff3d4)' : 'rgba(255,255,255,0.6)' }}>
              <span style={{ fontSize: 32, filter: done ? 'none' : 'grayscale(1)' }}>{a.emoji}</span>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#2e244c', margin: '6px 0 2px' }}>{a.title}</p>
              <p style={{ fontSize: 10, color: '#5C4D76', margin: '0 0 8px' }}>{a.desc}</p>
              <div style={{ height: 4, borderRadius: 2, background: '#e0d8f0' }}>
                <div style={{ height: 4, borderRadius: 2, background: done ? '#FFD93D' : '#8a6cf0', width: `${Math.min((a.progress / a.target) * 100, 100)}%` }} />
              </div>
              <p style={{ fontSize: 10, color: '#999', margin: '4px 0 0' }}>{a.progress}/{a.target}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Profile Screen ───
function ProfileScreen({ name, entries, journals, streak, onNameChange, onClear, onExport, nav }: {
  name: string; entries: MoodEntry[]; journals: JournalEntry[]; streak: number;
  onNameChange: (n: string) => void; onClear: () => void; onExport: () => void; nav: (s: ScreenName) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string>('default');
  const [reminderTime, setReminderTime] = useState('09:00');

  useEffect(() => {
    const profile = storage.getProfile();
    setReminderTime(profile.reminderTime || '09:00');
    setNotifStatus(notificationService.getPermission());
  }, []);

  const saveReminderTime = (value: string) => {
    setReminderTime(value);
    const profile = storage.getProfile();
    storage.saveProfile({ ...profile, reminderTime: value });
  };

  const requestNotifs = async () => {
    const perm = await notificationService.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      notificationService.send('🌸 ZenithMe', 'Notifications enabled! We’ll remind you gently.');
    }
  };

  const sendTestNotif = async () => {
    await systemSounds.prime();
    const sent = notificationService.sendTest();
    if (sent) {
      void systemSounds.playCompletion();
      return;
    }
    alert('Notifications are not available yet. Please enable them first and keep the browser open.');
  };

  return (
    <div style={{ padding: '20px 16px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 20px' }}>👤 Profile</h2>

      {/* Profile Card */}
      <Card style={{ marginBottom: 16, textAlign: 'center', background: 'linear-gradient(135deg, #eadbff30, #cbf3e530)' }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: 'linear-gradient(135deg, #8a6cf0, #6c4fd8)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 32, color: '#fff' }}>{name ? name[0].toUpperCase() : '🌸'}</span>
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Your name" style={{
              flex: 1, padding: 12, borderRadius: 12, border: '1px solid #e0d8f0', fontSize: 15, outline: 'none',
            }} />
            <button onClick={() => { onNameChange(newName); setEditing(false); }} style={{
              padding: '12px 20px', borderRadius: 12, border: 'none', background: '#8a6cf0', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>Save</button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#2e244c', margin: 0 }}>{name || 'Set your name'}</p>
            <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: '#8a6cf0', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Edit ✏️</button>
          </>
        )}
      </Card>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#8a6cf0', margin: 0 }}>{entries.length}</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#5C4D76', textTransform: 'uppercase' }}>Check-ins</p>
        </Card>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#8a6cf0', margin: 0 }}>{journals.length}</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#5C4D76', textTransform: 'uppercase' }}>Journals</p>
        </Card>
        <Card style={{ padding: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#8a6cf0', margin: 0 }}>{streak}</p>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#5C4D76', textTransform: 'uppercase' }}>Streak</p>
        </Card>
      </div>

      {/* Notifications */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', margin: 0 }}>🔔 Notifications</p>
            <p style={{ fontSize: 11, color: '#5C4D76', margin: '2px 0 0' }}>
              {notifStatus === 'granted'
                ? 'Enabled ✅ Browser/system notifications work while the app is open.'
                : notifStatus === 'denied'
                  ? 'Blocked — enable again from browser settings.'
                  : 'Not yet enabled'}
            </p>
          </div>
          {notifStatus !== 'granted' && notifStatus !== 'denied' && (
            <button onClick={requestNotifs} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#8a6cf0', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Enable</button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <label htmlFor="reminder-time" style={{ fontSize: 12, fontWeight: 700, color: '#5C4D76', minWidth: 84 }}>Daily reminder</label>
          <input
            id="reminder-time"
            type="time"
            value={reminderTime}
            onChange={(e) => saveReminderTime(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e0d8f0', background: '#fff', color: '#2e244c' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button onClick={sendTestNotif} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#2e244c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Send test</button>
          <div style={{ fontSize: 11, color: '#5C4D76', lineHeight: 1.5, paddingTop: 2 }}>
            Browser/system reminders show in your browser notification tray, phone notification shade, or lock-screen banner depending on your device settings.
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 12, background: '#faf7ff', border: '1px solid #ece3fb' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#2e244c', margin: '0 0 8px' }}>📱 How to get reminders on your phone</p>
          <div style={{ fontSize: 11, color: '#5C4D76', lineHeight: 1.65 }}>
            <div><strong>Android:</strong> open ZenithMe in Chrome, tap Enable, allow notifications, then keep the tab open or install it to your home screen for best results.</div>
            <div style={{ marginTop: 6 }}><strong>iPhone:</strong> Safari web notifications are more limited. Enable notifications if prompted and keep the app open in Safari for dependable local reminders.</div>
            <div style={{ marginTop: 6 }}><strong>Where they appear:</strong> lock screen, notification center, browser banner, and sometimes the phone notification shade.</div>
            <div style={{ marginTop: 6 }}><strong>Important:</strong> notifications work best on localhost during development or on a live HTTPS site.</div>
            <div style={{ marginTop: 6 }}><strong>Current limitation:</strong> if the browser is fully closed, local reminders cannot reliably appear without a push backend.</div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      {[
        { icon: '🏆', label: 'Achievements', action: () => nav('achievements') },
        { icon: '📅', label: 'Mood Calendar', action: () => nav('calendar') },
        { icon: '📞', label: 'Emergency Contacts', action: () => nav('emergency') },
        { icon: '🛡️', label: 'Safety Plan', action: () => nav('safety-plan') },
        { icon: '🔒', label: 'Set Panic PIN', action: () => nav('panic-setup') },
        { icon: '📥', label: 'Export Data', action: onExport },
      ].map(a => (
        <Card key={a.label} onClick={a.action} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: 16 }}>
          <span style={{ fontSize: 20 }}>{a.icon}</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', margin: 0 }}>{a.label}</p>
          <span style={{ marginLeft: 'auto', color: '#ccc', fontSize: 16 }}>›</span>
        </Card>
      ))}

      {/* Clear Data */}
      {!confirmClear ? (
        <button onClick={() => setConfirmClear(true)} style={{
          width: '100%', padding: 14, borderRadius: 14, border: '1px solid #fecdd3', background: '#fff5f5',
          fontSize: 14, fontWeight: 600, color: '#E74C3C', cursor: 'pointer', marginTop: 16,
        }}>
          🗑️ Clear All Data
        </button>
      ) : (
        <Card style={{ marginTop: 16, background: '#fff5f5', border: '1px solid #fecdd3' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#E74C3C', margin: '0 0 8px' }}>⚠️ This will delete everything</p>
          <p style={{ fontSize: 12, color: '#5C4D76', margin: '0 0 12px' }}>All check-ins, journals, and settings will be permanently removed.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { onClear(); setConfirmClear(false); }} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#E74C3C', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Delete Everything</button>
            <button onClick={() => setConfirmClear(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #e0d8f0', background: '#fff', fontWeight: 700, cursor: 'pointer', color: '#5C4D76' }}>Cancel</button>
          </div>
        </Card>
      )}

      {/* Privacy */}
      <Card style={{ marginTop: 16, background: '#f8f5ff' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#8a6cf0', margin: '0 0 6px' }}>🔒 Privacy</p>
        <p style={{ fontSize: 12, color: '#5C4D76', margin: 0, lineHeight: 1.6 }}>
          All data is stored locally on your device. Nothing is sent to any server. Your wellness journey is 100% private.
        </p>
      </Card>

      <p style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 20 }}>
        ⚕️ ZenithMe is a self-care tool, not a medical service.
      </p>
    </div>
  );
}

// ─── Panic Screen ───
function PanicScreen({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('');
  const [display, setDisplay] = useState('0');
  const [showUnlock, setShowUnlock] = useState(false);

  const savedPin = storage.getPanicPin();

  const handleCalcPress = (val: string) => {
    if (val === 'C') { setDisplay('0'); setInput(''); return; }
    if (val === '=') {
      try {
        const result = Function(`"use strict"; return (${display})`)();
        setDisplay(String(result));
      } catch { setDisplay('Error'); }
      return;
    }
    setDisplay(prev => prev === '0' ? val : prev + val);
  };

  // Secret unlock: type PIN + # on calculator
  const handleUnlock = () => {
    if (!savedPin) { onUnlock(); return; }
    setShowUnlock(true);
  };

  if (showUnlock) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <p style={{ fontSize: 36 }}>🔒</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#333', margin: '12px 0 20px' }}>Enter PIN to unlock</p>
        <input
          type="password" value={input} onChange={e => setInput(e.target.value)} maxLength={6} autoFocus
          style={{ padding: 14, fontSize: 24, textAlign: 'center', borderRadius: 14, border: '1px solid #ddd', width: 160, outline: 'none', letterSpacing: 8 }}
        />
        <button onClick={() => { if (input === savedPin) onUnlock(); else { setInput(''); alert('Wrong PIN'); } }} style={{
          marginTop: 16, padding: '12px 32px', borderRadius: 14, border: 'none', background: '#333', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>Unlock</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
      {/* Looks like a calculator */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '20px 0' }}>
          <p style={{ fontSize: 48, fontWeight: 300, color: '#333', margin: 0, wordBreak: 'break-all' }}>{display}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '←', '='].map(btn => (
            <button
              key={btn} onClick={() => handleCalcPress(btn === '×' ? '*' : btn === '÷' ? '/' : btn === '←' ? '' : btn)}
              style={{
                padding: 18, fontSize: 20, fontWeight: 500, borderRadius: 16, border: 'none', cursor: 'pointer',
                background: btn === '=' ? '#FF9500' : ['C', '(', ')', '÷', '×', '-', '+', '←'].includes(btn) ? '#e0e0e0' : '#fff',
                color: btn === '=' ? '#fff' : '#333',
              }}
            >
              {btn}
            </button>
          ))}
        </div>
        {/* Hidden unlock button */}
        <button
          onClick={handleUnlock}
          style={{ marginTop: 20, padding: 12, background: 'none', border: 'none', fontSize: 12, color: '#ccc', cursor: 'pointer' }}
        >
          •
        </button>
      </div>
    </div>
  );
}

// ─── Panic Setup Screen ───
function PanicSetupScreen({ onSave, nav }: { onSave: (pin: string) => void; nav: (s: ScreenName) => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(0);

  return (
    <div style={{ padding: '20px 16px' }}>
      <button onClick={() => nav('profile')} style={{ background: 'none', border: 'none', fontSize: 16, color: '#5C4D76', cursor: 'pointer', fontWeight: 600, marginBottom: 20 }}>← Back</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: '#2e244c', margin: '0 0 4px' }}>🚨 Panic Mode Setup</h2>
      <p style={{ fontSize: 14, color: '#5C4D76', margin: '0 0 24px', lineHeight: 1.6 }}>
        Tap the 🔒 on home to instantly hide the app behind a calculator. Set a PIN to get back in.
      </p>

      {step === 0 ? (
        <>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', marginBottom: 8 }}>Set a 4-6 digit PIN</p>
          <input
            type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter PIN" maxLength={6} autoFocus
            style={{ width: '100%', padding: 16, fontSize: 24, textAlign: 'center', borderRadius: 16, border: '1px solid #e0d8f0', outline: 'none', letterSpacing: 8, boxSizing: 'border-box' }}
          />
          {pin.length >= 4 && (
            <button onClick={() => setStep(1)} style={{
              width: '100%', marginTop: 16, padding: 16, borderRadius: 16, border: 'none', background: '#8a6cf0', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}>Continue</button>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#2e244c', marginBottom: 8 }}>Confirm your PIN</p>
          <input
            type="password" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Confirm PIN" maxLength={6} autoFocus
            style={{ width: '100%', padding: 16, fontSize: 24, textAlign: 'center', borderRadius: 16, border: '1px solid #e0d8f0', outline: 'none', letterSpacing: 8, boxSizing: 'border-box' }}
          />
          {confirm.length >= 4 && (
            <button onClick={() => {
              if (pin === confirm) onSave(pin);
              else { setConfirm(''); alert('PINs don\'t match'); }
            }} style={{
              width: '100%', marginTop: 16, padding: 16, borderRadius: 16, border: 'none', background: '#6BCB77', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}>Save PIN 🔒</button>
          )}
        </>
      )}
    </div>
  );
}
