import React, { useState, useEffect } from "react";
import { t } from "../../i18n/index.js";

export function NoteEditor({ initialNote = "", onSave, onDelete, language }) {
  const [text, setText] = useState(initialNote);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setText(initialNote || "");
    setIsDirty(false);
  }, [initialNote]);

  const handleChange = (e) => {
    setText(e.target.value);
    setIsDirty(true);
  };

  const handleSave = () => {
    if (onSave(text)) setIsDirty(false);
  };

  const handleDelete = () => {
    if (onDelete()) {
      setText("");
      setIsDirty(false);
    }
  };

  const maxLen = 1000;
  const isRtl = language === "ar";

  return (
    <div className="note-card">
      <div className="note-header-wrap">
        <h3 className="note-section-title">
          {isRtl ? "الملاحظات اليومية" : "NOTES"}
        </h3>
        <span className="note-char-counter">
          {text.length} / {maxLen}
        </span>
      </div>

      <label htmlFor="challengeNote" className="note-question-label">
        {isRtl ? "كيف كان يومك مع هذا التحدي؟" : "How did today go?"}
      </label>

      <textarea
        id="challengeNote"
        className="note-textarea"
        maxLength={maxLen}
        placeholder={t("notePlaceholder", {}, language)}
        value={text}
        onChange={handleChange}
        rows={4}
      />

      <div className="note-footer-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!isDirty && text === initialNote}
        >
          {t("saveNote", {}, language)}
        </button>

        {initialNote && (
          <button
            type="button"
            className="btn btn-secondary note-clear-btn"
            onClick={handleDelete}
          >
            {isRtl ? "مسح الملاحظة" : "Clear"}
          </button>
        )}
      </div>
    </div>
  );
}

export default NoteEditor;
