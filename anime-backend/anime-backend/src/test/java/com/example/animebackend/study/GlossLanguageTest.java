package com.example.animebackend.study;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.animebackend.study.dto.StudyDtos;
import com.example.animebackend.study.entity.StudyPack;
import com.example.animebackend.study.entity.StudyWord;
import com.example.animebackend.study.entity.UserLanguage;
import com.example.animebackend.study.repository.StudyPackRepository;
import com.example.animebackend.study.repository.StudyWordRepository;
import com.example.animebackend.study.repository.UserLanguageRepository;
import com.example.animebackend.study.service.StudyService;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * A word's meaning must be shown in a language the viewer actually reads, and it
 * must never come back empty when the dictionary has anything at all — JMdict's
 * Russian coverage is a third of its English coverage, so the fallback carries
 * most Japanese words for a Russian-speaking learner.
 */
@SpringBootTest
@ActiveProfiles("test")
class GlossLanguageTest {

    private static final long RUSSIAN_VIEWER = 90_001L;
    private static final long ENGLISH_VIEWER = 90_002L;

    @Autowired
    private StudyService study;

    @Autowired
    private StudyPackRepository packs;

    @Autowired
    private StudyWordRepository words;

    @Autowired
    private UserLanguageRepository languages;

    private StudyPack pack;

    @BeforeEach
    void seed() {
        languages.deleteAll();
        words.deleteAll();
        packs.deleteAll();

        pack = packs.save(StudyPack.builder()
                .animeKey("gloss-test")
                .episode(1)
                .lang("ja")
                .lineCount(1)
                .wordCount(2)
                .build());

        words.save(StudyWord.builder()
                .packId(pack.getId())
                .lemma("魔王")
                .surface("魔王")
                .pos("名詞")
                .zipf(3.0f)
                .level((short) 3)
                .occurrences(1)
                .firstLine(0)
                .sampleLine("魔王を倒す旅。")
                .reading("まおう")
                .glossEn("Satan; the Devil")
                .glossRu("сатана, дьявол")
                .build());

        // Present in English only, like a third of JMdict.
        words.save(StudyWord.builder()
                .packId(pack.getId())
                .lemma("育む")
                .surface("育ん")
                .pos("動詞")
                .zipf(3.5f)
                .level((short) 4)
                .occurrences(1)
                .firstLine(0)
                .sampleLine("絆を育んだ。")
                .reading("はぐくむ")
                .glossEn("to raise; to bring up")
                .build());
    }

    @Test
    void russianSpeakerSeesRussianAndFallsBackToEnglish() {
        languages.save(UserLanguage.builder()
                .userId(RUSSIAN_VIEWER)
                .lang("ru")
                .role(UserLanguage.Role.NATIVE)
                .level((short) 6)
                .build());

        assertThat(glossOf(RUSSIAN_VIEWER, "魔王")).isEqualTo("сатана, дьявол");
        assertThat(glossOf(RUSSIAN_VIEWER, "育む")).isEqualTo("to raise; to bring up");
    }

    @Test
    void everyoneElseSeesEnglish() {
        languages.save(UserLanguage.builder()
                .userId(ENGLISH_VIEWER)
                .lang("ja")
                .role(UserLanguage.Role.LEARNING)
                .level((short) 2)
                .build());

        assertThat(glossOf(ENGLISH_VIEWER, "魔王")).isEqualTo("Satan; the Devil");
    }

    @Test
    void readingTravelsWithTheWord() {
        assertThat(wordOf(ENGLISH_VIEWER, "魔王").reading()).isEqualTo("まおう");
    }

    private String glossOf(long userId, String lemma) {
        return wordOf(userId, lemma).gloss();
    }

    private StudyDtos.WordView wordOf(long userId, String lemma) {
        Optional<StudyDtos.PackView> view = study.find(userId, pack.getAnimeKey(), pack.getEpisode(), "ja");
        assertThat(view).isPresent();
        return view.get().words().stream()
                .filter(w -> w.lemma().equals(lemma))
                .findFirst()
                .orElseThrow(() -> new AssertionError("word missing from pack: " + lemma));
    }
}
