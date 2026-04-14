import { storage } from './storage';

const LAST_DAILY_REMINDER_KEY = 'zm:last_daily_reminder_sent';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function timeToMinutes(value: string) {
  const [hh = '09', mm = '00'] = value.split(':');
  return Number(hh) * 60 + Number(mm);
}

function hasCheckedInToday() {
  const today = new Date().toDateString();
  return storage.getEntries().some((entry) => new Date(entry.timestamp).toDateString() === today);
}

export const notificationService = {
  isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  getPermission() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async requestPermission() {
    if (!this.isSupported()) return 'unsupported';
    const permission = await Notification.requestPermission();
    const profile = storage.getProfile();
    storage.saveProfile({
      ...profile,
      notificationsEnabled: permission === 'granted',
    });
    return permission;
  },

  send(title: string, body: string) {
    if (!this.isSupported() || Notification.permission !== 'granted') return false;

    try {
      const notification = new Notification(title, {
        body,
        tag: 'zenithme-reminder',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      return true;
    } catch {
      return false;
    }
  },

  sendTest() {
    return this.send(
      '🌸 ZenithMe reminder',
      'This is a real browser notification from your private wellness app.'
    );
  },

  startDailyReminderLoop(onTriggered?: (message: string) => void) {
    if (typeof window === 'undefined') return () => {};

    const check = () => {
      const profile = storage.getProfile();
      if (!profile.notificationsEnabled) return;
      if (!this.isSupported() || Notification.permission !== 'granted') return;

      const reminderTime = profile.reminderTime || '09:00';
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const reminderMinutes = timeToMinutes(reminderTime);
      const sentToday = localStorage.getItem(LAST_DAILY_REMINDER_KEY) === todayKey();

      if (!sentToday && nowMinutes >= reminderMinutes) {
        const checkedIn = hasCheckedInToday();
        const title = checkedIn ? '🌙 Evening reflection' : '🌸 Private check-in time';
        const body = checkedIn
          ? 'Take one quiet minute to reflect on your day and how your mind feels.'
          : 'Your gentle reminder: log today’s mood, stress, and energy in ZenithMe.';

        const sent = this.send(title, body);
        if (sent) {
          localStorage.setItem(LAST_DAILY_REMINDER_KEY, todayKey());
          onTriggered?.(body);
        }
      }
    };

    const intervalId = window.setInterval(check, 30_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    check();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  },
};
