export interface Movie {
  id: number;
  malId?: number;
  title: string;
  description: string;
  year: string;
  rating: string;
  duration: string;
  genre: string;
  match: number;
  imageUrl: string;
  heroImageUrl: string;
  logoImageUrl?: string;
  tags: string[];
  /** True when `title`/`description` are the Russian localization. */
  localized?: boolean;
  /** Stored catalogue values, for editing and for lookups by romaji / English title. */
  originalTitle?: string;
  titleEn?: string;
  originalDescription?: string;
  originalImageUrl?: string;
}

export const NAV_ITEMS = [
  { label: "Главная", href: "/stream" },
  { label: "Жанры", href: "#genres" },
  { label: "Моё", href: "#my-list" },
];

export const MOCK_MOVIES: Movie[] = [
  {
    id: 1,
    title: "Дуэль теней",
    description:
      "Два воина с противоположными силами сходятся в последней битве под дождём. Тьма и свет сплетаются в схватке, которая решит судьбу мира.",
    year: "2024",
    rating: "18+",
    duration: "24 мин",
    genre: "Экшен • Сёнэн",
    match: 98,
    imageUrl: "/hero-1.png",
    heroImageUrl: "/hero-1.png",
    tags: ["Напряжённое", "Сверхъестественное", "Соперничество"],
  },
  {
    id: 2,
    title: "Огненный клинок",
    description:
      "Юный мечник овладевает запретной техникой огненного дыхания. Теперь его клинок пылает, а враги трепещут перед силой пламени.",
    year: "2023",
    rating: "16+",
    duration: "22 мин",
    genre: "Фэнтези • Экшен",
    match: 95,
    imageUrl: "/hero-2.png",
    heroImageUrl: "/hero-2.png",
    tags: ["Эпик", "Самураи", "Фэнтези"],
  },
  {
    id: 3,
    title: "Сокрушитель стен",
    description:
      "Человечество укрылось за стенами от гигантских существ. Но стены рушатся, и последняя надежда — отряд бесстрашных разведчиков.",
    year: "2013",
    rating: "18+",
    duration: "24 мин",
    genre: "Тёмное фэнтези • Драма",
    match: 97,
    imageUrl: "/hero-3.png",
    heroImageUrl: "/hero-3.png",
    tags: ["Мрачное", "Выживание", "Драма"],
  },
  {
    id: 4,
    title: "Багровый дождь",
    description:
      "После катастрофы мир погрузился во тьму. Единственный луч света — девушка с древней силой, способной остановить бесконечный дождь.",
    year: "2025",
    rating: "16+",
    duration: "23 мин",
    genre: "Фантастика • Детектив",
    match: 92,
    imageUrl: "/hero-1.png",
    heroImageUrl: "/hero-1.png",
    tags: ["Детектив", "Постапокалипсис", "Суперсилы"],
  },
  {
    id: 5,
    title: "Neon Genesis",
    description:
      "В недалёком будущем мир стоит на грани гибели. Подростки пилотируют гигантских роботов в войне против ангелов.",
    year: "1995",
    rating: "16+",
    duration: "24 мин",
    genre: "Меха • Психологическое",
    match: 90,
    imageUrl: "/hero-3.png",
    heroImageUrl: "/hero-3.png",
    tags: ["Меха", "Психологическое", "Классика"],
  },
  {
    id: 6,
    title: "Тёмный охотник",
    description:
      "Охотник на демонов странствует по проклятым землям в поисках последнего артефакта. Каждая ночь приносит новые ужасы и более опасную добычу.",
    year: "2024",
    rating: "18+",
    duration: "25 мин",
    genre: "Ужасы • Сверхъестественное",
    match: 88,
    imageUrl: "/hero-2.png",
    heroImageUrl: "/hero-2.png",
    tags: ["Ужасы", "Сверхъестественное", "Экшен"],
  },
];

export interface Row {
  title: string;
  items: Movie[];
}

const byId = (...ids: number[]) =>
  ids.map((id) => MOCK_MOVIES.find((m) => m.id === id)!).filter(Boolean);

export const ROWS: Row[] = [
  { title: "Сейчас в тренде", items: MOCK_MOVIES },
  { title: "Экшен и приключения", items: byId(1, 2, 6, 3, 4) },
  { title: "Новинки", items: byId(4, 1, 6, 2, 3) },
  { title: "Потому что вы смотрели «Огненный клинок»", items: byId(2, 3, 5, 1, 6, 4) },
];
