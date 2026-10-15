import { formatDate } from "@/lib/dates";
import type { WishList } from "./queries";

export function birthdayText(list: Pick<WishList, "birthday">): string | null {
  if (!list.birthday) return null;
  const { days, date } = list.birthday;
  if (days === 0) return "Birthday today!";
  if (days === 1) return "Birthday tomorrow";
  return `Birthday in ${days} days · ${formatDate(date).slice(0, 5)}`;
}
