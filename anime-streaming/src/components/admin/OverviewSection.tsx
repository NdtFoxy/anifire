"use client";

import { Film, Eye, MessageCircle, Users2, TrendingUp, Layers } from "lucide-react";
import type { AdminAnalytics } from "@/data/animeApi";
import styles from "@/app/admin/admin.module.css";

/** Dashboard: the numbers an operator checks first, all from real tables. */
export default function OverviewSection({ analytics }: { analytics: AdminAnalytics | null }) {
  if (!analytics) {
    return (
      <div className={styles.kpiGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className={styles.kpiSkeleton} />
        ))}
      </div>
    );
  }

  const verifiedRate = analytics.users.total
    ? Math.round((analytics.users.verified / analytics.users.total) * 100)
    : 0;
  const maxDaily = Math.max(1, ...analytics.dailyViews.map((d) => d.views));
  const maxCategory = Math.max(1, ...analytics.categories.map((c) => c.animeCount));

  const kpis = [
    {
      label: "Зрители",
      value: analytics.users.total,
      hint: `${verifiedRate}% подтверждено`,
      Icon: Users2,
    },
    { label: "Тайтлы", value: analytics.content.anime, hint: `категорий: ${analytics.content.categories}`, Icon: Film },
    {
      label: "Просмотры (7 дн.)",
      value: analytics.watch.views7d,
      hint: `уникальных: ${analytics.watch.uniqueViewers7d}`,
      Icon: Eye,
    },
    {
      label: "Комментарии",
      value: analytics.content.comments,
      hint: `${analytics.content.averageCommentsPerAnime.toFixed(1)} на тайтл`,
      Icon: MessageCircle,
    },
  ];

  return (
    <div className={styles.overview}>
      <div className={styles.kpiGrid}>
        {kpis.map(({ label, value, hint, Icon }) => (
          <article key={label} className={styles.kpi}>
            <header>
              <span>{label}</span>
              <i>
                <Icon size={16} />
              </i>
            </header>
            <strong>{value.toLocaleString("ru-RU")}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      <div className={styles.panelGrid}>
        <section className={styles.card}>
          <h3>
            <TrendingUp size={16} /> Просмотры, дней: {analytics.dailyViews.length} 
          </h3>
          <div className={styles.bars}>
            {analytics.dailyViews.map((day) => (
              <span
                key={day.date}
                className={styles.bar}
                style={{ height: `${Math.max(4, (day.views / maxDaily) * 100)}%` }}
                title={`${day.date}: ${day.views}`}
              />
            ))}
          </div>
          <footer className={styles.cardFoot}>
            <span>{analytics.watch.totalViews.toLocaleString("ru-RU")} за всё время</span>
            <span>{analytics.watch.viewsToday} сегодня</span>
          </footer>
        </section>

        <section className={styles.card}>
          <h3>
            <Layers size={16} /> Каталог по категориям
          </h3>
          <ul className={styles.meters}>
            {analytics.categories.slice(0, 8).map((category) => (
              <li key={category.id}>
                <span>{category.name}</span>
                <span className={styles.meterTrack}>
                  <span style={{ width: `${(category.animeCount / maxCategory) * 100}%` }} />
                </span>
                <b>{category.animeCount}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h3>Самое популярное</h3>
          <ol className={styles.topList}>
            {analytics.topAnime.slice(0, 8).map((row, i) => (
              <li key={row.animeKey}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.topTitle}>{row.title}</span>
                <b>{row.views}</b>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
