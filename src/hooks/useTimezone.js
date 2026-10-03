import { useContext } from "react";
import { TimezoneContext } from "../contexts/TimezoneContext.jsx";

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (!context) throw new Error("useTimezone must be used within a TimezoneProvider");
  return context;
}
