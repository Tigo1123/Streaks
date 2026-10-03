import React from "react";
import { Modal } from "../common/Modal.jsx";
import { useStreaks } from "../../hooks/useStreaks.js";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useToast } from "../../hooks/useToast.js";
import { t } from "../../i18n/index.js";

export function DeleteChallengeModal() {
  const { deleteChallenge, language } = useStreaks();
  const { modalMode, closeModal, selectedChallengeId, goBack } = useNavigation();
  const { showToast } = useToast();

  const isOpen = modalMode === "delete";
  const isRtl = language === "ar";

  const handleConfirmDelete = async () => {
    if (selectedChallengeId) {
      const result = await deleteChallenge(selectedChallengeId);
      if (!result.ok) return;
      showToast(isRtl ? "تم حذف التحدي" : "Challenge deleted");
      closeModal();
      goBack(); // return to dashboard
    }
  };

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={closeModal}>
        {t("cancel", {}, language)}
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={handleConfirmDelete}
        autoFocus
      >
        🗑️ {t("confirm", {}, language)}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title={t("confirmDelete", {}, language)}
      footer={footer}
    >
      <div className="modal-content-stack">
        <p className="modal-body-text">
          {t("deleteText", {}, language)}
        </p>
      </div>
    </Modal>
  );
}

export default DeleteChallengeModal;
