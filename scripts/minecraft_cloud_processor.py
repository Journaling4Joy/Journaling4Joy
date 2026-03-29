"""
Minecraft Cloud Video Processor — MaMarie's Minecraft
======================================================
Runs in GitHub Actions to process Minecraft screen recordings into
YouTube-ready videos. Designed for cloud execution with minimal disk usage.

Usage:
    python minecraft_cloud_processor.py <raw_footage_folder>
"""

import cv2
import numpy as np
import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import timedelta


# ============================================================
# CONFIG
# ============================================================
OUTPUT_DIR = Path("output")
THUMBNAILS_DIR = Path("thumbnails")
TEMP_DIR = Path("temp")

SAMPLE_RATE_FPS = 2
MENU_DARKNESS_THRESHOLD = 0.35
STILLNESS_THRESHOLD = 1.5
STILLNESS_DURATION = 5.0
MIN_GOOD_CLIP = 2.0

DIRT_BROWN_LOW = np.array([10, 50, 40])
DIRT_BROWN_HIGH = np.array([25, 200, 180])
MENU_GRAY_LOW = np.array([0, 0, 50])
MENU_GRAY_HIGH = np.array([180, 30, 180])

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'}
CHANNEL_NAME = "MaMarie's Minecraft"


def ensure_dirs():
    for d in [OUTPUT_DIR, THUMBNAILS_DIR, TEMP_DIR]:
        d.mkdir(exist_ok=True)


def get_duration(video_path):
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_format', str(video_path)],
            capture_output=True, text=True, timeout=30
        )
        info = json.loads(result.stdout)
        return float(info['format']['duration'])
    except Exception:
        return 0.0


def get_video_info(video_path):
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_streams', str(video_path)],
            capture_output=True, text=True, timeout=30
        )
        info = json.loads(result.stdout)
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'video':
                w = int(stream.get('width', 1920))
                h = int(stream.get('height', 1080))
                fps_str = stream.get('r_frame_rate', '30/1')
                if '/' in fps_str:
                    num, den = fps_str.split('/')
                    fps = float(num) / float(den) if float(den) > 0 else 30.0
                else:
                    fps = float(fps_str)
                return w, h, fps
    except Exception:
        pass
    return 1920, 1080, 30.0


# ============================================================
# FOOTAGE SCANNING
# ============================================================
def scan_footage(folder):
    folder = Path(folder)
    videos = []
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() in VIDEO_EXTENSIONS:
            duration = get_duration(f)
            size_mb = f.stat().st_size / (1024 * 1024)
            if duration > 0:
                videos.append({
                    'path': str(f),
                    'name': f.name,
                    'duration': duration,
                    'size_mb': size_mb,
                })
                print(f"  Found: {f.name} — {duration:.1f}s ({size_mb:.1f} MB)")
            else:
                print(f"  Skipping (unreadable): {f.name}")
    return videos


# ============================================================
# MENU/FILLER DETECTION
# ============================================================
def is_menu_frame(frame):
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Pause menu - dark overlay
    full_darkness = np.mean(gray < 50)
    center_region = gray[h//4:3*h//4, w//4:3*w//4]
    center_brightness = np.mean(center_region)
    if full_darkness > MENU_DARKNESS_THRESHOLD and center_brightness < 80:
        return True, "pause_menu"

    # Loading screen - dirt blocks
    dirt_mask = cv2.inRange(hsv, DIRT_BROWN_LOW, DIRT_BROWN_HIGH)
    dirt_ratio = np.count_nonzero(dirt_mask) / (h * w)
    if dirt_ratio > 0.60:
        return True, "loading_screen"

    # Inventory screen - gray UI
    gray_mask = cv2.inRange(hsv, MENU_GRAY_LOW, MENU_GRAY_HIGH)
    center_gray = gray_mask[h//4:3*h//4, w//4:3*w//4]
    center_gray_ratio = np.count_nonzero(center_gray) / center_gray.size
    gray_ratio = np.count_nonzero(gray_mask) / (h * w)
    if center_gray_ratio > 0.55 and gray_ratio > 0.35:
        return True, "inventory"

    # Black frame
    if np.mean(gray) < 15:
        return True, "black_frame"

    # Phone/uniform screen
    overall_std = np.std(gray)
    if overall_std < 25:
        return True, "phone_screen"

    # Title screen check
    top_strip = gray[0:h//6, :]
    if np.mean(top_strip) > 150:
        edges_top = cv2.Canny(gray[0:h//3, :], 50, 150)
        edge_density = np.count_nonzero(edges_top) / edges_top.size
        if edge_density > 0.15:
            return True, "title_screen"

    return False, "gameplay"


def analyze_video(video_path, sample_fps=SAMPLE_RATE_FPS):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"    ERROR: Cannot open {video_path}")
        return []

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    frame_interval = max(1, int(fps / sample_fps))

    print(f"    Analyzing: {Path(video_path).name} ({duration:.0f}s, {fps:.0f}fps)")

    segments = []
    current_type = None
    current_start = 0
    prev_frame = None
    stillness_start = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            timestamp = frame_idx / fps
            is_menu, reason = is_menu_frame(frame)

            is_still = False
            if prev_frame is not None:
                diff = cv2.absdiff(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY),
                    cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
                )
                if np.mean(diff) < STILLNESS_THRESHOLD:
                    if stillness_start is None:
                        stillness_start = timestamp
                    elif timestamp - stillness_start > STILLNESS_DURATION:
                        is_still = True
                else:
                    stillness_start = None

            prev_frame = frame.copy()

            if is_menu:
                frame_type = f"menu:{reason}"
            elif is_still:
                frame_type = "stillness"
            else:
                frame_type = "gameplay"

            if frame_type != current_type:
                if current_type is not None:
                    segments.append({
                        'start': current_start,
                        'end': timestamp,
                        'type': current_type,
                    })
                current_type = frame_type
                current_start = timestamp

            if frame_idx % (frame_interval * 50) == 0:
                pct = (frame_idx / total_frames) * 100 if total_frames > 0 else 0
                print(f"      {pct:.0f}%...", flush=True)

        frame_idx += 1

    if current_type is not None:
        segments.append({
            'start': current_start,
            'end': duration,
            'type': current_type,
        })

    cap.release()

    gameplay_time = sum(s['end'] - s['start'] for s in segments if s['type'] == 'gameplay')
    filler_time = sum(s['end'] - s['start'] for s in segments if s['type'] != 'gameplay')
    print(f"    Gameplay: {gameplay_time:.1f}s | Removed: {filler_time:.1f}s")

    return segments


# ============================================================
# CLIP EXTRACTION
# ============================================================
def extract_gameplay_clips(video_path, segments, output_folder):
    output_folder = Path(output_folder)
    output_folder.mkdir(exist_ok=True)

    # Check if video is portrait (phone recording) and needs rotation
    w, h, fps = get_video_info(video_path)
    is_portrait = h > w
    # Target 1080p landscape for YouTube
    if is_portrait:
        # Rotate or letterbox portrait to landscape
        vf_filter = f"scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:black"
    else:
        vf_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"

    gameplay_segments = [
        s for s in segments
        if s['type'] == 'gameplay' and (s['end'] - s['start']) >= MIN_GOOD_CLIP
    ]

    clip_paths = []
    video_name = Path(video_path).stem

    for i, seg in enumerate(gameplay_segments):
        start = max(0, seg['start'] - 0.2)
        duration = (seg['end'] - seg['start']) + 0.4

        clip_path = output_folder / f"{video_name}_clip{i:04d}.mp4"
        cmd = [
            'ffmpeg', '-y', '-ss', str(start), '-i', str(video_path),
            '-t', str(duration),
            '-vf', vf_filter,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-r', '30',  # Normalize to 30fps for YouTube
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            str(clip_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0 and clip_path.exists():
            clip_paths.append(str(clip_path))
        else:
            print(f"    Warning: clip {i} failed")

    print(f"    Extracted {len(clip_paths)} clips")
    return clip_paths


# ============================================================
# VIDEO ASSEMBLY
# ============================================================
def create_title_card(text, subtitle, width=1920, height=1080, duration=4):
    title_path = TEMP_DIR / "title_card.mp4"
    cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', f'color=c=0x1a1a2e:s={width}x{height}:d={duration}:r=30',
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', str(duration),
        '-vf', (
            f"drawtext=text='{text}':"
            f"fontsize=72:fontcolor=0x55ff55:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-60,"
            f"drawtext=text='{subtitle}':"
            f"fontsize=36:fontcolor=0xaaaaaa:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+40"
        ),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'aac', '-shortest',
        '-pix_fmt', 'yuv420p',
        str(title_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return str(title_path) if result.returncode == 0 else None


def create_outro(width=1920, height=1080, duration=8):
    outro_path = TEMP_DIR / "outro.mp4"
    cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', f'color=c=0x1a1a2e:s={width}x{height}:d={duration}:r=30',
        '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
        '-t', str(duration),
        '-vf', (
            "fade=t=in:st=0:d=1,"
            f"drawtext=text='Thanks for watching!':"
            f"fontsize=64:fontcolor=0x55ff55:"
            f"x=(w-text_w)/2:y=350,"
            f"drawtext=text='SUBSCRIBE for more Minecraft adventures':"
            f"fontsize=36:fontcolor=0xffffff:"
            f"x=(w-text_w)/2:y=480,"
            "fade=t=out:st=6:d=2"
        ),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-c:a', 'aac', '-shortest',
        '-pix_fmt', 'yuv420p',
        str(outro_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return str(outro_path) if result.returncode == 0 else None


def concatenate_clips(clip_paths, output_path, title_text=None, subtitle=None, add_outro=True):
    if not clip_paths:
        print("    No clips to concatenate!")
        return None

    output_path = Path(output_path)
    all_clips = []

    if title_text:
        title = create_title_card(title_text, subtitle or "")
        if title:
            all_clips.append(title)

    all_clips.extend(clip_paths)

    if add_outro:
        outro = create_outro()
        if outro:
            all_clips.append(outro)

    concat_file = TEMP_DIR / "concat_list.txt"
    with open(concat_file, 'w') as f:
        for clip in all_clips:
            escaped = str(Path(clip).resolve()).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    cmd = [
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
        '-i', str(concat_file),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        str(output_path)
    ]

    print(f"    Rendering: {output_path.name}...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

    if result.returncode == 0 and output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        dur = get_duration(output_path)
        print(f"    Done! {dur:.0f}s ({size_mb:.1f} MB)")
        return str(output_path)
    else:
        print(f"    ERROR: {result.stderr[-300:]}")
        return None


# ============================================================
# THUMBNAILS
# ============================================================
def extract_best_thumbnail(video_path, output_path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    best_frame = None
    best_score = 0

    sample_points = np.linspace(total_frames * 0.1, total_frames * 0.9, 30).astype(int)

    for frame_idx in sample_points:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            continue

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        color_std = np.std(hsv[:, :, 0])
        brightness = np.mean(hsv[:, :, 2])
        edges = cv2.Canny(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 50, 150)
        edge_score = np.count_nonzero(edges) / edges.size

        brightness_score = 1.0 - abs(brightness - 128) / 128
        score = color_std * 0.3 + brightness_score * 100 * 0.3 + edge_score * 1000 * 0.4

        if score > best_score:
            best_score = score
            best_frame = frame.copy()

    cap.release()

    if best_frame is not None:
        thumb = cv2.resize(best_frame, (1280, 720))
        cv2.imwrite(str(output_path), thumb)
        return str(output_path)
    return None


def add_text_overlay(image_path, text, output_path):
    cmd = [
        'ffmpeg', '-y', '-i', str(image_path),
        '-vf', (
            f"drawtext=text='{text}':"
            f"fontsize=72:fontcolor=white:borderw=5:bordercolor=black:"
            f"x=(w-text_w)/2:y=h-text_h-50"
        ),
        str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return str(output_path) if result.returncode == 0 else str(image_path)


# ============================================================
# YOUTUBE METADATA
# ============================================================
def generate_metadata(video_number, duration_seconds):
    titles = {
        1: f"{CHANNEL_NAME} — My Survival Journey (Full Edit)",
        2: f"Everything I Built in Minecraft | {CHANNEL_NAME}",
        3: f"Exploring the Unknown | {CHANNEL_NAME}",
        4: f"Tour of My Entire World | {CHANNEL_NAME}",
    }

    descriptions = {
        1: f"""Welcome to {CHANNEL_NAME}! This is my complete Minecraft survival journey — all the menus, loading screens, and dead time removed so you get pure gameplay.

Recorded on mobile, edited with AI. Every moment of action, none of the waiting.

Like, subscribe, and drop a comment if you want to see more!

#Minecraft #MinecraftSurvival #Gaming #LetsPlay #MobileGaming""",

        2: f"""Every major build from my survival world — watch the progression from first shelter to final base.

All builds done in survival mode, no cheats, no creative.

Subscribe to {CHANNEL_NAME} for more!

#Minecraft #MinecraftBuilding #MinecraftSurvival #Building""",

        3: f"""Adventures through caves, biomes, and the unknown in Minecraft survival.

What will we find? Watch and see.

Subscribe to {CHANNEL_NAME}!

#Minecraft #MinecraftExploration #Adventure #Gaming""",

        4: f"""A guided tour of everything I've built. Every base, farm, and hidden detail.

Subscribe to {CHANNEL_NAME} for more tours!

#Minecraft #BaseTour #MinecraftTour #MinecraftBase""",
    }

    tags = [
        "minecraft", "minecraft survival", "minecraft gameplay",
        "minecraft mobile", "minecraft building", "minecraft exploration",
        "minecraft base tour", "minecraft 2025", "gaming",
        "minecraft pocket edition", "mcpe", "mamaries minecraft",
    ]

    return {
        'title': titles.get(video_number, f"{CHANNEL_NAME} — Episode {video_number}"),
        'description': descriptions.get(video_number, "Minecraft gameplay"),
        'tags': tags,
        'category': 'Gaming',
        'duration': str(timedelta(seconds=int(duration_seconds))),
    }


# ============================================================
# MAIN
# ============================================================
def main():
    print("=" * 60)
    print(f"  {CHANNEL_NAME} — Cloud Video Processor")
    print("=" * 60)

    raw_folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("raw_footage")

    if not raw_folder.exists():
        print(f"ERROR: Folder not found: {raw_folder}")
        sys.exit(1)

    ensure_dirs()

    # Step 1: Scan
    print("\n[1/6] Scanning footage...")
    videos = scan_footage(raw_folder)
    if not videos:
        # Try subdirectories
        for sub in raw_folder.iterdir():
            if sub.is_dir():
                videos.extend(scan_footage(sub))

    if not videos:
        print("ERROR: No playable video files found!")
        sys.exit(1)

    total_dur = sum(v['duration'] for v in videos)
    print(f"\nFound {len(videos)} videos, {total_dur:.0f}s total ({total_dur/60:.1f} min)")

    # Step 2: Analyze
    print("\n[2/6] Detecting menus and filler...")
    all_analysis = {}
    for v in videos:
        segments = analyze_video(v['path'])
        all_analysis[v['path']] = segments

    # Step 3: Extract clips
    print("\n[3/6] Extracting gameplay clips...")
    clips_dir = TEMP_DIR / "clips"
    clips_dir.mkdir(exist_ok=True)

    all_clips = []
    for v in videos:
        clips = extract_gameplay_clips(v['path'], all_analysis[v['path']], clips_dir)
        all_clips.extend(clips)

    if not all_clips:
        print("ERROR: No gameplay clips extracted!")
        # Fallback: just clean up the raw footage without detection
        print("Falling back to basic cleanup (removing first/last 5s only)...")
        for v in videos:
            dur = v['duration']
            clip_path = clips_dir / f"{Path(v['path']).stem}_full.mp4"
            w, h, fps = get_video_info(v['path'])
            is_portrait = h > w
            vf = "scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:black" if is_portrait else "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
            cmd = [
                'ffmpeg', '-y', '-ss', '5', '-i', v['path'],
                '-t', str(dur - 10),
                '-vf', vf,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-r', '30', '-c:a', 'aac', '-b:a', '128k',
                '-pix_fmt', 'yuv420p',
                str(clip_path)
            ]
            subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if clip_path.exists():
                all_clips.append(str(clip_path))

    if not all_clips:
        print("FATAL: Could not extract any usable footage!")
        sys.exit(1)

    # Delete raw footage to save disk space
    print("Cleaning up raw footage to save space...")
    for v in videos:
        try:
            os.remove(v['path'])
        except Exception:
            pass

    print(f"\nTotal clips: {len(all_clips)}")

    # Step 4: Produce videos
    print("\n[4/6] Producing final videos...")

    # Movie 1: Full journey (all clips)
    print("\n  --- Video 1: The Full Journey ---")
    v1 = concatenate_clips(
        all_clips,
        OUTPUT_DIR / "01_Full_Journey.mp4",
        title_text=CHANNEL_NAME,
        subtitle="The Full Journey"
    )

    # Movie 2: Builder (first portion)
    third = max(1, len(all_clips) // 3)
    if len(all_clips) > 3:
        print("\n  --- Video 2: The Builder ---")
        v2 = concatenate_clips(
            all_clips[:third],
            OUTPUT_DIR / "02_The_Builder.mp4",
            title_text=CHANNEL_NAME,
            subtitle="The Builder"
        )

        print("\n  --- Video 3: The Explorer ---")
        v3 = concatenate_clips(
            all_clips[third:2*third],
            OUTPUT_DIR / "03_The_Explorer.mp4",
            title_text=CHANNEL_NAME,
            subtitle="The Explorer"
        )

        print("\n  --- Video 4: Grand Tour ---")
        step = max(1, len(all_clips) // 12)
        tour_clips = all_clips[::step][:12]
        v4 = concatenate_clips(
            tour_clips,
            OUTPUT_DIR / "04_Grand_Tour.mp4",
            title_text=CHANNEL_NAME,
            subtitle="The Grand Tour"
        )
    else:
        print("  Only enough clips for 1 video")
        v2 = v3 = v4 = None

    # Step 5: Thumbnails
    print("\n[5/6] Generating thumbnails...")
    produced = {1: v1, 2: v2, 3: v3, 4: v4}
    thumb_titles = {1: "FULL JOURNEY", 2: "THE BUILDER", 3: "THE EXPLORER", 4: "GRAND TOUR"}

    for num, vpath in produced.items():
        if vpath and Path(vpath).exists():
            raw_thumb = THUMBNAILS_DIR / f"thumb_{num:02d}_raw.jpg"
            final_thumb = THUMBNAILS_DIR / f"thumb_{num:02d}.jpg"
            if extract_best_thumbnail(vpath, raw_thumb):
                add_text_overlay(raw_thumb, thumb_titles[num], final_thumb)
                try:
                    os.remove(str(raw_thumb))
                except Exception:
                    pass
                print(f"    Thumbnail {num}: {final_thumb}")

    # Step 6: Metadata
    print("\n[6/6] Generating YouTube metadata...")
    metadata = {}
    for num, vpath in produced.items():
        if vpath and Path(vpath).exists():
            dur = get_duration(vpath)
            meta = generate_metadata(num, dur)
            metadata[num] = meta
            print(f"  Video {num}: {meta['title']} ({meta['duration']})")

    with open(OUTPUT_DIR / "youtube_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    # Clean up temp files
    print("\nCleaning up temp files...")
    import shutil
    shutil.rmtree(str(TEMP_DIR), ignore_errors=True)

    # Summary
    print("\n" + "=" * 60)
    print("  PRODUCTION COMPLETE!")
    print("=" * 60)
    for num, vpath in produced.items():
        if vpath and Path(vpath).exists():
            size = Path(vpath).stat().st_size / (1024 * 1024)
            dur = get_duration(vpath)
            print(f"  [{num}] {Path(vpath).name} — {dur:.0f}s ({size:.1f} MB)")
    print(f"\n  Download these from the GitHub Actions artifacts!")
    print("=" * 60)


if __name__ == '__main__':
    main()
