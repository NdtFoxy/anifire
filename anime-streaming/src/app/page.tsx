// src/app/page.tsx

interface Anime {
  id: number;
  malId: number;
  title: string;
  synopsis: string;
  imageUrl: string;
  rating: number;
}

async function getAnimes(): Promise<Anime[]> {
  const res = await fetch('http://localhost:8080/api/v1/animes', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
}

export default async function Home() {
  const animes = await getAnimes();

  return (
    <main className="min-h-screen bg-[#0A0707] py-10 px-4 md:px-8 flex justify-center font-sans">
      
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Top Anime</h1>
        
        {animes.map((anime) => (
          <div 
            key={anime.id} 
            className="bg-[#140F0F] rounded-xl p-4 md:p-5 flex flex-col md:flex-row gap-6 border border-white/5 hover:bg-[#1a1414] transition-colors duration-200"
          >
            
            {/* IMAGE */}
            <div className="w-[140px] md:w-[180px] shrink-0 mx-auto md:mx-0">
              <img 
                src={anime.imageUrl} 
                alt={anime.title} 
                className="w-full h-auto rounded-lg object-cover shadow-lg aspect-[3/4]"
              />
            </div>

            {/* INFO */}
            <div className="flex flex-col flex-grow py-1">
              
              {/* Title */}
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-1">
                {anime.title}
              </h2>
              
              {/* Romaji Title */}
              <h3 className="text-[#6b6b6b] text-sm md:text-base font-medium mb-4">
                {anime.title} (Romaji)
              </h3>

              {/* Genres (Mock data in English) */}
              <div className="text-[#8c8c8c] text-sm md:text-base mb-1">
                Action • Fantasy • Shounen • Magic • Supernatural
              </div>
              
              {/* Meta data */}
              <div className="text-[#8c8c8c] text-sm md:text-base mb-4">
                2024 • TV • Score: <span className="text-yellow-500 font-bold">{anime.rating}</span>
              </div>

              {/* Synopsis */}
              <p className="text-[#d1d1d1] text-sm md:text-base leading-relaxed line-clamp-4 md:line-clamp-5">
                {anime.synopsis}
              </p>
              
            </div>
          </div>
        ))}

      </div>
    </main>
  );
}