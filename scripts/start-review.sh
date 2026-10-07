#!/bin/zsh
# Start a fresh, isolated Crux Garden review, or resume an existing review.
set -eu

review_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
review_app="${CRUX_REVIEW_APP:-$review_root/electron/release/manual-testing-novice-oct6/mac-arm64/Crux Garden.app}"
review_game="$review_root/docs/manual-testing/v1-user-stories.html"

case "${1:-}" in
  -h|--help)
    printf '%s\n' \
      'Usage: npm run review' \
      '       npm run review -- --resume /absolute/path/to/review-profile' \
      '' \
      'Starts the packaged October 6 review build and the Release Expedition.' \
      'Set CRUX_REVIEW_APP to an absolute .app path to review another build.' \
      'Each normal run creates a new Garden; existing Gardens are preserved.' \
      'Game results are separate: use Start a new run in the game to reset them.'
    exit 0
    ;;
  '') ;;
  --resume)
    if [[ $# -ne 2 || "$2" != /* || ! -d "$2" ]]; then
      printf '%s\n' 'Provide an existing, absolute review-profile directory after --resume.' >&2
      exit 1
    fi
    ;;
  *)
    printf '%s\n' 'Unknown option. Run npm run review -- --help for usage.' >&2
    exit 1
    ;;
esac

if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'This launcher uses the local macOS review build.' >&2
  exit 1
fi
if [[ ! -d "$review_app" || ! -f "$review_game" ]]; then
  printf 'Review build or game is missing. Expected:\n%s\n%s\n' "$review_app" "$review_game" >&2
  printf '%s\n' 'Build a Mac package with npm run dist:mac:unsigned in electron/, then set CRUX_REVIEW_APP to its absolute .app path.' >&2
  exit 1
fi

if [[ "${1:-}" == --resume ]]; then
  review_profile="$2"
else
  review_profile="$(mktemp -d "$HOME/CruxGarden-Review.XXXXXX")"
  # Keep an easy way back to this Garden without creating another fresh one.
  {
    printf '#!/bin/zsh\nexec '
    printf '%q ' env "CRUX_REVIEW_APP=$review_app" "$review_root/scripts/start-review.sh" --resume "$review_profile"
    printf '\n'
  } > "$review_profile/Resume Review.command"
  chmod +x "$review_profile/Resume Review.command"
fi

printf 'Review profile: %s\n' "$review_profile"
printf 'Resume later: %s/Resume Review.command\n' "$review_profile"
env -u ELECTRON_RUN_AS_NODE open -n \
  --env "CRUX_TEST_PROFILE=$review_profile" "$review_app"
open -a 'Google Chrome' "$review_game"
printf '\n%s\n' \
  'In the Release Expedition, export any previous results you want to keep,' \
  'then select Start a new run and First sitting · local core loop.'
