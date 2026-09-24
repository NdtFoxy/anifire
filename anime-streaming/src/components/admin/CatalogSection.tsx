"use client";

import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { AnimeFormInput, Category } from "@/data/animeApi";
import type { Movie } from "@/data/mockAnime";
import styles from "@/app/admin/admin.module.css";

/** Catalogue CRUD: titles on the left, category management on the right. */
export default function CatalogSection({
  movies,
  categories,
  form,
  editingId,
  search,
  categoryId,
  page,
  totalPages,
  busy,
  categoryName,
  onForm,
  onSubmit,
  onEdit,
  onCancelEdit,
  onDelete,
  onSearch,
  onCategoryFilter,
  onPage,
  onCategoryName,
  onCategorySubmit,
  onCategoryDelete,
  onToggleCategory,
}: {
  movies: Movie[];
  categories: Category[];
  form: AnimeFormInput;
  editingId: number | null;
  search: string;
  categoryId: number | null;
  page: number;
  totalPages: number;
  busy: boolean;
  categoryName: string;
  onForm: (form: AnimeFormInput) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onEdit: (movie: Movie) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onSearch: (value: string) => void;
  onCategoryFilter: (id: number | null) => void;
  onPage: (page: number) => void;
  onCategoryName: (value: string) => void;
  onCategorySubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCategoryDelete: (id: number) => void;
  onToggleCategory: (id: number) => void;
}) {
  return (
    <div className={styles.catalogGrid}>
      <section className={styles.card}>
        <h3>{editingId ? "Edit title" : "Add a title"}</h3>
        <form className={styles.form} onSubmit={onSubmit}>
          <input
            className={styles.input}
            placeholder="Title"
            value={form.title}
            onChange={(e) => onForm({ ...form, title: e.target.value })}
            required
            maxLength={255}
          />
          <textarea
            className={styles.textarea}
            placeholder="Synopsis"
            rows={4}
            value={form.description}
            onChange={(e) => onForm({ ...form, description: e.target.value })}
            maxLength={2000}
          />
          <input
            className={styles.input}
            placeholder="Poster URL"
            value={form.imageUrl}
            onChange={(e) => onForm({ ...form, imageUrl: e.target.value })}
            maxLength={500}
          />
          <input
            className={styles.input}
            type="number"
            step="0.01"
            min="0"
            max="10"
            placeholder="Rating"
            value={form.rating ?? ""}
            onChange={(e) =>
              onForm({ ...form, rating: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <div className={styles.chips}>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.chip}
                data-on={form.categoryIds.includes(category.id)}
                onClick={() => onToggleCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className={styles.formActions}>
            <button className={styles.btnPrimary} type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className={styles.spin} /> : <Plus size={16} />}
              {editingId ? "Save changes" : "Add title"}
            </button>
            {editingId ? (
              <button type="button" className={styles.btnGhost} onClick={onCancelEdit}>
                <X size={16} /> Cancel
              </button>
            ) : null}
          </div>
        </form>

        <h3 className={styles.cardSubhead}>Categories</h3>
        <form className={styles.inlineForm} onSubmit={onCategorySubmit}>
          <input
            className={styles.input}
            placeholder="New category"
            value={categoryName}
            onChange={(e) => onCategoryName(e.target.value)}
            maxLength={120}
          />
          <button className={styles.btnPrimary} type="submit" disabled={!categoryName.trim()}>
            <Plus size={16} />
          </button>
        </form>
        <ul className={styles.categoryList}>
          {categories.map((category) => (
            <li key={category.id}>
              {category.name}
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => onCategoryDelete(category.id)}
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h3>Titles</h3>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search the catalogue…"
              aria-label="Search the catalogue"
            />
          </label>
          <select
            className={styles.select}
            value={categoryId ?? ""}
            onChange={(e) => onCategoryFilter(e.target.value ? Number(e.target.value) : null)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <ul className={styles.titleList}>
          {movies.map((movie) => (
            <li key={movie.id}>
              <img src={movie.imageUrl} alt="" loading="lazy" />
              <div>
                <b>{movie.title}</b>
                <small>
                  {movie.match}% · {movie.tags.slice(0, 3).join(" · ") || "no category"}
                </small>
              </div>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => onEdit(movie)}
                aria-label={`Edit ${movie.title}`}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => onDelete(movie.id)}
                aria-label={`Delete ${movie.title}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.pager}>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={page + 1 >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
