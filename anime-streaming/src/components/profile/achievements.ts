import {
  BadgeCheck,
  CalendarClock,
  Flame,
  Gem,
  Heart,
  MessageCircle,
  Shield,
  Sparkles,
  Star,
  Sword,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Profile } from "@/lib/auth-client";
import { daysSince } from "./format";

export interface Award {
  id: string;
  label: string;
  /** Shown when unlocked. */
  description: string;
  /** Shown on the locked chip / tooltip. */
  requirement: string;
  Icon: LucideIcon;
  color: string;
  unlocked: boolean;
  /** 0-1, how close the user is. Used for the locked progress hairline. */
  progress: number;
}

const EMBER = "#ff4d5a";
const GOLD = "#f7c744";
const STEEL = "#7cc4ff";
const VIOLET = "#b58cff";
const MINT = "#5fd4a4";

function ratio(value: number, target: number): number {
  return Math.max(0, Math.min(1, target <= 0 ? 1 : value / target));
}

/**
 * Every award is a pure function of the persisted profile — no fixture data.
 * Locked entries keep their requirement text so the UI can explain itself.
 */
export function deriveAwards(profile: Profile): Award[] {
  const age = daysSince(profile.createdAt);
  const comments = profile.commentsCount;
  const points = profile.points;

  return [
    {
      id: "member",
      label: "Участник Anifire",
      description: `Дней с регистрации: ${age}.`,
      requirement: "Создайте аккаунт Anifire",
      Icon: Trophy,
      color: GOLD,
      unlocked: true,
      progress: 1,
    },
    {
      id: "verified",
      label: "Подтверждён",
      description: "Ваш email подтверждён.",
      requirement: "Подтвердите email",
      Icon: BadgeCheck,
      color: MINT,
      unlocked: profile.emailVerified,
      progress: profile.emailVerified ? 1 : 0,
    },
    {
      id: "voice",
      label: "Голос сообщества",
      description: `Комментариев оставлено: ${comments}.`,
      requirement: "Оставьте 10 комментариев",
      Icon: MessageCircle,
      color: STEEL,
      unlocked: comments >= 10,
      progress: ratio(comments, 10),
    },
    {
      id: "loremaster",
      label: "Хранитель знаний",
      description: `Комментариев: ${comments} — архив внимает.`,
      requirement: "Оставьте 100 комментариев",
      Icon: Sword,
      color: EMBER,
      unlocked: comments >= 100,
      progress: ratio(comments, 100),
    },
    {
      id: "spark",
      label: "Первая искра",
      description: `Заработано очков: ${points}.`,
      requirement: "Заработайте 500 очков",
      Icon: Sparkles,
      color: GOLD,
      unlocked: points >= 500,
      progress: ratio(points, 500),
    },
    {
      id: "inferno",
      label: "Инферно",
      description: `Очков: ${points} — пламя ревёт.`,
      requirement: "Earn 5,000 points",
      Icon: Flame,
      color: EMBER,
      unlocked: points >= 5000,
      progress: ratio(points, 5000),
    },
    {
      id: "ascended",
      label: "Вознёсшийся",
      description: `Уровень ${profile.level}.`,
      requirement: "Достигните 10-го уровня",
      Icon: Star,
      color: VIOLET,
      unlocked: profile.level >= 10,
      progress: ratio(profile.level, 10),
    },
    {
      id: "veteran",
      label: "Ветеран",
      description: "Уже больше года с Anifire.",
      requirement: "Пользуйтесь аккаунтом 365 дней",
      Icon: CalendarClock,
      color: STEEL,
      unlocked: age >= 365,
      progress: ratio(age, 365),
    },
    {
      id: "beloved",
      label: "Любимчик",
      description: `Получено лайков: ${profile.likes}.`,
      requirement: "Получите 50 лайков",
      Icon: Heart,
      color: EMBER,
      unlocked: profile.likes >= 50,
      progress: ratio(profile.likes, 50),
    },
    {
      id: "social",
      label: "Не в одиночку",
      description: `Друзей: ${profile.friends}.`,
      requirement: "Заведите 5 друзей",
      Icon: Users,
      color: MINT,
      unlocked: profile.friends >= 5,
      progress: ratio(profile.friends, 5),
    },
    {
      id: "supporter",
      label: "Поддержка проекта",
      description: "На вашем аккаунте активен просмотр без рекламы.",
      requirement: "Оформите доступ без рекламы",
      Icon: Gem,
      color: VIOLET,
      unlocked: profile.adsFree,
      progress: profile.adsFree ? 1 : 0,
    },
    {
      id: "guardian",
      label: "Страж",
      description: "Администратор Anifire.",
      requirement: "Получите роль администратора",
      Icon: Shield,
      color: GOLD,
      unlocked: profile.role === "ADMIN",
      progress: profile.role === "ADMIN" ? 1 : 0,
    },
  ];
}
