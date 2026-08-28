#!/usr/bin/env bash
# Dogwatch bootstrap. Idempotent — safe to re-run.
#
#   ./install.sh
#
# Installs system packages, Python dependencies and Docker, creates your config
# files from the examples, then runs the doctor. It does NOT start anything or
# overwrite a config you have already edited.

set -uo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
RED=$'\033[31m'; RESET=$'\033[0m'
say()  { echo "${BOLD}==>${RESET} $*"; }
ok()   { echo "  ${GREEN}ok${RESET}   $*"; }
warn() { echo "  ${YELLOW}warn${RESET} $*"; }
bad()  { echo "  ${RED}fail${RESET} $*"; }

cd "$(dirname "$0")"

# ---------------------------------------------------------------- platform ---
say "Checking the platform"
case "$(uname -s)" in
  Linux) ;;
  Darwin)
    bad "macOS. Frigate needs /dev/video* passthrough, which Docker Desktop"
    echo "       cannot do. Run this on the Linux box, or use a network camera."
    exit 1 ;;
  *)
    bad "$(uname -s) is not supported by this installer."
    echo
    echo "       The real constraint is narrower than it looks: a USB webcam"
    echo "       cannot be passed through to Docker on Windows. Three ways round it:"
    echo
    echo "         1. Install Ubuntu on this machine  -> USB webcam works, full speed"
    echo "         2. Keep Windows + Docker Desktop   -> needs a NETWORK (RTSP) camera"
    echo "                                               instead; CPU detection only"
    echo "         3. Run it on a Raspberry Pi        -> USB webcam works today"
    echo
    echo "       See SETUP.md."
    exit 1 ;;
esac

if grep -qi microsoft /proc/version 2>/dev/null; then
  bad "This is WSL. A USB camera cannot be passed into Docker here."
  echo "       Install Ubuntu directly on the machine, or keep Windows and use a"
  echo "       network (RTSP) camera instead of a USB one. See SETUP.md."
  exit 1
fi
ok "Linux $(uname -r)"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

# ------------------------------------------------------------- system pkgs ---
say "Installing system packages"
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq ffmpeg v4l-utils python3-pip python3-yaml \
        sqlite3 curl ca-certificates >/dev/null && ok "ffmpeg, v4l-utils, python3, sqlite3"
elif command -v dnf >/dev/null 2>&1; then
  $SUDO dnf install -y -q ffmpeg v4l-utils python3-pip sqlite curl && ok "packages installed"
else
  warn "Unknown package manager — install ffmpeg, v4l-utils, python3-pip and sqlite3 yourself"
fi

# ----------------------------------------------------------------- docker ----
say "Checking Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker $(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ,)"
else
  warn "Docker not found — installing via get.docker.com"
  curl -fsSL https://get.docker.com | $SUDO sh >/dev/null 2>&1 \
    && ok "docker installed" || bad "docker install failed; see https://docs.docker.com/engine/install/"
fi
if command -v docker >/dev/null 2>&1 && ! docker ps >/dev/null 2>&1; then
  warn "Cannot talk to the Docker daemon. Either:"
  echo "         $SUDO systemctl enable --now docker"
  echo "         $SUDO usermod -aG docker \$USER   # then log out and back in"
fi

# --------------------------------------------------------------- python ------
say "Installing Python dependencies"
PIP_FLAGS=""
python3 -c "import sys; sys.exit(0)" 2>/dev/null || { bad "python3 missing"; exit 1; }
pip3 install --quiet --disable-pip-version-check -r requirements.txt $PIP_FLAGS 2>/dev/null \
  || pip3 install --quiet --disable-pip-version-check --break-system-packages -r requirements.txt \
  || { bad "pip install failed"; exit 1; }
ok "paho-mqtt, PyYAML, anthropic, httpx"

# --------------------------------------------------------------- config ------
say "Creating config files"
for pair in ".env.example:.env" "dogwatch.yml.example:dogwatch.yml"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if [ -f "$dst" ]; then
    ok "$dst already exists — left alone"
  else
    cp "$src" "$dst" && ok "created $dst from $src"
  fi
done
mkdir -p storage frigate/media && ok "storage/ and frigate/media/ ready"

# --------------------------------------------------------------- camera ------
say "Looking for a camera"
if ls /dev/video* >/dev/null 2>&1; then
  ok "found: $(ls /dev/video* | tr '\n' ' ')"
  echo "${DIM}"
  v4l2-ctl --list-devices 2>/dev/null | head -6
  echo "${RESET}       Supported formats (pick a video_size for frigate/config.yml):"
  ffmpeg -hide_banner -f v4l2 -list_formats all -i "$(ls /dev/video* | head -1)" 2>&1 \
    | grep -E "Raw|Compressed" | head -4 | sed 's/^/         /'
else
  warn "No /dev/video* — plug in the USB webcam and re-run"
fi

if arecord -l 2>/dev/null | grep -q card; then
  ok "microphone found (bark detection possible)"
else
  warn "no microphone — bark detection will not work, everything else will"
fi

# --------------------------------------------------------------- verify ------
say "Running the doctor"
echo
python3 -m service --config dogwatch.yml doctor
DOCTOR=$?

echo
say "Next steps"
cat <<'NEXT'
  1. Edit frigate/config.yml   -> set video_size from the formats listed above
  2. docker compose up -d mosquitto frigate
  3. ./tools/check_stream.sh   -> then open the RTSP URL in VLC
  4. http://localhost:8971     -> draw your zones, especially `cage`

  Full guide: SETUP.md
  Re-check any time: python3 -m service --config dogwatch.yml doctor
NEXT
exit $DOCTOR
