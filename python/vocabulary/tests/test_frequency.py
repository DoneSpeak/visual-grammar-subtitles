from vocabulary.frequency import build_corpus, extract_text, subtitle_files

SRT = """1
00:00:01,000 --> 00:00:03,000
<i>犬</i>が走る。

2
00:00:03,000 --> 00:00:05,000
猫が寝ている。
"""


def test_extract_text_drops_cue_numbers_and_timestamps():
    assert extract_text(SRT) == "犬が走る。\n猫が寝ている。"


def test_subtitle_files_is_recursive_and_filtered(tmp_path):
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "one.srt").write_text(SRT, encoding="utf-8")
    (tmp_path / "two.vtt").write_text("WEBVTT", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("x", encoding="utf-8")
    names = [path.name for path in subtitle_files(tmp_path)]
    assert names == ["one.srt", "two.vtt"]


def test_build_corpus_counts_base_forms(tmp_path):
    (tmp_path / "one.srt").write_text(SRT, encoding="utf-8")
    corpus = build_corpus(tmp_path)
    assert corpus.available
    assert corpus.files == 1
    assert corpus.counts["走る"] == 1
    assert corpus.counts["寝る"] == 1
    assert corpus.counts["犬"] == 1
