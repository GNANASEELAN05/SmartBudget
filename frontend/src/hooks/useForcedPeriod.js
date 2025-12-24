// frontend/src/hooks/useForcedPeriod.js
import { useEffect, useState } from "react";

/**
 * useForcedPeriod(forcedMonth, forcedYear)
 * - forcedMonth: 0..11 or null
 * - forcedYear: number or null
 * - Returns: [month, setMonth, year, setYear]
 */
export default function useForcedPeriod(
  forcedMonth = null,
  forcedYear = null
) {
  const now = new Date();

  const [month, setMonth] = useState(
    forcedMonth !== null ? Number(forcedMonth) : now.getMonth()
  );
  const [year, setYear] = useState(
    forcedYear !== null ? Number(forcedYear) : now.getFullYear()
  );

  // Sync month when forcedMonth changes (Export page)
  useEffect(() => {
    if (forcedMonth !== null && forcedMonth !== undefined) {
      setMonth(Number(forcedMonth));
    }
  }, [forcedMonth]);

  // Sync year when forcedYear changes (Export page)
  useEffect(() => {
    if (forcedYear !== null && forcedYear !== undefined) {
      setYear(Number(forcedYear));
    }
  }, [forcedYear]);

  return [month, setMonth, year, setYear];
}
