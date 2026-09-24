"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  createCampaign,
  createCreative,
  deleteCreative,
  fetchCreatives,
  updateCampaign,
  updateCreative,
  type AdCampaign,
  type AdCreative,
  type CampaignStatus,
} from "@/lib/ads-admin";
import styles from "@/app/admin/admin.module.css";

/**
 * One campaign and its creatives, in a slide-over.
 *
 * Validation happens here, before the request, because the operator needs the
 * reason next to the field they got wrong — a 400 rendered as a banner tells
 * them something failed but not which of nine inputs to fix. The server still
 * validates; this is a courtesy, never the control.
 *
 * The legal fields (ОРД token, disclaimer, age marker) are laid out as first
 * class inputs rather than an "advanced" afterthought: under Russian
 * advertising law an unmarked creative that airs is the platform's liability,
 * so the operator has to look straight at them.
 */

const STATUSES: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

/** 10 digits for an organisation, 12 for a sole trader. Nothing else exists. */
const INN = /^(\d{10}|\d{12})$/;

interface CampaignForm {
  name: string;
  advertiser: string;
  advertiserInn: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  dailyImpressionCap: string;
  priority: string;
}

interface CreativeForm {
  src: string;
  durationSec: string;
  skipAfterSec: string;
  clickUrl: string;
  ordToken: string;
  legalDisclaimer: string;
  ageRating: string;
  active: boolean;
}

type Errors<T> = Partial<Record<keyof T, string>>;

const EMPTY_CAMPAIGN: CampaignForm = {
  name: "",
  advertiser: "",
  advertiserInn: "",
  status: "DRAFT",
  startsAt: "",
  endsAt: "",
  dailyImpressionCap: "0",
  priority: "50",
};

const EMPTY_CREATIVE: CreativeForm = {
  src: "",
  durationSec: "15",
  skipAfterSec: "5",
  clickUrl: "",
  ordToken: "",
  legalDisclaimer: "",
  ageRating: "",
  active: true,
};

/** `datetime-local` speaks wall-clock; the wire speaks instants. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours()
  )}:${pad(at.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function absoluteHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateCampaign(form: CampaignForm): Errors<CampaignForm> {
  const errors: Errors<CampaignForm> = {};

  if (!form.name.trim()) errors.name = "Дайте кампании название, по которому вы её потом узнаете.";
  if (!form.advertiser.trim()) {
    errors.advertiser = "Это название выводится на каждом креативе — оно не может быть пустым.";
  }
  if (!INN.test(form.advertiserInn.trim())) {
    errors.advertiserInn = "ИНН — 10 цифр для организации или 12 для ИП.";
  }

  const starts = form.startsAt ? new Date(form.startsAt).getTime() : null;
  const ends = form.endsAt ? new Date(form.endsAt).getTime() : null;
  if (starts !== null && ends !== null && ends <= starts) {
    errors.endsAt = "Период показа должен заканчиваться после начала.";
  }

  const cap = form.dailyImpressionCap.trim();
  if (cap === "" || !Number.isInteger(Number(cap)) || Number(cap) < 0) {
    errors.dailyImpressionCap = "Целое число показов в день; 0 — без ограничения.";
  }

  const priority = form.priority.trim();
  if (
    priority === "" ||
    !Number.isInteger(Number(priority)) ||
    Number(priority) < 0 ||
    Number(priority) > 100
  ) {
    errors.priority = "Приоритет — от 0 до 100.";
  }

  return errors;
}

function validateCreative(form: CreativeForm): Errors<CreativeForm> {
  const errors: Errors<CreativeForm> = {};

  if (!absoluteHttp(form.src.trim())) {
    errors.src = "Абсолютный http(s) URL на файл mp4.";
  }

  const duration = Number(form.durationSec.trim());
  if (!(duration > 0)) {
    errors.durationSec = "Длительность должна быть больше нуля секунд.";
  }

  const skipRaw = form.skipAfterSec.trim();
  if (skipRaw !== "") {
    const skip = Number(skipRaw);
    if (!Number.isFinite(skip) || skip < 0) {
      errors.skipAfterSec = "Секунды от начала или пусто для неотключаемого ролика.";
    } else if (duration > 0 && skip > duration) {
      errors.skipAfterSec = `Длина креатива — ${duration} с, пропуск на ${skip} с никогда не наступит.`;
    }
  }

  const click = form.clickUrl.trim();
  if (click !== "" && !absoluteHttp(click)) {
    errors.clickUrl = "Абсолютный http(s) URL или оставьте пустым для некликабельного ролика.";
  }

  const age = form.ageRating.trim();
  if (age !== "" && (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 21)) {
    errors.ageRating = "Возрастная маркировка, например 6, 12, 16 или 18.";
  }

  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <em className={styles.fieldError}>
      <AlertTriangle size={12} /> {message}
    </em>
  );
}

export default function CampaignDrawer({
  campaign,
  onClose,
  onSaved,
}: {
  /** An existing campaign to edit, or "new" to create one. */
  campaign: AdCampaign | "new";
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = campaign === "new" ? null : campaign;

  // The drawer is mounted per campaign (AdsSection keys it), so the form starts
  // from the campaign it was opened for — no effect has to copy props into
  // state, and the previous campaign's values can never flash on screen.
  const [form, setForm] = useState<CampaignForm>(() =>
    campaign === "new"
      ? EMPTY_CAMPAIGN
      : {
          name: campaign.name,
          advertiser: campaign.advertiser,
          advertiserInn: campaign.advertiserInn,
          status: campaign.status,
          startsAt: toLocalInput(campaign.startsAt),
          endsAt: toLocalInput(campaign.endsAt),
          dailyImpressionCap: String(campaign.dailyImpressionCap ?? 0),
          priority: String(campaign.priority ?? 0),
        }
  );
  const [errors, setErrors] = useState<Errors<CampaignForm>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** null until the first fetch answers; a new campaign has none by definition. */
  const [creatives, setCreatives] = useState<AdCreative[] | null>(
    editing ? null : []
  );
  const [editingCreative, setEditingCreative] = useState<AdCreative | "new" | null>(null);
  const [creativeForm, setCreativeForm] = useState<CreativeForm>(EMPTY_CREATIVE);
  const [creativeErrors, setCreativeErrors] = useState<Errors<CreativeForm>>({});
  const [creativeBusy, setCreativeBusy] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const campaignId = editing?.id ?? null;
  const loadingCreatives = creatives === null;

  const loadCreatives = useCallback(
    (id: number) => fetchCreatives(id).then(setCreatives),
    []
  );

  useEffect(() => {
    if (campaignId === null) return;
    void loadCreatives(campaignId);
  }, [campaignId, loadCreatives]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (next: Partial<CampaignForm>) => setForm((cur) => ({ ...cur, ...next }));
  const patchCreative = (next: Partial<CreativeForm>) =>
    setCreativeForm((cur) => ({ ...cur, ...next }));

  async function submitCampaign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateCampaign(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setNotice(null);
    const payload = {
      name: form.name.trim(),
      advertiser: form.advertiser.trim(),
      advertiserInn: form.advertiserInn.trim(),
      status: form.status,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      dailyImpressionCap: Number(form.dailyImpressionCap),
      priority: Number(form.priority),
    };
    const outcome = editing
      ? await updateCampaign(editing.id, payload)
      : await createCampaign(payload);
    setBusy(false);

    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    onSaved();
    // A brand-new campaign needs its id before creatives can hang off it, so
    // creation closes the drawer and the operator reopens it to add spots.
    if (!editing) onClose();
  }

  async function submitCreative(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (campaignId === null || editingCreative === null) return;

    const found = validateCreative(creativeForm);
    setCreativeErrors(found);
    if (Object.keys(found).length > 0) return;

    setCreativeBusy(true);
    setNotice(null);
    const payload = {
      src: creativeForm.src.trim(),
      durationSec: Number(creativeForm.durationSec),
      skipAfterSec:
        creativeForm.skipAfterSec.trim() === "" ? null : Number(creativeForm.skipAfterSec),
      clickUrl: creativeForm.clickUrl.trim() || null,
      ordToken: creativeForm.ordToken.trim() || null,
      legalDisclaimer: creativeForm.legalDisclaimer.trim() || null,
      ageRating: creativeForm.ageRating.trim() === "" ? null : Number(creativeForm.ageRating),
      active: creativeForm.active,
    };
    const outcome =
      editingCreative === "new"
        ? await createCreative(campaignId, payload)
        : await updateCreative(editingCreative.id, payload);
    setCreativeBusy(false);

    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    setEditingCreative(null);
    await loadCreatives(campaignId);
    onSaved();
  }

  async function removeCreative(id: number) {
    if (campaignId === null) return;
    setRemovingId(id);
    const outcome = await deleteCreative(id);
    setRemovingId(null);
    if (!outcome.ok) {
      setNotice(outcome.message);
      return;
    }
    await loadCreatives(campaignId);
    onSaved();
  }

  function openCreative(creative: AdCreative | "new") {
    setCreativeErrors({});
    setEditingCreative(creative);
    setCreativeForm(
      creative === "new"
        ? EMPTY_CREATIVE
        : {
            src: creative.src,
            durationSec: String(creative.durationSec),
            skipAfterSec: creative.skipAfterSec === null ? "" : String(creative.skipAfterSec),
            clickUrl: creative.clickUrl ?? "",
            ordToken: creative.ordToken ?? "",
            legalDisclaimer: creative.legalDisclaimer ?? "",
            ageRating: creative.ageRating === null ? "" : String(creative.ageRating),
            active: creative.active,
          }
    );
  }

  const list = creatives ?? [];
  const unmarked = list.filter((c) => !c.ordToken).length;

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <aside
        className={styles.drawer}
        data-wide="true"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Кампания ${editing.name}` : "Новая кампания"}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.drawerHead}>
          <div>
            <h3>{editing ? editing.name : "Новая кампания"}</h3>
            <p>
              {editing
                ? `#${editing.id} · креативов: ${editing.creativeCount}${
                    editing.creativeCount === 1 ? "" : ""
                  }`
                : "Заполните параметры показа, затем добавьте креативы."}
            </p>
          </div>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </header>

        {notice ? <div className={styles.drawerNotice}>{notice}</div> : null}

        <form className={styles.drawerForm} onSubmit={submitCampaign}>
          <div className={styles.formGrid}>
            <label className={styles.field} data-span="2">
              <span className={styles.fieldLabel}>Название кампании</span>
              <input
                className={styles.input}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError message={errors.name} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Рекламодатель (юр. название)</span>
              <input
                className={styles.input}
                value={form.advertiser}
                onChange={(e) => patch({ advertiser: e.target.value })}
                aria-invalid={Boolean(errors.advertiser)}
              />
              <small className={styles.fieldHint}>
                Показывается зрителю рядом с пометкой «Реклама», как требует закон.
              </small>
              <FieldError message={errors.advertiser} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>ИНН рекламодателя</span>
              <input
                className={styles.input}
                value={form.advertiserInn}
                inputMode="numeric"
                onChange={(e) => patch({ advertiserInn: e.target.value })}
                aria-invalid={Boolean(errors.advertiserInn)}
              />
              <small className={styles.fieldHint}>
                Идентифицирует рекламодателя в отчётности ОРД — 10 цифр или 12 для ИП.
              </small>
              <FieldError message={errors.advertiserInn} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Статус</span>
              <select
                className={styles.select}
                value={form.status}
                onChange={(e) => patch({ status: e.target.value as CampaignStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <small className={styles.fieldHint}>
                Выбираются только кампании со статусом ACTIVE в пределах периода показа.
              </small>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Приоритет</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                value={form.priority}
                onChange={(e) => patch({ priority: e.target.value })}
                aria-invalid={Boolean(errors.priority)}
              />
              <small className={styles.fieldHint}>0–100; при совпадении двух кампаний побеждает более высокий.</small>
              <FieldError message={errors.priority} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Начало показа</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => patch({ startsAt: e.target.value })}
              />
              <small className={styles.fieldHint}>Пусто — без даты начала.</small>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Окончание показа</span>
              <input
                className={styles.input}
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => patch({ endsAt: e.target.value })}
                aria-invalid={Boolean(errors.endsAt)}
              />
              <small className={styles.fieldHint}>Пусто — показывается до приостановки.</small>
              <FieldError message={errors.endsAt} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Лимит показов в день</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={form.dailyImpressionCap}
                onChange={(e) => patch({ dailyImpressionCap: e.target.value })}
                aria-invalid={Boolean(errors.dailyImpressionCap)}
              />
              <small className={styles.fieldHint}>0 = без лимита.</small>
              <FieldError message={errors.dailyImpressionCap} />
            </label>
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.btnPrimary} disabled={busy}>
              {busy ? <Loader2 size={15} className={styles.spin} /> : <Check size={15} />}
              {editing ? "Сохранить кампанию" : "Создать кампанию"}
            </button>
            <button type="button" className={styles.btnGhost} onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>

        <section className={styles.creativeBlock}>
          <div className={styles.listHead}>
            <h4>
              Креативы
              {unmarked > 0 ? (
                <span className={styles.ordWarn}>
                  <ShieldAlert size={13} /> {unmarked} без ОРД
                </span>
              ) : null}
            </h4>
            {campaignId === null ? null : (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => openCreative("new")}
              >
                <Plus size={15} /> Добавить креатив
              </button>
            )}
            {loadingCreatives ? <Loader2 size={14} className={styles.spin} /> : null}
          </div>

          {campaignId === null ? (
            <p className={styles.geoHint}>
              Креативы добавляются к сохранённой кампании. Сначала создайте её и откройте снова.
            </p>
          ) : list.length === 0 && !loadingCreatives ? (
            <p className={styles.geoHint}>
              Креативов пока нет — кампания не попадёт в рекламную паузу, пока не появится хотя бы один.
            </p>
          ) : (
            <ul className={styles.creativeList}>
              {list.map((creative) => (
                <li key={creative.id} data-unmarked={!creative.ordToken}>
                  <div className={styles.creativeMeta}>
                    <b>
                      {creative.durationSec}s ·{" "}
                      {creative.skipAfterSec === null
                        ? "неотключаемый"
                        : `пропуск через ${creative.skipAfterSec} с`}
                    </b>
                    <span className={styles.creativeSrc}>{creative.src}</span>
                    <div className={styles.tagRow}>
                      {creative.ordToken ? (
                        <span data-tone="ok">
                          <BadgeCheck size={12} /> ОРД {creative.ordToken}
                        </span>
                      ) : (
                        <span data-tone="bad">
                          <ShieldAlert size={12} /> не размечено для ОРД
                        </span>
                      )}
                      {creative.ageRating !== null ? <span>{creative.ageRating}+</span> : null}
                      {creative.legalDisclaimer ? (
                        <span data-tone="warn">дисклеймер</span>
                      ) : null}
                      <span data-tone={creative.active ? "ok" : undefined}>
                        {creative.active ? "активен" : "приостановлен"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => openCreative(creative)}
                      aria-label={`Изменить креатив ${creative.id}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      data-tone="bad"
                      disabled={removingId === creative.id}
                      onClick={() => removeCreative(creative.id)}
                      aria-label={`Удалить креатив ${creative.id}`}
                    >
                      {removingId === creative.id ? (
                        <Loader2 size={15} className={styles.spin} />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editingCreative !== null ? (
            <form className={styles.drawerForm} onSubmit={submitCreative}>
              <h4>{editingCreative === "new" ? "Новый креатив" : `Креатив #${editingCreative.id}`}</h4>
              <div className={styles.formGrid}>
                <label className={styles.field} data-span="2">
                  <span className={styles.fieldLabel}>URL видео (mp4)</span>
                  <input
                    className={styles.input}
                    value={creativeForm.src}
                    placeholder="https://…/spot.mp4"
                    onChange={(e) => patchCreative({ src: e.target.value })}
                    aria-invalid={Boolean(creativeErrors.src)}
                  />
                  <FieldError message={creativeErrors.src} />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Длительность, секунды</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={creativeForm.durationSec}
                    onChange={(e) => patchCreative({ durationSec: e.target.value })}
                    aria-invalid={Boolean(creativeErrors.durationSec)}
                  />
                  <FieldError message={creativeErrors.durationSec} />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Пропуск доступен через, секунды</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={creativeForm.skipAfterSec}
                    placeholder="пусто = без пропуска"
                    onChange={(e) => patchCreative({ skipAfterSec: e.target.value })}
                    aria-invalid={Boolean(creativeErrors.skipAfterSec)}
                  />
                  <small className={styles.fieldHint}>Оставьте пустым, чтобы ролик нельзя было пропустить.</small>
                  <FieldError message={creativeErrors.skipAfterSec} />
                </label>

                <label className={styles.field} data-span="2">
                  <span className={styles.fieldLabel}>URL перехода по клику</span>
                  <input
                    className={styles.input}
                    value={creativeForm.clickUrl}
                    placeholder="https://… (необязательно)"
                    onChange={(e) => patchCreative({ clickUrl: e.target.value })}
                    aria-invalid={Boolean(creativeErrors.clickUrl)}
                  />
                  <FieldError message={creativeErrors.clickUrl} />
                </label>

                <label className={styles.field} data-legal="true" data-span="2">
                  <span className={styles.fieldLabel}>Токен ОРД (маркировка ЕРИР)</span>
                  <input
                    className={styles.input}
                    value={creativeForm.ordToken}
                    placeholder="erid: …"
                    onChange={(e) => patchCreative({ ordToken: e.target.value })}
                  />
                  <small className={styles.fieldHint}>
                    Токен маркировки, выданный ОРД для этого креатива; по нему
                    отчитывается каждый показ.
                  </small>
                  {creativeForm.ordToken.trim() === "" ? (
                    <em className={styles.fieldError}>
                      <ShieldAlert size={12} /> Без токена креатив будет помечен «не размечено для
                      ОРД» и его нельзя показывать.
                    </em>
                  ) : null}
                </label>

                <label className={styles.field} data-legal="true" data-span="2">
                  <span className={styles.fieldLabel}>Обязательный дисклеймер</span>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={creativeForm.legalDisclaimer}
                    onChange={(e) => patchCreative({ legalDisclaimer: e.target.value })}
                  />
                  <small className={styles.fieldHint}>
                    Обязательное предупреждение для рекламы азартных игр, ставок и финансовых услуг;
                    показывается поверх ролика дословно.
                  </small>
                </label>

                <label className={styles.field} data-legal="true">
                  <span className={styles.fieldLabel}>Возрастная маркировка</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={21}
                    value={creativeForm.ageRating}
                    placeholder="18"
                    onChange={(e) => patchCreative({ ageRating: e.target.value })}
                    aria-invalid={Boolean(creativeErrors.ageRating)}
                  />
                  <small className={styles.fieldHint}>
                    Возрастная маркировка на ролике; пусто, если у креатива её нет.
                  </small>
                  <FieldError message={creativeErrors.ageRating} />
                </label>

                <label className={styles.field} data-inline="true">
                  <input
                    type="checkbox"
                    checked={creativeForm.active}
                    onChange={(e) => patchCreative({ active: e.target.checked })}
                  />
                  <span className={styles.fieldLabel}>Доступен для показа</span>
                </label>
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.btnPrimary} disabled={creativeBusy}>
                  {creativeBusy ? <Loader2 size={15} className={styles.spin} /> : <Check size={15} />}
                  Сохранить креатив
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setEditingCreative(null)}
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </aside>
    </div>
  );
}
