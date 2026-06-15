import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { enableKioskMode, KIOSK_HOME_PATH } from "../../lib/kioskMode";

export default function KioskEntryRoute() {
  useEffect(() => {
    enableKioskMode();
  }, []);

  enableKioskMode();

  return <Navigate to={KIOSK_HOME_PATH} replace />;
}
