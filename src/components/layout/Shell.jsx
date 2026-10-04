import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar.jsx";
import { TopNav } from "./TopNav.jsx";
import { useNavigation } from "../../hooks/useNavigation.js";
import { focusFirstSidebarItem, handleSidebarKeyDown } from "../../utils/sidebarFocus.js";

export function Shell({ children, language, onToggleLanguage, onNewChallenge }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const { currentScreen } = useNavigation();
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const wasSidebarOpenRef = useRef(false);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) {
      if (wasSidebarOpenRef.current) menuButtonRef.current?.focus();
      wasSidebarOpenRef.current = false;
      return undefined;
    }

    wasSidebarOpenRef.current = true;
    focusFirstSidebarItem(sidebarRef.current);
    const handleKeyDown = (event) => handleSidebarKeyDown(event, sidebarRef.current, closeSidebar);
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen, closeSidebar]);

  useEffect(() => {
    closeSidebar();
  }, [currentScreen, closeSidebar]);

  return (
    <div className="app-layout">
      <Sidebar 
        isOpen={isSidebarOpen} 
        isMobile={isMobileLayout}
        onClose={closeSidebar}
        sidebarRef={sidebarRef}
      />

      <div className="main-wrapper">
        <TopNav 
          isSidebarOpen={isSidebarOpen}
          menuButtonRef={menuButtonRef}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          language={language}
          onToggleLanguage={onToggleLanguage}
          onNewChallenge={onNewChallenge}
        />

        <main className="content-area" id="main" tabIndex="-1">
          <div className="content-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
