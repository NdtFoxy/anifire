"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Eye,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import CampaignDrawer from "./CampaignDrawer";
import {
  archiveCampaign,
  fetchAdStats,
  fetchCampaigns,
  updateCampaign,
  type AdCampaign,
  type AdStats,
  type StatsPeriod,
} from "@/lib/ads-admin";
import styles from "@/app/admin/admin.module.css";

/**
 * Advertising: delivery numbers on top, the campaign list underneath.
 *
 * The console never decides what a viewer sees — the server picks a creative per
 * request. This screen is the operator's side of that: what is eligible to run,
 * how hard it is running, and one click to stop it.
 */

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "24h", label: "24 ч" },
  { key: "7d", label: "7 дней" },
  { key: "30d", label: "30 дней" },
];

const int = (n: number) => (n ?? 0).toLocaleString("ru-RU");
/** The server sends percentages already multiplied out, so only the sign is added. */
const pct = (n: number) => `${n ?? 0}%`;

const flight = (campaign: AdCampaign) => {
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : null;
  const from = day(campaign.startsAt);
  const to = day(campaign.endsAt);
  if (!from && !to) return "без ограничений";
  return `${from ?? "—"} → ${to ?? "без даты"}`;
};

/**
 * Daily impressions and clicks, drawn by hand.
 *
 * `preserveAspectRatio="none"` lets the chart stretch to any column width down
 * to 280px without a media query; it is safe here because the drawing is nothing
 * but filled rectangles — no text and no strokes to distort. Clicks run two
 * orders of magnitude below impressions, so each series is scaled against its
 * own peak and the legend says so; a shared axis would flatten clicks to zero.
 */
function DailyChart({ daily }: { daily: AdStats["daily"] }) {
  if (daily.length === 0) {
    return <p className={styles.geoHint}>За этот период показов пока нет.</p>;
  }

  // A 24h window holds a single day, and one full-width slab reads as a block of
  // colour rather than a measurement, so slots are capped and the series centred.
  const slot = Math.min(100 / daily.length, 12);
  const offset = (100 - slot * daily.length) / 2;
  const maxImpressions = Math.max(1, ...daily.map((d) => d.impressions));
  const maxClicks = Math.max(1, ...daily.map((d) => d.clicks));
  const bar = (value: number, max: number) => (value > 0 ? Math.max(0.8, (value / max) * 30) : 0);

  return (
    <>
      <svg
        className={styles.adChart}
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Показы и клики по дням (дней: ${daily.length}), пик показов: ${maxImpressions}`}
      >
        {daily.map((day, i) => {
          const impressions = bar(day.impressions, maxImpressions);
          const clicks = bar(day.clicks, maxClicks);
          return (
            <g key={day.date}>
              <rect
                className={styles.adBarImpressions}
                x={offset + i * slot + slot * 0.1}
                y={32 - impressions}
                width={slot * 0.38}
                height={impressions}
              >
                <title>{`${day.date}: показов — ${int(day.impressions)}`}</title>
              </rect>
              <rect
                className={styles.adBarClicks}
                x={offset + i * slot + slot * 0.52}
                y={32 - clicks}
                width={slot * 0.38}
                height={clicks}
              >
                <title>{`${day.date}: кликов — ${int(day.clicks)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <footer className={styles.cardFoot}>
        <span className={styles.chartLegend}>
          <i data-series="impressions" /> показы (пик {int(maxImpressions)})
          <i data-series="clicks" /> клики, своя шкала (пик {int(maxClicks)})
        </span>
        <span>
          {daily[0].date} → {daily[daily.length - 1].date}
        </span>
      </footer>
    </>
  );
}

export default function AdsSection() {
  const [period, setPeriod] = useState<StatsPeriod>("7d");
  // The answer carries the period it was fetched for, so "loading" is a
  // comparison during render instead of a flag written from an effect.
  const [loaded, setLoaded] = useState<{
    period: StatsPeriod;
    stats: AdStats | null;
    campaigns: AdCampaign[];
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<AdCampaign | "new" | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<number | null>(null);

  const stats = loaded?.stats ?? null;
  const campaigns = useMemo(() => loaded?.campaigns ?? [], [loaded]);
  const loading = loaded?.period !== period;

  // A promise chain, not async/await: the state writes belong in the callback,
  // never in the straight-line body the mount effect calls into.
  const load = useCallback(
    () =>
      Promise.all([fetchAdStats(period), fetchCampaigns()]).then(
        ([nextStats, nextCampaigns]) => {
          setLoaded({ period, stats: nextStats, campaigns: nextCampaigns });
          setNotice(nextStats === null ? "Не удалось загрузить статистику показов." : null);
        }
      ),
    [period]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(
    () => [
      {
        label: "Показы",
        value: stats ? int(stats.impressions) : "—",
        hint: stats ? `досмотрели до конца: ${int(stats.completes)}` : "",
        Icon: Eye,
      },
      {
        label: "Досматриваемость",
        value: stats ? pct(stats.completionRate) : "—",
        hint: stats ? `пропущено: ${int(stats.skips)}` : "",
        Icon: PlayCircle,
      },
      {
        label: "CTR",
        value: stats ? pct(stats.ctr) : "—",
        hint: stats ? `кликов: ${int(stats.clicks)}` : "",
        Icon: BarChart3,
      },
      {
        label: "Клики",
        value: stats ? int(stats.clicks) : "—",
        hint: `${campaigns.filter((c) => c.status === "ACTIVE").length} — активных кампаний`,
        Icon: MousePointerClick,
      },
    ],
    [stats, campaigns]
  );

  const blocked = stats?.blocked;
  const blockedTotal = (blocked?.creativesWithoutOrdToken ?? 0) + (blocked?.inactiveCreatives ?? 0);

  /**
   * Status changes reuse the campaign PUT, so the whole row goes back. That is
   * deliberate: one write path means pausing from the list and saving from the
   * drawer cannot drift apart.
   */
  async function setStatus(campaign: AdCampaign, status: AdCampaign["status"]) {
    setBusyId(campaign.id);
    setNotice(null);
    const outcome = await updateCampaign(campaign.id, {
      name: campaign.name,
      advertiser: campaign.advertiser,
      advertiserInn: campaign.advertiserInn,
      status,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      dailyImpressionCap: campaign.dailyImpressionCap,
      priority: campaign.priority,
    });
    setBusyId(null);
    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    await load();
  }

  async function archive(id: number) {
    setBusyId(id);
    setNotice(null);
    const outcome = await archiveCampaign(id);
    setBusyId(null);
    setConfirmArchive(null);
    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    await load();
  }

  return (
    <div className={styles.adsWrap}>
      <header className={styles.sectionHead}>
        <div>
          <h2>
            <Megaphone size={20} /> Реклама
          </h2>
          <p>
            Преролл для зрителей без подписки. Выбор креатива происходит на сервере при
            каждом запросе — в браузере ничего не решается.
          </p>
        </div>
        <div className={styles.geoStats}>
          <div className={styles.periodChips} role="group" aria-label="Период статистики">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                data-on={period === key}
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.btnGhost} onClick={load} disabled={loading}>
            {loading ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />}
            Обновить
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setDrawer("new")}>
            <Plus size={15} /> Новая кампания
          </button>
        </div>
      </header>

      {notice ? <div className={styles.notice}>{notice}</div> : null}

      <div className={styles.kpiGrid}>
        {kpis.map(({ label, value, hint, Icon }) => (
          <article key={label} className={styles.kpi}>
            <header>
              <span>{label}</span>
              <i>
                <Icon size={16} />
              </i>
            </header>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      {/* Low fill has a cause, and the operator should read it here rather than
          discover it by opening every campaign in turn. */}
      {blocked && blockedTotal > 0 ? (
        <div className={styles.blockedBanner}>
          <ShieldAlert size={16} />
          <span>
            {blocked.creativesWithoutOrdToken > 0 ? (
              <b>
                {blocked.creativesWithoutOrdToken} креатив(ов) без токена ОРД — не размечено, не
                выдаётся.
              </b>
            ) : null}{" "}
            {blocked.inactiveCreatives > 0
              ? `Отключено креативов: ${blocked.inactiveCreatives} — они не выдаются.`
              : ""}
          </span>
        </div>
      ) : null}

      <section className={styles.card}>
        <h3>
          <BarChart3 size={16} /> Показы за период: {period}
        </h3>
        <DailyChart daily={stats?.daily ?? []} />

        {stats && stats.byCampaign.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Показы</th>
                  <th>Досмотрено</th>
                  <th>Пропущено</th>
                  <th>Клики</th>
                </tr>
              </thead>
              <tbody>
                {stats.byCampaign.map((row) => (
                  <tr key={row.campaignId}>
                    <td data-label="Кампания">
                      <span className={styles.userName}>{row.name}</span>
                    </td>
                    <td data-label="Показы">{int(row.impressions)}</td>
                    <td data-label="Досмотрено">{int(row.completes)}</td>
                    <td data-label="Пропущено">{int(row.skips)}</td>
                    <td data-label="Клики">{int(row.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h3>
            {campaigns.length} — кампаний{campaigns.length === 1 ? "" : "s"}
          </h3>
          {loading ? <Loader2 size={15} className={styles.spin} /> : null}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Кампания</th>
                <th>Статус</th>
                <th>Приоритет</th>
                <th>Лимит в день</th>
                <th>Период</th>
                <th>Креативы</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td data-label="Кампания">
                    <span className={styles.userName}>{campaign.name}</span>
                    <small>
                      {campaign.advertiser} · ИНН {campaign.advertiserInn}
                    </small>
                  </td>
                  <td data-label="Статус">
                    <span className={styles.statusChip} data-status={campaign.status}>
                      {campaign.status}
                    </span>
                  </td>
                  <td data-label="Приоритет">
                    <span className={styles.activityCell}>{campaign.priority}</span>
                  </td>
                  <td data-label="Лимит в день">
                    <span className={styles.activityCell}>
                      {campaign.dailyImpressionCap > 0
                        ? int(campaign.dailyImpressionCap)
                        : "без лимита"}
                    </span>
                  </td>
                  <td data-label="Период">
                    <span className={styles.activityCell}>{flight(campaign)}</span>
                  </td>
                  <td data-label="Креативы">
                    <span className={styles.activityCell}>{campaign.creativeCount}</span>
                  </td>
                  <td data-label="Действия">
                    <div className={styles.rowActions}>
                      {confirmArchive === campaign.id ? (
                        <>
                          <button
                            type="button"
                            className={styles.btnDanger}
                            disabled={busyId === campaign.id}
                            onClick={() => archive(campaign.id)}
                          >
                            {busyId === campaign.id ? (
                              <Loader2 size={14} className={styles.spin} />
                            ) : null}
                            В архив
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => setConfirmArchive(null)}
                          >
                            Оставить
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => setDrawer(campaign)}
                            aria-label={`Изменить «${campaign.name}»`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            disabled={busyId === campaign.id || campaign.status === "ARCHIVED"}
                            onClick={() =>
                              setStatus(
                                campaign,
                                campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
                              )
                            }
                            aria-label={
                              campaign.status === "ACTIVE"
                                ? `Приостановить «${campaign.name}»`
                                : `Запустить «${campaign.name}»`
                            }
                          >
                            {busyId === campaign.id ? (
                              <Loader2 size={15} className={styles.spin} />
                            ) : campaign.status === "ACTIVE" ? (
                              <Pause size={15} />
                            ) : (
                              <Play size={15} />
                            )}
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            data-tone="bad"
                            disabled={campaign.status === "ARCHIVED"}
                            onClick={() => setConfirmArchive(campaign.id)}
                            aria-label={`Архивировать «${campaign.name}»`}
                          >
                            <Archive size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className={styles.emptyCell}>
                    Кампаний пока нет. Зрители видят плеер без преролла, пока не появится
                    активная кампания с креативом.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Keyed per campaign: the drawer re-mounts with the right form values. */}
      {drawer !== null ? (
        <CampaignDrawer
          key={drawer === "new" ? "new" : drawer.id}
          campaign={drawer}
          onClose={() => setDrawer(null)}
          onSaved={load}
        />
      ) : null}
    </div>
  );
}
