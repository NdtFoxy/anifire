package com.example.animebackend.catalog;

import java.util.Map;

/**
 * Russian names for the MyAnimeList genre / theme / demographic vocabulary that
 * Jikan returns. The single source of truth: imports name categories with it, and
 * {@link CatalogImportService#localizeCategories()} renames rows created earlier
 * with the English name.
 */
public final class GenreNames {

    private GenreNames() {}

    public static final String TOP = "Топ аниме";

    private static final Map<String, String> RU = Map.ofEntries(
            Map.entry("Top Anime", TOP),
            // genres
            Map.entry("Action", "Экшен"),
            Map.entry("Adventure", "Приключения"),
            Map.entry("Avant Garde", "Авангард"),
            Map.entry("Award Winning", "Отмечено наградами"),
            Map.entry("Boys Love", "Сёнэн-ай"),
            Map.entry("Comedy", "Комедия"),
            Map.entry("Drama", "Драма"),
            Map.entry("Ecchi", "Этти"),
            Map.entry("Erotica", "Эротика"),
            Map.entry("Fantasy", "Фэнтези"),
            Map.entry("Girls Love", "Сёдзё-ай"),
            Map.entry("Gourmet", "Гурман"),
            Map.entry("Hentai", "Хентай"),
            Map.entry("Horror", "Ужасы"),
            Map.entry("Mystery", "Мистика"),
            Map.entry("Romance", "Романтика"),
            Map.entry("Sci-Fi", "Фантастика"),
            Map.entry("Slice of Life", "Повседневность"),
            Map.entry("Sports", "Спорт"),
            Map.entry("Supernatural", "Сверхъестественное"),
            Map.entry("Suspense", "Триллер"),
            // themes
            Map.entry("Adult Cast", "Взрослые персонажи"),
            Map.entry("Anthropomorphic", "Антропоморфизм"),
            Map.entry("CGDCT", "Милые девушки"),
            Map.entry("Childcare", "Забота о детях"),
            Map.entry("Combat Sports", "Единоборства"),
            Map.entry("Crossdressing", "Переодевание"),
            Map.entry("Delinquents", "Хулиганы"),
            Map.entry("Detective", "Детектив"),
            Map.entry("Educational", "Образовательное"),
            Map.entry("Gag Humor", "Абсурдный юмор"),
            Map.entry("Gore", "Жестокость"),
            Map.entry("Harem", "Гарем"),
            Map.entry("High Stakes Game", "Игры со ставками"),
            Map.entry("Historical", "Исторический"),
            Map.entry("Idols (Female)", "Идолы (девушки)"),
            Map.entry("Idols (Male)", "Идолы (парни)"),
            Map.entry("Isekai", "Исекай"),
            Map.entry("Iyashikei", "Иясикэй"),
            Map.entry("Love Polygon", "Любовный многоугольник"),
            Map.entry("Love Status Quo", "Неразвивающиеся отношения"),
            Map.entry("Magical Sex Shift", "Смена пола"),
            Map.entry("Mahou Shoujo", "Махо-сёдзё"),
            Map.entry("Martial Arts", "Боевые искусства"),
            Map.entry("Mecha", "Меха"),
            Map.entry("Medical", "Медицина"),
            Map.entry("Military", "Военное"),
            Map.entry("Music", "Музыка"),
            Map.entry("Mythology", "Мифология"),
            Map.entry("Organized Crime", "Организованная преступность"),
            Map.entry("Otaku Culture", "Культура отаку"),
            Map.entry("Parody", "Пародия"),
            Map.entry("Performing Arts", "Исполнительское искусство"),
            Map.entry("Pets", "Питомцы"),
            Map.entry("Psychological", "Психологическое"),
            Map.entry("Racing", "Гонки"),
            Map.entry("Reincarnation", "Перерождение"),
            Map.entry("Reverse Harem", "Обратный гарем"),
            Map.entry("Samurai", "Самураи"),
            Map.entry("School", "Школа"),
            Map.entry("Showbiz", "Шоу-бизнес"),
            Map.entry("Space", "Космос"),
            Map.entry("Strategy Game", "Стратегические игры"),
            Map.entry("Super Power", "Суперсилы"),
            Map.entry("Survival", "Выживание"),
            Map.entry("Team Sports", "Командный спорт"),
            Map.entry("Time Travel", "Путешествия во времени"),
            Map.entry("Urban Fantasy", "Городское фэнтези"),
            Map.entry("Vampire", "Вампиры"),
            Map.entry("Video Game", "Видеоигры"),
            Map.entry("Villainess", "Злодейка"),
            Map.entry("Visual Arts", "Изобразительное искусство"),
            Map.entry("Workplace", "Работа"),
            // demographics
            Map.entry("Josei", "Дзёсэй"),
            Map.entry("Kids", "Детское"),
            Map.entry("Seinen", "Сэйнэн"),
            Map.entry("Shoujo", "Сёдзё"),
            Map.entry("Shounen", "Сёнэн"));

    /** Russian name for a Jikan genre; unknown names pass through unchanged. */
    public static String ru(String name) {
        return RU.getOrDefault(name, name);
    }

    public static Map<String, String> all() {
        return RU;
    }
}
