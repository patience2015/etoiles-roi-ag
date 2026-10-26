@echo off
rem Lance le greffier de seance sur http://127.0.0.1:8091 (laisser cette fenetre ouverte, Ctrl+C pour arreter)
cd /d "%~dp0"
start "" "http://127.0.0.1:8091/"
python -m http.server 8091 --bind 127.0.0.1
