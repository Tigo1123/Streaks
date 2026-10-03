import { useEffect, useCallback } from "react";
import { useStreaks } from "./useStreaks.js";
import { useToast } from "./useToast.js";
import { useNavigation } from "./useNavigation.js";
import { localToday, dayIndex } from "../utils/date.js";
import { t } from "../i18n/index.js";

export function useReminders() {
  const { reminders, challenges, language, setRemindersEnabled, setLastReminderDate } = useStreaks();
  const { showToast } = useToast();
  const { goBack } = useNavigation();

  const isSupported = typeof window !== "undefined" && typeof window.Notification !== "undefined";
  const permission = isSupported ? window.Notification.permission : "unsupported";

  const checkReminder = useCallback(() => {
    if (
      !reminders.enabled ||
      typeof document === "undefined" ||
      document.visibilityState === "hidden" ||
      !isSupported
    ) {
      return;
    }

    if (Notification.permission === "denied") {
      setRemindersEnabled(false);
      showToast(t("reminderDenied", {}, language));
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const today = localToday();
    if (reminders.lastReminderDate === today) {
      return;
    }

    const pending = challenges.some((c) => {
      const day = dayIndex(c);
      return day >= 1 && day <= c.durationDays && !c.completedDays.includes(day);
    });

    if (!pending) return;

    try {
      const notice = new Notification(t("reminderTitle", {}, language), {
        body: t("reminderBody", {}, language),
        icon: "./icons/icon-192.png",
        tag: `streaks-reminder-${today}`,
        renotify: false
      });

      setLastReminderDate(today);

      notice.onclick = () => {
        if (typeof window !== "undefined") {
          window.focus();
        }
        goBack(); // Navigate to root dashboard
        notice.close();
      };
    } catch (_) {
      showToast(t("reminderError", {}, language));
    }
  }, [reminders, challenges, language, isSupported, setRemindersEnabled, setLastReminderDate, showToast, goBack]);

  const enableReminders = useCallback(async () => {
    if (!isSupported) {
      showToast(t("reminderUnsupported", {}, language));
      return;
    }

    const applyEnabled = () => {
      const saved = setRemindersEnabled(true);
      if (!saved.ok) return;
      const hasPending = challenges.some((c) => {
        const day = dayIndex(c);
        return day >= 1 && day <= c.durationDays && !c.completedDays.includes(day);
      });

      showToast(t(hasPending ? "reminderEnabled" : "reminderNoChallenges", {}, language));
      checkReminder();
    };

    try {
      if (Notification.permission === "granted") {
        applyEnabled();
        return;
      }
      if (Notification.permission === "denied") {
        showToast(t("reminderDenied", {}, language));
        return;
      }

      const requested = await Notification.requestPermission();
      if (requested === "granted") {
        applyEnabled();
      } else if (requested === "denied") {
        showToast(t("reminderDenied", {}, language));
      }
    } catch (_) {
      showToast(t("reminderError", {}, language));
    }
  }, [isSupported, language, challenges, setRemindersEnabled, showToast, checkReminder]);

  const disableReminders = useCallback(() => {
    return setRemindersEnabled(false);
  }, [setRemindersEnabled]);

  // Lifecycle listeners: check on foreground visibility/focus
  useEffect(() => {
    if (typeof window === "undefined" || !reminders.enabled) return;

    const handleCheck = () => checkReminder();

    document.addEventListener("visibilitychange", handleCheck);
    window.addEventListener("focus", handleCheck);
    window.addEventListener("pageshow", handleCheck);

    // Initial check
    checkReminder();

    return () => {
      document.removeEventListener("visibilitychange", handleCheck);
      window.removeEventListener("focus", handleCheck);
      window.removeEventListener("pageshow", handleCheck);
    };
  }, [reminders.enabled, checkReminder]);

  return {
    isSupported,
    permission,
    isEnabled: reminders.enabled,
    checkReminder,
    enableReminders,
    disableReminders
  };
}
