import { useEffect, useState } from "react";
export function useLiveRefresh() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener("farmrelay:data-changed", update);
    return () => window.removeEventListener("farmrelay:data-changed", update);
  }, []);
  return version;
}
