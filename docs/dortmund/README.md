# Dortmund + Hörde: Kachel-Viewer mit Luftbild-Boden und Rettungswagen (Vorläufig)

Ein Gebiet von 5,1 × 4,1 km (10 × 8 Zellen à 512 m) in vier Detailstufen, die nach Kameraabstand geladen und wieder entladen werden.
Es enthält die 48 Zellen aus deinem Datensatz **und** Hörde (Bahnhof, Schlanke Mathilde, Hörder Burgplatz, Phoenix-See), das ich aus den offenen NRW-Daten angebaut habe.

Quellen (alle Geobasis NRW, Datenlizenz Deutschland – Zero – Version 2.0; Lizenz je Datensatz vor einem Verkauf nochmals auf der Datensatzseite prüfen):
LoD2-Gebäude, DGM1-Gelände, Digitale Orthophotos 10 cm (2025). Die ersten 6 Spalten kommen aus deinem 48-Zellen-Datensatz, die Spalten 7–10 aus den NRW-Downloads.

## Starten
Im Ordner einen Webserver starten und die Seite öffnen (direktes Öffnen per Doppelklick geht nicht, weil der Browser dann keine Kachel-Dateien lädt):

    python3 -m http.server 8099
    # dann http://localhost:8099/index.html

In einem Codespace: Befehl ausführen, Port 8099 weiterleiten, öffnen.

### Flugmodus (Standard)
Ziehen = umsehen, W A S D = fliegen, Q/E = hoch/runter, Umschalt = schnell, Mausrad = Tempo, Knopf „Rundflug“.
Hörde direkt ansehen: `index.html?cam=3400,230,-100,-0.607,-0.385` (Blick von Südwesten auf Bahnhof, Mathilde und See), `?cam=4900,260,-250,0.35,-0.42` (Phoenix-See).
Weitere Adressparameter: `?debug=1` färbt die Stufen ein, `?th=450,1100,2400,3200` setzt die Radien (L0, L1, L2, Ladefenster), `?tex=0` schaltet die Luftbilder aus, `?win=0` die Fenster, `?gain=1.0` die Helligkeit des Luftbilds.

### Fahrmodus (Knopf „Fahren (Rettungswagen)“ oder `?game=1`)
Start an der Schlanken Mathilde. W/S Gas/Bremse, A/D lenken, Leertaste Handbremse, L Blaulicht+Sirene, T Tageszeit, R zurück zum Start, Esc zurück zum Flug.
Parameter: `?game=1&t=14.5&npc=600` (Startuhrzeit, Anzahl Passanten; 0 = keine).
Einsatz: Patient am roten Punkt abholen (bis auf 7 m heranfahren, langsamer als ca. 20 km/h), dann ins Krankenhaus bringen. Punkte = 300 + Zeitbonus (bis 120 s) − 60 je Schaden.

## Was neu ist
- **Hörde dazu:** 4 Spalten östlich der alten Grenze (E 395 264 bis 397 312). Gelände (DGM1) und Gebäude (LoD2, 346 000 Dreiecke) aus den NRW-Downloads. Gegenprobe im Überlappungsstreifen: Gelände Ø 0,0 m Abweichung (95 % der Punkte ≤ 1 cm), Dachfläche der Gebäude auf 1,2 % gleich.
- **Luftbild als Boden:** 10 cm-Orthofotos auf 1 m, 2 m und 4 m je Pixel heruntergerechnet und je Zelle als JPEG abgelegt (`tiles/t0_*`, `t1_*`, `t2_*`, zusammen 10 MB). Der Phoenix-See, die Insel, die Gleise und die Straßen sind dadurch sichtbar, ohne dass es Vektordaten dafür gibt.
- **Dächer und Wände:** Dachfarbe aus dem Luftbild, Wände Putz-Ton mit Fensterraster (nur in der Nähe, weicht mit dem Abstand aus). Es sind keine echten Fassaden; Fenster und Putzfarbe sind erfunden.
- **Wahrzeichen:** Schlanke Mathilde (Uhrenkandelaber, 13,3 m, Stahl, 1908; Standort aus OpenStreetMap) als einfaches Modell, dazu Schilder für Mathilde und Burgplatz. Sie steht nicht in LoD2, weil sie kein Gebäude ist.

## Stufen der Stadt
| Stufe | Gelände | Gebäude | Radius |
|---|---|---|---|
| L0 | 4 m Höhenkarte, Luftbild 1 m | die echten LoD2-Dreiecke | bis 450 m |
| L1 | 8 m Höhenkarte, Luftbild 1 m | Voxel-Säulen, 4 m, Höhe in 3-m-Stufen | bis 1100 m |
| L2 | 16 m Höhenkarte, Dächer eingerechnet, Luftbild 2 m | (steckt in der Höhenkarte) | bis 2400 m |
| L3 | 64 m Höhenkarte, Dächer eingerechnet, Luftbild 4 m | (steckt in der Höhenkarte) | bis Fensterrand |

## Dateien
- `index.html` Viewer, `game.js` Fahren/Einsatz/Passanten, `rtw.glb` Rettungswagen, `GLTFLoader.js`, `three.min.js` (Three.js r147).
- `tiles/h{stufe}_{x}_{z}.bin` Höhenkarte uint16 (1 mm ab −40 m); `b0_*`/`b1_*` Gebäudenetze; `t{0,1,2}_{x}_{z}.jpg` Luftbild-Kacheln; `manifest.json` (Raster 10 × 8, Ursprung EPSG:25832 E0 392192, N0 5704704).
- `tiles/ground.bin`, `col.bin`, `main.bin`, `mission.json`: Boden-, Kollisions- und Zielkarten, Start, Krankenhaus, Orte.
- `tools/` (Python, in dieser Reihenfolge): `fetch_nrw.py` (Daten laden) → `build_east.py` (Gelände+Gebäude anhängen, nutzt `citygml_lod2.py`) → `build_tiles.py tiles 10 out/merged_ext.npz` → `build_l1.py tiles 3` → `build_ortho.py nrw/dop tiles 10` → `build_game_data.py tiles`. Dazu `export_glb.py`, `fetch_osm_roads.py` (Straßen aus OpenStreetMap, nur mit Internet) und die Playwright-Messungen.

## Gemessen (Software-Rendering ohne GPU, 1280 × 720)
- Gesamtpaket 42 MB: Höhenkarten 3,6 MB, Gebäude L0 13,7 MB / L1 6,5 MB (1,46 Mio. / 0,60 Mio. Dreiecke), Luftbilder 10,2 MB, Spieldaten 3,9 MB, Rettungswagen 3 MB.
- Ein Blick auf Hörde lädt 3–5 MB; gezeichnet werden 0,25–0,6 Mio. Dreiecke.
- Fahren und Passanten unverändert gegenüber dem 48-Zellen-Stand: 58 km/h nach 6 s, 0 Schritte im Gebäude, Einsatz durchgespielt, 600 Passanten, 0 Seitenfehler.
- Die Bildrate lässt sich ohne GPU nicht beurteilen (dort ca. 1–5 Bilder/s). Der Zähler im Viewer zeigt sie auf deinem Gerät.

## Bekannte Grenzen (ehrlich)
- **Krankenhaus ist ein Platzhalter** (größter Gebäudekomplex im alten Gebiet, 3 km von Hörde). Echte Koordinaten in `tiles/mission.json` eintragen: `x = Ost − 392192`, `z = −(Nord − 5704704)`.
- **Keine Straßen als Daten**, daher kein Verkehr. Im Luftbild sind sie zu sehen. Vektorstraßen und Wasserflächen gibt es offen im Basis-DLM NRW (Shape-Datei ver01_l / ver01_f / gew01_f, im 4,7-GB-Zip per Bereichsabruf einzeln holbar); das ist der nächste Schritt.
- Das Luftbild ist kein „echtes Orthofoto“: Gebäude lehnen leicht, und die Schatten vom Aufnahmetag sind ins Bild eingebrannt, egal welche Uhrzeit im Spiel läuft. Aus nächster Nähe ist 1 m je Pixel unscharf.
- Wände und Fenster sind Muster, keine echten Fassaden. LoD2 hat keine Fassadenbilder und keine Bäume.
- L1-Säulen sind bewusst grob (4 m); L2/L3 sehen aus der Nähe zackig aus.
- Es gibt keinen Zwischenspeicher: Wechselt eine Kachel die Stufe, wird sie neu geladen.
- Nicht auf echter GPU getestet.
