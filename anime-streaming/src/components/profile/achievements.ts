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
      label: "Anifire member",
      description: `Joined ${age} day${age === 1 ? "" : "s"} ago.`,
      requirement: "Create an Anifire account",
      Icon: Trophy,
      color: GOLD,
      unlocked: true,
      progress: 1,
    },
    {
      id: "verified",
      label: "Verified",
      description: "Your email address is confirmed.",
      requirement: "Confirm your email address",
      Icon: BadgeCheck,
      color: MINT,
      unlocked: profile.emailVerified,
      progress: profile.emailVerified ? 1 : 0,
    },
    {
      id: "voice",
      label: "Voice of the community",
      description: `${comments} comments posted.`,
      requirement: "Post 10 comments",
      Icon: MessageCircle,
      color: STEEL,
      unlocked: comments >= 10,
      progress: ratio(comments, 10),
    },
    {
      id: "loremaster",
      label: "Loremaster",
      description: `${comments} comments — the archive listens.`,
      requirement: "Post 100 comments",
      Icon: Sword,
      color: EMBER,
      unlocked: comments >= 100,
      progress: ratio(comments, 100),
    },
    {
      id: "spark",
      label: "First spark",
      description: `${points} points earned.`,
      requirement: "Earn 500 points",
      Icon: Sparkles,
      color: GOLD,
      unlocked: points >= 500,
      progress: ratio(points, 500),
    },
    {
      id: "inferno",
      label: "Inferno",
      description: `${points} points — the furnace roars.`,
      requirement: "Earn 5,000 points",
      Icon: Flame,
      color: EMBER,
      unlocked: points >= 5000,
      progress: ratio(points, 5000),
    },
    {
      id: "ascended",
      label: "Ascended",
      description: `Level ${profile.level}.`,
      requirement: "Reach level 10",
      Icon: Star,
      color: VIOLET,
      unlocked: profile.level >= 10,
      progress: ratio(profile.level, 10),
    },
    {
      id: "veteran",
      label: "Veteran",
      description: "A year and counting with Anifire.",
      requirement: "Keep your account for 365 days",
      Icon: CalendarClock,
      color: STEEL,
      unlocked: age >= 365,
      progress: ratio(age, 365),
    },
    {
      id: "beloved",
      label: "Beloved",
      description: `${profile.likes} likes received.`,
      requirement: "Receive 50 likes",
      Icon: Heart,
      color: EMBER,
      unlocked: profile.likes >= 50,
      progress: ratio(profile.likes, 50),
    },
    {
      id: "social",
      label: "Not alone",
      description: `${profile.friends} friends.`,
      requirement: "Make 5 friends",
      Icon: Users,
      color: MINT,
      unlocked: profile.friends >= 5,
      progress: ratio(profile.friends, 5),
    },
    {
      id: "supporter",
      label: "Supporter",
      description: "Ad-free playback is active on your account.",
      requirement: "Hold an active ad-free entitlement",
      Icon: Gem,
      color: VIOLET,
      unlocked: profile.adsFree,
      progress: profile.adsFree ? 1 : 0,
    },
    {
      id: "guardian",
      label: "Guardian",
      description: "Administrator of Anifire.",
      requirement: "Be granted the ADMIN role",
      Icon: Shield,
      color: GOLD,
      unlocked: profile.role === "ADMIN",
      progress: profile.role === "ADMIN" ? 1 : 0,
    },
  ];
}
