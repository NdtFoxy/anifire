"use client"; 

import { useEffect, useState } from "react";

interface Anime {
  id: number;
  title: string;
  synopsis: string;
  imageUrl: string;
  rating: number;
}

export default function Home() {
  // State to store the list of anime fetched from the backend
  const [animes, setAnimes] = useState<Anime[]>([]);

  // Function to fetch active anime list (isDeleted = false) from Java Spring Boot API
  const fetchAnimes = async () => {
    try {
      const res = await fetch("http://localhost:8080/api/v1/animes");
      if (!res.ok) throw new Error("Failed to fetch data");
      const data = await res.json();
      setAnimes(data);
    } catch (error) {
      console.error("Error connecting to backend:", error);
    }
  };

  // Run fetchAnimes once when the component is mounted
  useEffect(() => {
    fetchAnimes();
  }, []);

  // Function to handle logical deletion
  const deleteAnime = async (id: number) => {
    // Browser confirmation dialog before proceeding
    if (!confirm("Are you sure you want to delete this anime?")) return;

    try {
      // Sending DELETE request to our Spring Boot Controller
      const response = await fetch(`http://localhost:8080/api/v1/animes/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Update local state to remove the deleted anime from the UI immediately
        setAnimes(animes.filter((anime) => anime.id !== id));
      } else {
        alert("Failed to delete anime on server.");
      }
    } catch (error) {
      console.error("Error during deletion:", error);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0707] py-10 px-4 flex justify-center font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        
        {/* Anime List Rendering */}
        {animes.map((anime) => (
          <div 
            key={anime.id} 
            className="bg-[#140F0F] rounded-xl p-5 flex flex-col md:flex-row gap-6 border border-white/5 hover:border-white/10 transition-all shadow-xl"
          >
            {/* Poster Image */}
            <div className="w-[140px] shrink-0 mx-auto md:mx-0">
              <img 
                src={anime.imageUrl} 
                className="w-full rounded-lg shadow-md aspect-[3/4] object-cover" 
                alt={anime.title} 
              />
            </div>

            {/* Anime Details */}
            <div className="flex flex-col flex-grow">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-2xl font-bold text-white tracking-tight leading-7">
                  {anime.title}
                </h2>
                
                {/* Delete Button - Triggers logical deletion on backend */}
                <button 
                  onClick={() => deleteAnime(anime.id)}
                  className="bg-red-900/10 text-red-500 border border-red-500/20 px-4 py-1.5 rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-all text-xs font-semibold uppercase tracking-widest"
                >
                  Delete
                </button>
              </div>

              {/* Genre and Meta placeholders (to match the screenshot style) */}
              <div className="text-gray-600 text-sm mb-3">
                Action • Shounen • Fantasy • Adventure
              </div>

              {/* Description with 3-line clamp */}
              <p className="text-[#8c8c8c] text-sm leading-relaxed mb-4 line-clamp-3">
                {anime.synopsis}
              </p>

              {/* Rating badge */}
              <div className="mt-auto flex items-center gap-2">
                <span className="text-yellow-500 text-lg">★</span>
                <span className="text-white font-bold">{anime.rating}</span>
                <span className="text-gray-600 text-xs uppercase ml-2 tracking-tighter">Score / Jikan API</span>
              </div>
            </div>
          </div>
        ))}

        {/* Empty state message */}
        {animes.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500">No anime found in the database.</p>
          </div>
        )}
      </div>
    </main>
  );
}