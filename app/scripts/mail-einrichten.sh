#!/usr/bin/env bash
# Die Zugangsdaten für den Mailweg einrichten — fragt nach und prüft sofort.
#
# Das Passwort wird verdeckt eingelesen und direkt in die Datei geschrieben:
# es steht nie in der Kommandozeile und taucht damit weder in `ps` noch in
# der Verlaufsdatei der Shell auf.
set -euo pipefail
cd "$(dirname "$0")/.."

ZIEL=".env.mail.local"
VORLAGE=".env.mail.example"

if [ -f "$ZIEL" ]; then
  printf '%s existiert bereits. Überschreiben? [j/N] ' "$ZIEL"
  read -r antwort
  case "$antwort" in [jJyY]*) ;; *) echo "Abgebrochen."; exit 0 ;; esac
fi

echo
echo "Zoho-Zugang für contact@camping-map.com"
echo "---------------------------------------"

printf 'Rechenzentrum — meldest du dich auf zoho.eu oder zoho.com an? [eu/com] (eu) '
read -r region
region="${region:-eu}"

printf 'E-Mail-Adresse (contact@camping-map.com): '
read -r benutzer
benutzer="${benutzer:-contact@camping-map.com}"

printf 'Dein Name für die Unterschrift (Jannis Döring): '
read -r absender
absender="${absender:-Jannis Döring}"

# -s blendet die Eingabe aus; das Passwort erscheint nirgends auf dem Schirm.
printf 'App-Passwort aus Zoho (Eingabe bleibt unsichtbar): '
read -rs passwort
echo
if [ -z "$passwort" ]; then echo "Kein Passwort eingegeben — abgebrochen."; exit 1; fi

# Erst mit strengen Rechten anlegen, dann füllen: so ist die Datei zu keinem
# Zeitpunkt für andere lesbar.
umask 177
sed \
  -e "s|^IMAP_HOST=.*|IMAP_HOST=imap.zoho.${region}|" \
  -e "s|^SMTP_HOST=.*|SMTP_HOST=smtp.zoho.${region}|" \
  -e "s|^MAIL_USER=.*|MAIL_USER=${benutzer}|" \
  -e "s|^MAIL_ABSENDER=.*|MAIL_ABSENDER=${absender}|" \
  "$VORLAGE" > "$ZIEL"
printf '%s\n' "MAIL_PASSWORT=${passwort}" >> "$ZIEL"
# Die Zeile aus der Vorlage entfernen, damit das Passwort nur einmal dasteht.
grep -n '^MAIL_PASSWORT=$' "$ZIEL" | head -1 | cut -d: -f1 | while read -r z; do
  sed -i '' "${z}d" "$ZIEL"
done
chmod 600 "$ZIEL"

echo
echo "Geschrieben nach app/$ZIEL (nur für dich lesbar)."
echo
node --env-file="$ZIEL" scripts/mail-pruefen.mjs
