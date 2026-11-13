#!/usr/bin/env bash
# Makes the header's chapter frames and voice line from a cut of the film.
#
#   tools/make-chapter-assets.sh path/to/film.mp4 1.5 13.2 20.5 49.4 57.6 71.5 92.2 106.5
#
# Give one time (in seconds) per chapter: the frame to show for it, usually a second or two
# into the chapter. It writes:
#   media/chapters/01.jpg, 02.jpg, ...   one frame per chapter, 256 px on the long side
#   media/film/envelope.js               the film's loudness, ten values a second
# Set OUT=some/folder to write somewhere else. Needs ffmpeg and python3.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 film.mp4 time1 [time2 ...]" >&2
  exit 64
fi

SRC="$1"
shift
if [[ ! -f "$SRC" ]]; then
  echo "Can't find the film: $SRC" >&2
  exit 66
fi
for tool in ffmpeg python3; do
  command -v "$tool" >/dev/null || { echo "$tool is needed. On a Mac: brew install $tool" >&2; exit 69; }
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$HERE/media}"
mkdir -p "$OUT/chapters" "$OUT/film"

# Frames: the long side becomes 256 px, so they stay sharp in the list on a retina screen.
n=1
for t in "$@"; do
  if ! [[ "$t" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "Not a time in seconds: $t" >&2
    exit 65
  fi
  file="$OUT/chapters/$(printf '%02d' "$n").jpg"
  ffmpeg -hide_banner -loglevel error -y -ss "$t" -i "$SRC" -frames:v 1 \
    -vf "scale='if(gt(iw,ih),256,-2)':'if(gt(iw,ih),-2,256)':flags=lanczos" -q:v 3 "$file"
  echo "Frame $n at ${t}s -> $file"
  n=$((n + 1))
done

# Voice line: the loudness (RMS) of every tenth of a second, as plain numbers.
STATS="$(mktemp -t luna-envelope)"
trap 'rm -f "$STATS"' EXIT
ffmpeg -hide_banner -loglevel error -nostats -i "$SRC" -vn \
  -af "aformat=channel_layouts=mono,aresample=8000,asetnsamples=n=800:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=$STATS" \
  -f null -

python3 -I - "$STATS" "$OUT/film/envelope.js" <<'PY'
import sys

stats_path, out_path = sys.argv[1], sys.argv[2]
values = []
with open(stats_path) as stats:
    for line in stats:
        if "RMS_level=" not in line:
            continue
        level = line.split("=", 1)[1].strip()
        try:
            db = float(level)
            values.append(10 ** (db / 20) if db > -120 else 0.0)
        except ValueError:  # "-inf" for pure silence
            values.append(0.0)
if not values:
    sys.exit("The film has no sound to draw the voice line from.")
with open(out_path, "w") as out:
    out.write("window.LUNA_FILM_ENVELOPE = [" + ",".join("%.4f" % v for v in values) + "];\n")
print("Voice line: %d values (%.1f s) -> %s" % (len(values), len(values) / 10, out_path))
PY

echo "Now set the chapter times in config.js. If the speakers changed, update media/film/voices.js too."
