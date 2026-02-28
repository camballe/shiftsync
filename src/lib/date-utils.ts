/**
 * Date utility functions to handle date formatting without timezone conversion issues
 *
 * The problem: Date.toISOString() always converts to UTC, which can shift dates
 * across day boundaries when users are in different timezones.
 *
 * Solution: Use local date parts (getFullYear, getMonth, getDate) which don't
 * perform timezone conversion.
 */

/**
 * Format a Date object to YYYY-MM-DD string using local date parts
 * This avoids timezone conversion issues that occur with toISOString()
 *
 * @param date - The Date object to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object at local midnight
 * This avoids timezone issues when creating Date objects from date strings
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object set to local midnight
 */
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 * @returns Today's date in YYYY-MM-DD format
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Add days to a date and return YYYY-MM-DD string
 * @param dateStr - Starting date in YYYY-MM-DD format
 * @param days - Number of days to add (can be negative)
 * @returns New date in YYYY-MM-DD format
 */
export function addDays(dateStr: string, days: number): string {
  const date = parseDateLocal(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateLocal(date);
}
