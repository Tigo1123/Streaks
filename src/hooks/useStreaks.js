import { useContext } from "react";
import { StreaksContext } from "../contexts/StreaksContext.jsx";

export function useStreaks() {
  const context = useContext(StreaksContext);
  if (!context) {
    throw new Error("useStreaks must be used within a StreaksProvider");
  }
  return context;
}
