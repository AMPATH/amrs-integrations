export function getMonthStartDate(date: Date): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthStartDate = new Date(year, month, 1);
  return monthStartDate;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
