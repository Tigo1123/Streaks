import { useEffect, useState } from "react";
import { localToday, scheduleTodayRollover } from "../utils/date.js";

export function useToday({ timezone, serverTime, isOnline, refreshServerTime, serverRefreshDelay = 0 }) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const checkToday = async () => {
      if (isOnline) await refreshServerTime();
      if (active) setRevision((value) => value + 1);
    };
    const scheduleTime = isOnline && serverTime
      ? {
          ...serverTime,
          delayMs: Math.max(serverTime.delayMs || 0, serverRefreshDelay)
        }
      : null;
    const cancelTimer = scheduleTodayRollover({
      timezone,
      serverTime: scheduleTime,
      onRollover: checkToday
    });
    const recheck = () => {
      setRevision((value) => value + 1);
      if (document.visibilityState !== "hidden") refreshServerTime();
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);

    return () => {
      active = false;
      cancelTimer();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [timezone, serverTime, isOnline, refreshServerTime, serverRefreshDelay]);

  void revision;
  return isOnline && serverTime ? serverTime.today : localToday(new Date(), timezone);
}
