from app import stt


def test_hallucinated_stock_phrase_from_a_short_clip_is_dropped():
    assert stt.clean_transcript("Thank you.", [0.2], 6_000) == ""
    assert stt.clean_transcript("Thanks for watching!", [], 8_000) == ""


def test_single_word_from_a_short_clip_is_dropped_but_a_real_sentence_is_kept():
    assert stt.clean_transcript("Right", [0.1], 5_000) == ""
    assert stt.clean_transcript("I think we should define productivity first.", [0.05], 9_000).startswith("I think")


def test_whisper_saying_there_was_no_speech_wins():
    assert stt.clean_transcript("I think so too, yes indeed.", [0.9, 0.8], 30_000) == ""


def test_a_long_clip_keeps_even_a_short_polite_phrase():
    assert stt.clean_transcript("Thank you.", [0.1], 60_000) == "Thank you."
