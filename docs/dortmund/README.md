# Dortmund + Hörde: Kachel-Viewer mit Straßen, Verkehr, Rettungswagen und „Driver“-Fluchtfahrt (Vorläufig)

Ein Gebiet von 5,1 × 4,1 km (10 × 8 Zellen à 512 m) in vier Detailstufen, die nach Kameraabstand geladen und wieder entladen werden.
Es enthält die 48 Zellen aus deinem Datensatz **und** Hörde (Bahnhof, Schlanke Mathilde, Hörder Burgplatz, Phoenix-See), das ich aus den offenen NRW-Daten angebaut habe.

Quellen (alle Geobasis NRW, Datenlizenz Deutschland – Zero – Version 2.0; Lizenz je Datensatz vor einem Verkauf nochmals auf der Datensatzseite prüfen):
LoD2-Gebäude, DGM1-Gelände, Digitale Orthophotos 10 cm (2025), **Basis-DLM (Straßen, Wege, stehende Gewässer)**. Die ersten 6 Spalten kommen aus deinem 48-Zellen-Datensatz, die Spalten 7–10 aus den NRW-Downloads.

## Starten
Im Ordner einen Webserver starten und die Seite öffnen (direktes Öffnen per Doppelklick geht nicht, weil der Browser dann keine Kachel-Dateien lädt):

    python3 -m http.server 8099
    # dann http://localhost:8099/index.html

In einem Codespace: Befehl ausführen, Port 8099 weiterleiten, öffnen.

### Flugmodus (Standard)
Ziehen = umsehen, W A S D = fliegen, Q/E = hoch/runter, Umschalt = schnell, Mausrad = Tempo, Knopf „Rundflug“.
Hörde direkt ansehen: `index.html?cam=3400,230,-100,-0.607,-0.385` (Blick von Südwesten auf Bahnhof, Mathilde und See), `?cam=4900,260,-250,0.35,-0.42` (Phoenix-See).
Weitere Adressparameter: `?debug=1` färbt die Stufen ein, `?th=450,1100,2400,3200` setzt die Radien (L0, L1, L2, Ladefenster), `?tex=0` schaltet die Luftbilder aus, `?win=0` die Fenster, `?gain=1.0` die Helligkeit des Luftbilds (Standard 0,72), `?roads=0` die Straßenbänder.

### Fahrmodus A: Rettungswagen (Knopf „Fahren (Rettungswagen)“ oder `?game=1`)
Start an der Schlanken Mathilde. W/S Gas/Bremse, A/D lenken, Leertaste Handbremse, L Blaulicht+Sirene, T Tageszeit, R zurück zum Start, Esc zurück zum Flug.
Parameter: `?game=1&t=14.5&npc=600` (Startuhrzeit, Anzahl Passanten; 0 = keine).
Einsatz: Patient am roten Punkt abholen (bis auf 7 m heranfahren, langsamer als ca. 20 km/h), dann ins **St.-Josefs-Hospital Hörde** bringen (Ziel = Straßenpunkt am Gebäudekomplex). Punkte = 300 + Zeitbonus (bis 120 s) − 60 je Schaden. Mit Sirene weichen die Autos aus.

### Fahrmodus B: „Driver“-Fluchtfahrt (Knopf „Driver: Fluchtfahrt“ oder `?game=1&mode=driver`)
Limousine statt Rettungswagen, gleiche Steuerung (Leertaste = Handbremse zum Driften, mit Reifenspuren und Quietschen). Das Spiel setzt dich auf die rechte Spur einer Straße.
1. **Crew abholen** (roter Punkt, bis 7 m und unter ca. 20 km/h).
2. **Fluchtfahrt** zum blauen Versteck: beim Einsteigen steigt die **Fahndung** (★ unten rechts) auf mindestens 65. Streifenwagen erscheinen außerhalb deiner Sicht, fahren dir über das Straßennetz nach (A*), sehen dich ab 80 m / mit Sichtlinie und **rammen** dich (Schaden). Fahndung sinkt nur, wenn dich ca. 8 s lang niemand sieht und keiner näher als 80 m ist („Abgeschüttelt“, Bonus).
3. **Festnahme**: stehst du (unter ca. 11 km/h) 3 s lang näher als 7 m an einem Streifenwagen (Anzeige FESTNAHME %), ist der Auftrag verloren. Auch bei Totalschaden (Zustand 0 %) oder Zeitablauf.
Punkte = 300 + Zeitbonus (bis 120 s × 5) + 400 bei „Abgeschüttelt“ + Zustand × 3. Danach startet der nächste Auftrag.

## Was neu ist (gegenüber dem Stand „Hörde dazu“)
- **Vektorstraßen und Wasser aus dem Basis-DLM NRW:** Straßenbänder (Breite aus dem Attribut BRF, sonst Standardbreite je Klasse, Mittellinie gestrichelt, Fahrbahnfarbe aus dem Luftbild abgeleitet), Wasserflächen (Phoenix-See u. a.) mit Wellen und Spiegelung. Daten: `tiles/roads.json` (2858 befahrbare Straßenstücke, Wege, Gewässer).
- **Verkehr:** 70 Autos folgen dem Straßennetz (rechts, Kurventempo, bremsen vor Hindernissen, weichen der Sirene aus). **Passanten** laufen auf den Wegen und Gehwegen.
- **Fahndung und Streifenwagen** (siehe Driver-Modus), Himmel/Beleuchtung wie vorher (Tageszeit mit T).
- **Straßennetz ist nicht überall verbunden:** das DLM hat Lücken (17 getrennte Teilnetze). Fahrziele, Streifenwagen und Start liegen nur im größten Teilnetz, damit alles erreichbar ist.
- Werkzeuge `tools/fetch_dlm.py` (holt Straßen/Wege/Wasser per Bereichsabruf aus dem 4,7-GB-Zip, ohne es ganz zu laden) und `tools/build_roads.py` (baut `roads.json`); `build_game_data.py` nimmt jetzt den Krankenhausnamen entgegen.

## Stufen der Stadt
| Stufe | Gelände | Gebäude | Radius |
|---|---|---|---|
| L0 | 4 m Höhenkarte, Luftbild 1 m, Straßenbänder | die echten LoD2-Dreiecke | bis 450 m |
| L1 | 8 m Höhenkarte, Luftbild 1 m, Straßenbänder | Voxel-Säulen, 4 m, Höhe in 3-m-Stufen | bis 1100 m |
| L2 | 16 m Höhenkarte, Dächer eingerechnet, Luftbild 2 m | (steckt in der Höhenkarte) | bis 2400 m |
| L3 | 64 m Höhenkarte, Dächer eingerechnet, Luftbild 4 m | (steckt in der Höhenkarte) | bis Fensterrand |

## Dateien
- `index.html` Viewer, `game.js` Fahren/Einsatz/Verkehr/Passanten/Fahndung, `rtw.glb` Rettungswagen, `GLTFLoader.js`, `three.min.js` (Three.js r147).
- `tiles/h{stufe}_{x}_{z}.bin` Höhenkarte uint16 (1 mm ab −40 m); `b0_*`/`b1_*` Gebäudenetze; `t{0,1,2}_{x}_{z}.jpg` Luftbild-Kacheln; `manifest.json` (Raster 10 × 8, Ursprung EPSG:25832 E0 392192, N0 5704704).
- `tiles/ground.bin`, `col.bin`, `main.bin`, `mission.json`: Boden-, Kollisions- und Zielkarten, Start, Krankenhaus, Orte. `tiles/roads.json`: Straßen, Wege, Gewässer.
- `tools/` (Python, in dieser Reihenfolge): `fetch_nrw.py` (Daten laden) → `build_east.py` (Gelände+Gebäude anhängen, nutzt `citygml_lod2.py`) → `build_tiles.py tiles 10 out/merged_ext.npz` → `build_l1.py tiles 3` → `build_ortho.py nrw/dop tiles 10` → `fetch_dlm.py dlm_cache dlm_area.json` → `build_roads.py dlm_area.json tiles` → `build_game_data.py tiles <Ost0> <Nord0> <Ost1> <Nord1> "<Krankenhausname>"`. Dazu `export_glb.py` und die Playwright-Messungen (`pw_*.js`, `overlay_roads.py` legt Straßen über das Luftbild zur Kontrolle).

## Gemessen (Software-Rendering ohne GPU, 1280 × 720)
- Straßen: Überlagerung mit dem Luftbild geprüft; Achsen sitzen auf den Straßen, Abweichung typisch 1–2 m.
- Verkehr (90 s simuliert): 70 Autos, 0 in Gebäuden, Stoß mit Rettungswagen wird erkannt, Ausweichen bei Sirene funktioniert; 597 von 600 Passanten auf Wegen.
- Fahndung: stehender Spieler wird in 9 von 10 Zufallsstarts nach 12–24 s gestellt (einmal verlor die Polizei vorher den Kontakt); Fluchtfahrt über 1,5 km: Streifenwagen sind dran (nächster 4 m), rammen, standen in den Messungen fast nie im Gebäudeumriss (ein einzelner Messpunkt von etwa 45 zeigte einen). Auftragsablauf getestet: Erfolg (1600 Punkte), Festnahme, Totalschaden, Folgeauftrag.
- Rettungswagen unverändert: 58 km/h nach 6 s, 0 Schritte im Gebäude, Einsatz durchgespielt, 0 Seitenfehler.
- Gesamtpaket ca. 42 MB. Ein Blick auf Hörde lädt 3–5 MB; gezeichnet werden 0,25–0,6 Mio. Dreiecke.
- Die Bildrate lässt sich ohne GPU nicht beurteilen (dort ca. 1–5 Bilder/s). Der Zähler im Viewer zeigt sie auf deinem Gerät.

## Bekannte Grenzen (ehrlich)
- **Nicht auf echter GPU getestet.** Alle Messungen liefen mit Software-Rendering; Bildrate und Aussehen auf deiner Grafikkarte können abweichen.
- Straßenachsen aus dem DLM sind Mittellinien: Bänder sind stellenweise schmaler als die echte Straße, Achsen kreuzen manchmal Gebäudeumrisse. Brücken liegen auf dem Gelände (kein Höhenversatz), Richtungsfahrbahnen sind als zweispurig befahrbar behandelt, Bahngleise und Fußgängerzonen (z. B. Mathildenplatz) werden nicht gezeichnet.
- Das Luftbild ist kein „echtes Orthofoto“: Gebäude lehnen leicht, Schatten vom Aufnahmetag sind eingebrannt, aus der Nähe ist 1 m je Pixel unscharf.
- Wände und Fenster sind Muster, keine echten Fassaden. LoD2 hat keine Fassadenbilder und keine Bäume. Autos und Passanten sind einfache Körper.
- Streifenwagen fahren der Straßen-Mittellinie nach und prüfen auf der Route nicht gegen Gebäude (sie bleiben dadurch nicht an Ecken hängen); durch Anstoßen können sie einzeln kurz neben der Straße stehen. Hängen sie über 4 s fest, erscheinen sie neu.
- Das Krankenhausziel ist ein Straßenpunkt am St.-Josefs-Hospital-Komplex, kein Eingang.
- Es gibt keinen Zwischenspeicher: Wechselt eine Kachel die Stufe, wird sie neu geladen.
