"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchRecommendations } from "@/data/animeApi";
import type { Movie } from "@/data/mockAnime";

/**
 * Loads "Рекомендуем вам" for a signed-in viewer and hands it to the page's own
 * row renderer; nothing renders until there is something to recommend.
 */
export default function RecommendedRow({
  render,
}: {
  render: (title: string, items: Movie[]) => React.ReactNode;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<Movie[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchRecommendations(20).then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || items.length === 0) return null;
  return <>{render("Рекомендуем вам", items)}</>;
}
