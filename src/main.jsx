import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.jsx";
import { AppProviders } from "./contexts/AppProviders.jsx";

import "./styles/variables.css";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/modals.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>
  );
}

