"""Shows the rendered video template at a chosen playhead time, close to how
the final creative would actually look (rounded card, subject thumbnail,
styled caption pill) — not a wireframe of boxes. Reads render_output.json,
produced by backend/scripts/render-template.mjs (template merged with
bindings) — it does not talk to Mongo or the backend itself.

A "Show layer labels" toggle switches to a structural debug view (outlines +
id chips) for authoring the template; the default view is the creative one.
"""
import json
import subprocess
import time
from pathlib import Path

import streamlit as st
from PIL import Image, ImageDraw, ImageFont

BACKEND_DIR = Path(__file__).parent.parent / "backend"

RENDER_FILE = Path(__file__).parent / "render_output.json"
SCRATCH_DIR = Path(__file__).parent / ".scratch"
CHECKER_TILE = SCRATCH_DIR / "checker-tile.png"
STEP_MS = 100
FRAME_DELAY_S = 0.08
SUPERSAMPLE = 2
PREVIEW_WIDTH = 360

BG_FALLBACK = "#0b1020"
CARD_COLOR = "#c4b5fd"
CARD_RADIUS = 28
SUBJECT_COLOR = "#4f8bff"
SUBJECT_RADIUS = 18
CONTENT_FILL = "#ede9fe"
CONTENT_BORDER = "#8b5cf6"
CAPTION_FILL = "#111111"
LOGO_FILL = "#ff5c8a"

LAYER_COLORS = {
    "video-slot": "#4f8bff",
    "caption-slot": "#ffde00",
    "image": "#ff5c8a",
    "text": "#5cff8a",
    "content-slot": "#b16cff",
}


def ensure_checker_tile(square=40, grid=16) -> Path:
    """A checkerboard image — the universal "this is transparent" visual —
    that the cutout gets composited onto so you can actually see it's just
    the character with nothing behind them."""
    if CHECKER_TILE.exists():
        return CHECKER_TILE
    SCRATCH_DIR.mkdir(exist_ok=True)
    size = square * grid
    tile = Image.new("RGB", (size, size), "#e5e5e5")
    draw = ImageDraw.Draw(tile)
    for row in range(grid):
        for col in range(grid):
            if (row + col) % 2 == 0:
                x0, y0 = col * square, row * square
                draw.rectangle([x0, y0, x0 + square, y0 + square], fill="#b0b0b0")
    tile.save(CHECKER_TILE)
    return CHECKER_TILE


def composite_on_checkerboard(alpha_video_path: Path, out_path: Path) -> None:
    """Re-encodes the alpha .mov over a checkerboard as a normal playable mp4
    — browsers can't preview real transparency in a <video> tag (and
    definitely can't decode the qtrle alpha codec natively, which is why
    opening bg-removed.mov directly in a browser shows corrupted colors), so
    this is how you actually *see* that only the character is left."""
    checker = ensure_checker_tile()
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-loop", "1", "-i", str(checker),
            "-i", str(alpha_video_path),
            "-filter_complex", "[0:v][1:v]scale2ref[bg][fg];[bg][fg]overlay=format=auto,format=yuv420p[v]",
            "-map", "[v]", "-map", "1:a?",
            "-c:v", "libx264", "-c:a", "aac", "-shortest",
            str(out_path),
        ],
        check=True,
        capture_output=True,
    )


def run_node_script(script: str, *args: str) -> subprocess.CompletedProcess:
    """Runs one of backend/scripts/*.mjs — the actual whisper/bg-removal/
    edit-plan/render logic lives there now (Node, not Python), so this app
    only shells out to it and shows the result, same as it already does
    for ffmpeg itself."""
    return subprocess.run(
        ["node", str(BACKEND_DIR / "scripts" / script), *args],
        check=True, capture_output=True, cwd=BACKEND_DIR,
    )


def run_background_removal(
    raw_video_bytes: bytes, suffix: str, max_seconds: float | None, max_width: int | None
) -> tuple[Path, Path]:
    SCRATCH_DIR.mkdir(exist_ok=True)
    raw_path = SCRATCH_DIR / f"raw{suffix}"
    raw_path.write_bytes(raw_video_bytes)

    alpha_path = SCRATCH_DIR / "bg-removed.mov"
    args = [str(raw_path), str(alpha_path)]
    if max_width:
        args.append(str(max_width))
    # max_seconds isn't supported by the Node script (it decodes whatever
    # ffmpeg gives it) — trim the input first so "fast preview" still means
    # something.
    if max_seconds:
        trimmed_path = SCRATCH_DIR / f"raw-trimmed{suffix}"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw_path), "-t", str(max_seconds), str(trimmed_path)],
            check=True, capture_output=True,
        )
        args[0] = str(trimmed_path)
    run_node_script("remove-background.mjs", *args)

    preview_path = SCRATCH_DIR / "bg-removed-preview.mp4"
    composite_on_checkerboard(alpha_path, preview_path)

    return alpha_path, preview_path


def load_render():
    if not RENDER_FILE.exists():
        return None
    return json.loads(RENDER_FILE.read_text())


def load_font(size):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except OSError:
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()


def layer_label(layer):
    if layer["type"] == "caption-slot":
        return f"{layer['id']} (captions)"
    if layer["type"] == "video-slot":
        return f"{layer['id']} (subject video)"
    if layer["type"] == "content-slot":
        return f"{layer['id']} (concept)"
    if layer["type"] == "image":
        return layer["id"]
    return layer["id"]


def visible_at(layer, t_ms):
    end = layer["endMs"]
    return layer["startMs"] <= t_ms and (end is None or t_ms <= end)


def fit_label(draw, text, font, max_width):
    if draw.textlength(text, font=font) <= max_width:
        return text
    ellipsis = "…"
    while text and draw.textlength(text + ellipsis, font=font) > max_width:
        text = text[:-1]
    return (text + ellipsis) if text else ellipsis


def draw_label_chip(draw, x0, y0, canvas_width, text, font, color):
    pad_x, pad_y = 6, 3
    max_width = canvas_width - x0 - pad_x * 2 - 4
    if max_width <= 10:
        return
    label = fit_label(draw, text, font, max_width)
    text_w = draw.textlength(label, font=font)
    text_h = font.size if hasattr(font, "size") else 12
    chip_x0, chip_y0 = x0 + 2, y0 + 2
    chip_x1 = min(chip_x0 + text_w + pad_x * 2, canvas_width - 2)
    chip_y1 = chip_y0 + text_h + pad_y * 2
    draw.rounded_rectangle([chip_x0, chip_y0, chip_x1, chip_y1], radius=5, fill="#000000cc")
    draw.text((chip_x0 + pad_x, chip_y0 + pad_y), label, fill=color, font=font)


def draw_frame(render, t_ms, show_labels):
    canvas = render["canvas"]
    width = PREVIEW_WIDTH * SUPERSAMPLE
    scale = width / canvas["width"]
    height = int(canvas["height"] * scale)

    bg = render["background"]
    bg_color = bg["value"] if bg["type"] == "color" else BG_FALLBACK
    frame = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(frame)

    label_font = load_font(11 * SUPERSAMPLE)
    text_font = load_font(13 * SUPERSAMPLE)
    caption_font = load_font(15 * SUPERSAMPLE)

    for layer in sorted(render["layers"], key=lambda l: l["zIndex"]):
        if not visible_at(layer, t_ms):
            continue
        x0 = layer["x"] * width
        y0 = layer["y"] * height
        x1 = x0 + layer["width"] * width
        y1 = y0 + layer["height"] * height
        box = [x0, y0, x1, y1]

        if layer["type"] == "video-slot":
            draw.rounded_rectangle(box, radius=SUBJECT_RADIUS * SUPERSAMPLE, fill=SUBJECT_COLOR)
        elif layer["type"] == "image":
            if layer["id"] == "card-panel":
                draw.rounded_rectangle(box, radius=CARD_RADIUS * SUPERSAMPLE, fill=CARD_COLOR)
            else:
                draw.rounded_rectangle(box, radius=8 * SUPERSAMPLE, fill=LOGO_FILL)
        elif layer["type"] == "content-slot":
            draw.rounded_rectangle(
                box, radius=16 * SUPERSAMPLE, fill=CONTENT_FILL, outline=CONTENT_BORDER,
                width=2 * SUPERSAMPLE,
            )
            content_type = layer.get("contentType")
            caption = layer.get("title") if content_type else "concept diagram"
            draw.text((x0 + 10 * SUPERSAMPLE, y0 + 10 * SUPERSAMPLE), caption or "concept diagram",
                       fill=CONTENT_BORDER, font=text_font)
        elif layer["type"] == "text":
            draw.text((x0, y0), layer["text"], fill=layer["style"]["color"], font=text_font)
        elif layer["type"] == "caption-slot":
            draw.rounded_rectangle(box, radius=(y1 - y0) / 2, fill=CAPTION_FILL)
            words = layer.get("words", [])
            active = [w["text"] for w in words if w["startMs"] <= t_ms <= w["endMs"]]
            spoken = " ".join(w["text"] for w in words if w["endMs"] <= t_ms)
            text = f"{spoken} {' '.join(active)}".strip() or "…"
            label = fit_label(draw, text[-40:], caption_font, (x1 - x0) - 16 * SUPERSAMPLE)
            bbox = draw.textbbox((0, 0), label, font=caption_font)
            text_h = bbox[3] - bbox[1]
            draw.text(
                (x0 + 10 * SUPERSAMPLE, y0 + (y1 - y0 - text_h) / 2),
                label, fill="#ffffff", font=caption_font,
            )

        if show_labels:
            color = LAYER_COLORS.get(layer["type"], "#aaaaaa")
            draw.rectangle(box, outline=color, width=1 * SUPERSAMPLE)
            draw_label_chip(draw, x0, y0, width, layer_label(layer), label_font, color)

    return frame.resize((PREVIEW_WIDTH, int(PREVIEW_WIDTH * height / width)), Image.LANCZOS)


def render_background_removal_section():
    st.subheader("1. Background Removal")
    st.caption(
        "Cuts out just the character (mediapipe selfie segmentation, free/CPU-only) "
        "so it can be placed over any template background as a video-slot binding."
    )

    if st.session_state.get("bg_removed_preview"):
        st.caption("Character only, on checkerboard = transparent")
        st.video(st.session_state.bg_removed_preview)
        st.caption(
            "⚠️ The download below is the real transparent asset (.mov, alpha "
            "channel) — opening it directly in a browser/player will look "
            "corrupted since most can't decode that alpha codec natively. "
            "Use it as a video-slot source, not for direct viewing; the "
            "checkerboard preview above is how you actually check it."
        )
        with open(st.session_state.bg_removed_alpha, "rb") as f:
            st.download_button(
                "Download bg-removed.mov (character only, real alpha channel)",
                f, file_name="bg-removed.mov", mime="video/quicktime",
                key="bg_removed_download",
            )
    else:
        st.caption("Runs as part of the pipeline below.")


def run_transcribe(video_bytes: bytes, suffix: str) -> dict:
    SCRATCH_DIR.mkdir(exist_ok=True)
    video_path = SCRATCH_DIR / f"transcribe-input{suffix}"
    video_path.write_bytes(video_bytes)
    words_path = SCRATCH_DIR / "words.json"
    run_node_script("transcribe.mjs", str(video_path), str(words_path))
    return json.loads(words_path.read_text())


def run_generate_edit_plan(video_bytes: bytes, suffix: str, template_id: str) -> dict:
    SCRATCH_DIR.mkdir(exist_ok=True)
    video_path = SCRATCH_DIR / f"plan-input{suffix}"
    video_path.write_bytes(video_bytes)
    plan_path = SCRATCH_DIR / "edit-plan.json"
    run_node_script("generate-edit-plan.mjs", str(video_path), template_id, str(plan_path))
    return json.loads(plan_path.read_text())


def run_render_final(
    video_bytes: bytes, suffix: str, template_id: str, max_ms: int, words: dict | None, plan: dict | None
) -> Path:
    SCRATCH_DIR.mkdir(exist_ok=True)
    video_path = SCRATCH_DIR / f"render-input{suffix}"
    video_path.write_bytes(video_bytes)
    output_path = SCRATCH_DIR / "final-render.mp4"

    args = [template_id, str(video_path), str(output_path)]
    if words is not None:
        words_path = SCRATCH_DIR / "render-words.json"
        words_path.write_text(json.dumps(words))
        args += ["--words", str(words_path)]
    elif plan is not None:
        plan_path = SCRATCH_DIR / "render-plan.json"
        plan_path.write_text(json.dumps(plan))
        args += ["--plan", str(plan_path)]
    args += ["--max-ms", str(max_ms)]

    run_node_script("render-final.mjs", *args)
    return output_path


def render_transcribe_section():
    st.subheader("2. Transcribe")
    st.caption(
        "Word-level timestamps via @huggingface/transformers (ONNX whisper, CPU) — "
        "no Python, no separate server to run."
    )
    words = st.session_state.get("transcript_words")
    if words:
        st.caption(f"{len(words)} word(s)")
        st.write(" ".join(w["word"] for w in words) or "(nothing recognized)")
        with st.expander("Raw words JSON"):
            st.json(words)
    else:
        st.caption("Runs as part of the pipeline below.")


def render_edit_plan_section():
    st.subheader("3. Edit Plan (LLM)")
    st.caption(
        "Calls the LLM (core/plan.ts, Gemini by default — set GOOGLE_GENERATIVE_AI_API_KEY "
        "in backend/.env) for cuts/captions/overlays, validated against the EditPlan zod schema."
    )
    plan = st.session_state.get("edit_plan")
    if plan:
        st.caption(f"{len(plan['cuts'])} cut(s), {len(plan['captions'])} caption(s), {len(plan['overlays'])} overlay(s)")
        with st.expander("Raw edit plan JSON", expanded=True):
            st.json(plan)
    else:
        st.caption("Runs as part of the pipeline below.")


def render_final_render_section():
    st.subheader("4. Final Render")
    st.caption(
        "Composites the template + real video pixels + captions into an actual .mp4 "
        "(common/render — @napi-rs/canvas per frame, piped into ffmpeg)."
    )
    if st.session_state.get("final_render"):
        st.video(st.session_state.final_render)
        with open(st.session_state.final_render, "rb") as f:
            st.download_button("Download final-render.mp4", f, file_name="final-render.mp4", mime="video/mp4")
    else:
        st.caption("Runs as part of the pipeline below.")


def run_pipeline(
    video_bytes: bytes,
    suffix: str,
    template_id: str,
    max_ms: int,
    do_bg_removal: bool,
    bg_max_seconds: float | None,
    bg_max_width: int | None,
    caption_source: str,
):
    status = st.status("Running pipeline...", expanded=True)
    try:
        if do_bg_removal:
            status.write("Removing background...")
            alpha_path, preview_path = run_background_removal(
                video_bytes, suffix, max_seconds=bg_max_seconds, max_width=bg_max_width,
            )
            st.session_state.bg_removed_alpha = str(alpha_path)
            st.session_state.bg_removed_preview = str(preview_path)
            status.write("Background removal done.")

        status.write("Transcribing...")
        transcribed = run_transcribe(video_bytes, suffix)
        st.session_state.transcript_words = transcribed["words"]
        status.write(f"Transcribed {len(transcribed['words'])} word(s).")

        status.write("Generating edit plan (LLM)...")
        plan = run_generate_edit_plan(video_bytes, suffix, template_id)
        st.session_state.edit_plan = plan
        status.write("Edit plan ready.")

        words = st.session_state.transcript_words if caption_source == "Transcript (words)" else None
        plan_for_render = st.session_state.edit_plan if caption_source == "Edit plan (captions + cuts)" else None

        status.write("Rendering final video...")
        output_path = run_render_final(video_bytes, suffix, template_id, max_ms, words, plan_for_render)
        st.session_state.final_render = str(output_path)

        status.update(label="Pipeline complete", state="complete")
    except subprocess.CalledProcessError as error:
        status.update(label="Pipeline failed", state="error")
        st.error(error.stderr.decode(errors="replace")[-1200:])


def main():
    st.set_page_config(page_title="Template Preview", layout="centered")
    st.title("Video Template Preview")

    st.header("Upload & Run")
    uploaded = st.file_uploader("Source video", type=["mp4", "mov", "webm"], key="source_upload")
    if uploaded is None:
        st.info(
            "Upload a video to run the full pipeline: background removal → "
            "transcribe → edit plan (LLM) → final render."
        )
        return

    st.video(uploaded)
    video_bytes = uploaded.getvalue()
    suffix = Path(uploaded.name).suffix or ".mp4"

    template_ids = ["reel-hook-explainer-01"]
    template_id = st.selectbox("Template", template_ids)

    bg_col, fast_col = st.columns(2)
    do_bg_removal = bg_col.checkbox("Remove background", value=True)
    fast_preview = fast_col.checkbox(
        "Fast bg-removal preview (shorter + smaller)", value=True, disabled=not do_bg_removal,
    )
    seconds_col, width_col = st.columns(2)
    max_seconds = seconds_col.slider(
        "Bg-removal max seconds", 1, 15, 5, disabled=not (do_bg_removal and fast_preview),
    )
    max_width = width_col.slider(
        "Bg-removal max width (px)", 240, 960, 480, step=60, disabled=not (do_bg_removal and fast_preview),
    )

    max_ms = st.slider("Max render length (ms)", 500, 10000, 3000, step=500)
    st.caption("Caps the template duration for this test run — full-length renders can take minutes per 10s.")

    caption_source = st.radio(
        "Captions from", ["Edit plan (captions + cuts)", "Transcript (words)", "None"], horizontal=True,
    )

    if st.button("Run pipeline", type="primary"):
        run_pipeline(
            video_bytes, suffix, template_id, max_ms, do_bg_removal,
            max_seconds if fast_preview else None, max_width if fast_preview else None,
            caption_source,
        )

    st.divider()
    render_background_removal_section()
    st.divider()

    render_transcribe_section()
    st.divider()

    render_edit_plan_section()
    st.divider()

    render_final_render_section()
    st.divider()

    render = load_render()
    if render is None:
        st.error(
            f"No render JSON found at {RENDER_FILE}. Run "
            "`npm run render:video-template` in backend/ first."
        )
        return

    st.caption(f"Template: {render['_id']}  ·  {render['canvas']['width']}x{render['canvas']['height']}  "
               f"·  {render['durationMs'] / 1000:.0f}s")

    duration_ms = render["durationMs"]
    if "t_ms" not in st.session_state:
        st.session_state.t_ms = 0
    if "playing" not in st.session_state:
        st.session_state.playing = False

    play_col, reset_col, slider_col = st.columns([1, 1, 4])
    if play_col.button("⏸ Pause" if st.session_state.playing else "▶ Play"):
        st.session_state.playing = not st.session_state.playing
    if reset_col.button("⏮ Reset"):
        st.session_state.t_ms = 0
        st.session_state.playing = False

    scrubbed = slider_col.slider(
        "Playhead (ms)", 0, duration_ms, st.session_state.t_ms, step=STEP_MS, key="scrub"
    )
    if scrubbed != st.session_state.t_ms:
        st.session_state.t_ms = scrubbed
        st.session_state.playing = False

    show_labels = st.checkbox("Show layer labels (debug view)", value=False)

    frame = draw_frame(render, st.session_state.t_ms, show_labels)
    st.image(frame, caption=f"t = {st.session_state.t_ms} ms")

    st.subheader("Layers")
    for layer in render["layers"]:
        active = "●" if visible_at(layer, st.session_state.t_ms) else "○"
        end = layer["endMs"] if layer["endMs"] is not None else duration_ms
        st.text(f"{active}  {layer['id']:<16} {layer['type']:<14} {layer['startMs']:>6}ms - {end:>6}ms")

    with st.expander("Raw render JSON"):
        st.json(render)

    if st.session_state.playing:
        next_t = st.session_state.t_ms + STEP_MS
        if next_t >= duration_ms:
            st.session_state.t_ms = duration_ms
            st.session_state.playing = False
        else:
            st.session_state.t_ms = next_t
        time.sleep(FRAME_DELAY_S)
        st.rerun()


if __name__ == "__main__":
    main()
