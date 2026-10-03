import React, { useState } from "react";
import { Sidebar } from "./Sidebar.jsx";
import { TopNav } from "./TopNav.jsx";

export function Shell({ children, language, onToggleLanguage, onNewChallenge }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <div className="main-wrapper">
        <TopNav 
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
