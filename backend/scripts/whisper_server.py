#!/usr/bin/env python3
"""
Local, free, CPU-only transcription server for the pipeline module to call
instead of a paid hosted API. Backed by faster-whisper (CTranslate2), which
is the practical CPU option here (no GPU on this machine).

Usage:
  pip3 install faster-whisper flask
  python3 scripts/whisper_server.py
  # then in backend/.env:
  #   TRANSCRIPTION_PROVIDER=local
  #   WHISPER_LOCAL_URL=http://127.0.0.1:8090/transcribe

Model size is a speed/accuracy tradeoff (see WHISPER_MODEL_SIZE below):
tiny < base < small < medium < large. "base" is a reasonable default on CPU.
"""

import os
import tempfile

from faster_whisper import WhisperModel
from flask import Flask, jsonify, request

MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")
PORT = int(os.environ.get("WHISPER_SERVER_PORT", "8090"))

app = Flask(__name__)
print(f"Loading faster-whisper model '{MODEL_SIZE}' (CPU, int8)...")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print("Model loaded.")


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_SIZE})


@app.post("/transcribe")
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "missing 'file' field"}), 400

    upload = request.files["file"]
    suffix = os.path.splitext(upload.filename or "")[1] or ".bin"

    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        upload.save(tmp.name)
        segments, _info = model.transcribe(tmp.name, word_timestamps=True)

        words = [
            {"word": word.word.strip(), "start": word.start, "end": word.end}
            for segment in segments
            for word in (segment.words or [])
        ]

    return jsonify({"words": words})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
