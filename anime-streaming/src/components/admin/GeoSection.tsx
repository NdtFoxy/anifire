"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Activity,
  Eye,
  EyeOff,
  Globe2,
  History,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import WorldMap from "./WorldMap";
import {
  fetchCountryStats,
  fetchGeo,
  fetchGeoAudit,
  readSimulation,
  subscribeSimulation,
  setGeoRule,
  writeSimulation,
  type CountryStats,
  type StatsPeriod,
  type GeoAuditEntry,
  type GeoOverview,
} from "@/lib/geo";
import styles from "@/app/admin/admin.module.css";

/**
 * Country access control.
 *
 * Clicking a country toggles its rule; the enforcement itself lives in the
 * backend filter, which exempts administrators unconditionally — so an operator
 * cannot lock themselves out of the very panel they are using. To see what a
 * visitor from a blocked country actually gets, use the preview: it makes the
 * server answer *this admin's* requests as if they came from that country, and it
 * is ignored for everyone who is not an admin.
 */
export default function GeoSection() {
  const [data, setData] = useState<GeoOverview | null>(null);
  const [audit, setAudit] = useState<GeoAuditEntry[]>([]);
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{
    key: string;
    code: string;
    data: CountryStats | null;
  } | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>("all");

  // The preview lives in localStorage and is changed by `preview()` below, which
  // notifies this subscription — no effect has to copy it into state.
  const simulating = useSyncExternalStore(
    subscribeSimulation,
    readSimulation,
    () => null
  );

  // A promise chain, not async/await: state is written from the callback, and the
  // error is cleared only once fresh data is in hand.
  const load = useCallback(
    () =>
      Promise.all([fetchGeo(), fetchGeoAudit(20)])
        .then(([overview, trail]) => {
          setData(overview);
          setAudit(trail);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Не удалось загрузить гео-правила.");
        }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const blocked = useMemo(() => new Set(data?.blocked ?? []), [data]);

  // Numbers are fetched per country rather than shipped with the map: 174
  // countries of counters would be a heavy payload nobody reads at once.
  const statsKey = selected ? `${selected.code}#${period}` : null;
  // Numbers for the previous period stay on screen while the new one loads —
  // clearing them first is what made the panel (and the map above it) jump.
  const stats =
    loaded && selected && loaded.code === selected.code ? loaded.data : null;
  const statsLoading = statsKey !== null && loaded?.key !== statsKey;

  useEffect(() => {
    if (!selected || !statsKey) return;
    let cancelled = false;
    fetchCountryStats(selected.code, period).then((result) => {
      if (!cancelled) setLoaded({ key: statsKey, code: selected.code, data: result });
    });
    return () => {
      cancelled = true;
    };
  }, [selected, statsKey, data, period]);

  const toggle = async (code: string, block: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setGeoRule(code, block, note.trim() || undefined);
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить правило.");
    } finally {
      setBusy(false);
    }
  };

  const preview = (code: string | null) => writeSimulation(code);

  const isBlocked = selected ? blocked.has(selected.code) : false;

  return (
    <div className={styles.geoWrap}>
      <header className={styles.sectionHead}>
        <div>
          <h2>
            <Globe2 size={20} /> Региональный доступ
          </h2>
          <p>
            Нажмите на страну, чтобы разрешить или заблокировать её. Администраторы никогда не блокируются, поэтому
            панель доступна из любой точки мира.
          </p>
        </div>
        <div className={styles.geoStats}>
          <span>
            <b>{blocked.size}</b> заблокировано
          </span>
          <span>
            <b>{data?.refusalTotal ?? 0}</b> отклонённых запросов
          </span>
          <span data-on={data?.enabled}>
            {data?.enabled ? "Ограничения включены" : "Ограничения выключены"}
          </span>
        </div>
      </header>

      {error ? <div className={styles.notice}>{error}</div> : null}

      {simulating ? (
        <div className={styles.simBanner}>
          <EyeOff size={16} />
          Просмотр сайта глазами посетителя из страны <b>{simulating}</b>. Затрагиваются только ваши
          запросы.
          <button type="button" onClick={() => preview(null)}>
            Остановить просмотр
          </button>
        </div>
      ) : null}

      <WorldMap
        blocked={blocked}
        refusals={data?.refusals ?? {}}
        selected={selected?.code ?? null}
        onSelect={(code, name) => setSelected({ code, name })}
      />

      <div className={styles.geoPanels}>
        <section className={styles.card}>
          <h3>{selected ? `${selected.name} · ${selected.code}` : "Выберите страну"}</h3>
          {selected ? (
            <>
              <p className={styles.geoState} data-blocked={isBlocked}>
                {isBlocked ? (
                  <>
                    <ShieldAlert size={16} /> Заблокировано — посетители получают HTTP 451
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> Разрешено
                  </>
                )}
              </p>
              <input
                className={styles.input}
                placeholder="Причина (сохраняется в журнале аудита)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={255}
              />
              <div className={styles.geoActions}>
                <button
                  type="button"
                  className={isBlocked ? styles.btnGhost : styles.btnDanger}
                  disabled={busy}
                  onClick={() => toggle(selected.code, !isBlocked)}
                >
                  {busy ? <Loader2 size={16} className={styles.spin} /> : null}
                  {isBlocked ? "Разблокировать" : "Заблокировать страну"}
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => preview(simulating === selected.code ? null : selected.code)}
                >
                  {simulating === selected.code ? <EyeOff size={16} /> : <Eye size={16} />}
                  {simulating === selected.code ? "Остановить просмотр" : "Просмотр как посетитель"}
                </button>
              </div>
              {!stats && statsLoading ? (
                <p className={styles.geoHint}>
                  <Loader2 size={14} className={styles.spin} /> Загрузка региональной статистики…
                </p>
              ) : stats ? (
                <div className={styles.statsBlock} data-refreshing={statsLoading}>
                  <div className={styles.statsRow}>
                    <span className={styles.liveDot} data-live={stats.watchingNow > 0} />
                    <b>{stats.watchingNow}</b> смотрят прямо сейчас
                    <em>за последние 15 минут</em>
                  </div>

                  <div className={styles.periodChips} role="group" aria-label="Период отчёта">
                    {(["24h", "7d", "30d", "all"] as StatsPeriod[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        data-on={period === value}
                        onClick={() => setPeriod(value)}
                      >
                        {value === "all" ? "За всё время" : value}
                      </button>
                    ))}
                  </div>

                  <table className={styles.statsTable}>
                    <thead>
                      <tr>
                        <th />
                        <th>24h</th>
                        <th>7d</th>
                        <th>30d</th>
                        <th>all</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <UserPlus size={13} /> Регистрации
                        </td>
                        <td>{stats.signups.day}</td>
                        <td>{stats.signups.week}</td>
                        <td>{stats.signups.month}</td>
                        <td>{stats.signups.total}</td>
                      </tr>
                      <tr>
                        <td>
                          <Activity size={13} /> Просмотры
                        </td>
                        <td>{stats.views.day}</td>
                        <td>{stats.views.week}</td>
                        <td>{stats.views.month}</td>
                        <td>{stats.views.total}</td>
                      </tr>
                    </tbody>
                  </table>

                  {stats.topTitles.length > 0 ? (
                    <>
                      <h4 className={styles.statsHead}>
                        Самое популярное {period === "all" ? "за всё время" : `· за ${period}`}
                      </h4>
                      <ul className={styles.statsTop}>
                        {stats.topTitles.map((row) => (
                          <li key={row.title}>
                            <span>{row.title}</span>
                            <b>просмотров: {row.views}</b>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {stats.topRated.length > 0 ? (
                    <>
                      <h4 className={styles.statsHead}>
                        Лучшие оценки в стране
                        {stats.averageScore
                          ? ` · средняя по стране ${stats.averageScore.toFixed(1)}`
                          : ""}
                      </h4>
                      <ul className={styles.statsTop}>
                        {stats.topRated.map((row) => (
                          <li key={row.animeId}>
                            <span>{row.title}</span>
                            <b className={styles.scorePill}>
                              {row.average.toFixed(1)}
                              <em>голосов: {row.votes}</em>
                            </b>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <p className={styles.geoHint}>
                    {stats.refusedRequests > 0
                      ? `Отклонено запросов с последнего перезапуска: ${stats.refusedRequests}. `
                      : ""}
                    {stats.lastSignupAt
                      ? `Последний аккаунт создан ${new Date(stats.lastSignupAt).toLocaleDateString()}.`
                      : "Из этой страны ещё не создано ни одного аккаунта."}
                    {stats.unattributedUsers > 0
                      ? ` Аккаунтов без указанной страны: ${stats.unattributedUsers} (созданы до определения страны или без доверенного заголовка прокси).`
                      : ""}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className={styles.geoHint}>
              Ничего не блокируется, пока вы этого не решите. Пустой набор правил означает, что доступ
              открыт всему миру.
            </p>
          )}
        </section>

        <section className={styles.card}>
          <h3>
            <History size={16} /> Последние изменения
          </h3>
          {audit.length === 0 ? (
            <p className={styles.geoHint}>Правила ещё не менялись.</p>
          ) : (
            <ul className={styles.auditList}>
              {audit.map((row, i) => (
                <li key={`${row.country}-${row.at}-${i}`}>
                  <span className={styles.auditCode}>{row.country}</span>
                  <span data-blocked={row.blocked}>{row.blocked ? "заблокировано" : "разрешено"}</span>
                  <em>{row.actorEmail ?? "система"}</em>
                  <time>{new Date(row.at).toLocaleString()}</time>
                  {row.note ? <small>{row.note}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
