function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDateByMonths(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const target = new Date(year, month + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

  target.setDate(Math.min(day, lastDay));
  return toDateString(target);
}

export function getPreviousMonthComparisonRange(from: string, to: string) {
  return {
    from: shiftDateByMonths(from, -1),
    to: shiftDateByMonths(to, -1),
  };
}
