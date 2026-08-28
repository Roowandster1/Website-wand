#!/usr/bin/env bash
# Phase 0 verification — prove you have a usable stream before building anything.
#
#   ./tools/check_stream.sh                       # check the go2rtc restream
#   ./tools/check_stream.sh /dev/video0           # check the raw webcam first
#
# Success looks like: a video stream reported, and (if you want bark detection)
# an audio stream too. If there is no audio stream here, bark detection cannot
# work — find that out now, not in Phase 5.

set -uo pipefail

TARGET="${1:-rtsp://127.0.0.1:8554/dogs_main}"

echo "=== Target: $TARGET ==="
echo

if [[ "$TARGET" == /dev/* ]]; then
  echo "--- Devices ---"
  v4l2-ctl --list-devices 2>/dev/null || echo "(v4l2-ctl not installed: apt install v4l-utils)"
  echo
  echo "--- Formats and resolutions this camera actually supports ---"
  echo "Pick a video_size from this list for frigate/config.yml go2rtc stream."
  ffmpeg -hide_banner -f v4l2 -list_formats all -i "$TARGET" 2>&1 | grep -E "Raw|Compressed" || true
  echo
  echo "--- Microphones (for bark detection) ---"
  arecord -l 2>/dev/null || echo "(no ALSA capture devices found — bark detection will not work)"
  echo
fi

echo "--- Stream probe ---"
if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not installed. apt install ffmpeg"
  exit 1
fi

PROBE=$(ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,sample_rate,channels \
        -of default=noprint_wrappers=1 -rtsp_transport tcp -i "$TARGET" 2>&1)
RC=$?

if [[ $RC -ne 0 ]]; then
  echo "FAILED to open the stream."
  echo "$PROBE"
  echo
  echo "Do not proceed to Phase 1 until this works."
  exit 1
fi

echo "$PROBE"
echo

if grep -q "codec_type=video" <<<"$PROBE"; then
  echo "PASS  video stream present"
else
  echo "FAIL  no video stream — nothing downstream will work"
  exit 1
fi

if grep -q "codec_type=audio" <<<"$PROBE"; then
  echo "PASS  audio stream present — bark detection is possible"
else
  echo "WARN  no audio stream"
  echo "      Frigate's bark detection needs audio on the stream with the 'audio' role."
  echo "      Add the audio input to the go2rtc line in frigate/config.yml (see the"
  echo "      commented example) and re-run this. If your webcam has no mic, bark"
  echo "      detection is off the table until you add a USB mic."
fi

echo
echo "Now open the stream in VLC to confirm it is actually watchable:"
echo "    vlc $TARGET"
