import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import Duration from 'dayjs/plugin/duration';
import IsBetween from 'dayjs/plugin/isBetween';
import LocalizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');
dayjs.extend(LocalizedFormat);
dayjs.extend(Duration);
dayjs.extend(IsBetween);

export const day = dayjs;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
