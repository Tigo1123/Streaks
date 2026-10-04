import React, { createContext, useState, useEffect, useCallback, useRef } from "react";

export const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
  const [currentScreen, setCurrentScreen] = useState("dashboard"); // "dashboard" | "detail"
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | "create" | "delete" | "auth" | "backup" | "sync" | "timezone" | "settings"
  const [modalParams, setModalParams] = useState(null);

  const modalRef = useRef(modalMode);
  modalRef.current = modalMode;

  // Initialize from history state on load
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initial = window.history.state;
    if (initial?.streaksScreen === "detail" && initial.challengeId) {
      setCurrentScreen("detail");
      setSelectedChallengeId(initial.challengeId);
    }
  }, []);

  // Listen to popstate event (hardware back button / browser back)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (e) => {
      // 1. If a modal is open, back button dismisses modal first
      if (modalRef.current) {
        setModalMode(null);
        setModalParams(null);
        return;
      }

      // 2. Screen navigation
      const state = e.state;
      if (state?.streaksScreen === "detail" && state.challengeId) {
        setCurrentScreen("detail");
        setSelectedChallengeId(state.challengeId);
      } else {
        setCurrentScreen("dashboard");
        setSelectedChallengeId(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openChallenge = useCallback((id) => {
    if (typeof window !== "undefined") {
      window.history.pushState({ streaksScreen: "detail", challengeId: id }, "");
    }
    setCurrentScreen("detail");
    setSelectedChallengeId(id);
  }, []);

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.streaksScreen === "detail") {
      window.history.back();
    } else {
      setCurrentScreen("dashboard");
      setSelectedChallengeId(null);
    }
  }, []);

  const openModal = useCallback((mode, params = null) => {
    if (typeof window !== "undefined") {
      window.history.pushState({ streaksModal: true, modalMode: mode }, "");
    }
    setModalMode(mode);
    setModalParams(params);
  }, []);

  const closeModal = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.streaksModal) {
      window.history.back();
    } else {
      setModalMode(null);
      setModalParams(null);
    }
  }, []);

  const value = {
    currentScreen,
    isDetail: currentScreen === "detail",
    isDashboard: currentScreen === "dashboard",
    selectedChallengeId,
    modalMode,
    modalParams,
    isModalOpen: Boolean(modalMode),
    openChallenge,
    goToDetail: openChallenge,
    goBack,
    openModal,
    closeModal
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
