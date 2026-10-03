import React from "react";
import { useStreaks } from "../../hooks/useStreaks.js";

export function StorageRecoveryScreen() {
  const { loadError, rawStorageData, retryLoad, startFresh } = useStreaks();
  const canReplace = typeof rawStorageData === "string" && loadError?.code !== "storage-unavailable";

  const exportRaw = () => {
    if (typeof rawStorageData !== "string") return;
    const blob = new Blob([rawStorageData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "streaks-data-raw-backup.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleStartFresh = async () => {
    const confirmed = window.confirm(
      "This will replace the unreadable Streaks data. A raw backup will be saved first. Continue?\n\n" +
      "سيتم استبدال بيانات Streaks غير المقروءة بعد حفظ نسخة خام منها. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    const result = await startFresh();
    if (!result.ok) return;
  };

  return (
    <main className="content-area">
      <section className="welcome-section" aria-labelledby="storageRecoveryTitle" role="alert">
        <h1 id="storageRecoveryTitle">تعذر قراءة بيانات Streaks / Streaks data could not be read</h1>
        <p>
          لم يتم تعديل السجل الأصلي. صدّر البيانات الخام أو أعد المحاولة. يمكنك البدء من جديد
          بعد حفظ نسخة احتياطية وموافقتك الصريحة.
        </p>
        {loadError?.code === "invalid-json" && (
          <p>الملف المخزن ليس JSON صالحًا. / The stored value is not valid JSON.</p>
        )}
        {loadError?.code === "unsupported-version" && (
          <p>إصدار البيانات غير مدعوم. / This data version is not supported.</p>
        )}
        <div className="welcome-cta-group">
          <button type="button" className="btn btn-secondary" onClick={exportRaw} disabled={!canReplace}>
            تصدير البيانات الخام / Export raw data
          </button>
          <button type="button" className="btn btn-secondary" onClick={retryLoad}>
            إعادة المحاولة / Retry
          </button>
          <button type="button" className="btn btn-danger" onClick={handleStartFresh} disabled={!canReplace}>
            البدء من جديد / Start fresh
          </button>
        </div>
      </section>
    </main>
  );
}
