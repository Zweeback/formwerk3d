# Formwerk 3D

3D-Viewer und Editor in **einer einzigen HTML-Datei** – gemacht zum Einfügen in KI-Chats, läuft aber genauso lokal im Browser (kein Server, keine Anmeldung, alle Daten bleiben auf dem Gerät).

**Datei zum Benutzen:** `dist/formwerk3d.min.html` (≈ 309 KB). Im Chat-Fenster einer KI: `dist/formwerk3d.artifact.min.html` (ohne Doctype/head/body, für Artefakt-Fenster).

## Was drin ist

| Bereich | Inhalt |
|---|---|
| **CAD** | Parametrische Körper, Boolesche Operationen (Vereinigen/Abziehen/Schneiden), Skizze → Extrusion / Drehkörper, Messen, Spiegeln, Array, Shell |
| **Mesh** | Punkte/Kanten/Flächen bearbeiten, Extrudieren, Loop-Schnitt, Unterteilen, Glätten, Vereinfachen |
| **Sculpt** | Pinsel mit Symmetrie, Voxel-Remesh |
| **Textur-Studio** | Malen auf dem Modell, Ebenen, Pinsel, Füllen |
| **Rigging** | Knochen, Auto-Gewichte, Pose und Keyframes |
| **Karte → 3D** | GeoJSON / Overpass-JSON → Gebäude, Straßen, Wasser, Grün; Höhenbild → Gelände |
| **Foto-Scanner** | 16–40 Fotos (oder Video) rund um ein Objekt → Hüllenmodell mit Textur, komplett lokal |
| **Import** | GLB, glTF, VRM, FBX, OBJ (+MTL), DAE, 3DS, 3MF, STL, PLY, ZIP, Punktwolken (XYZ, PTS, CSV, PCD, LAS), Gaussian Splats (`.splat`, 3DGS-PLY) |
| **Export** | Unity (C#), Unreal (C++), Godot, C++/OpenGL, C++-Array, Blender-Python, three.js, OBJ, STL, glTF, GLB |
| **Referenzmodell** | Rettungswagen mit ≈ 164.000 Dreiecken (`{"scene":"rtw"}`) |

Einheiten: 1 Einheit = 1 Meter, Y oben, rechtshändig.

## Ehrlich zum Foto-Scanner

Der Scanner baut aus den Silhouetten eine **äußere Hülle** (Visual Hull) und legt die Fotos als Textur darüber. Das ist kein Ersatz für echte Photogrammetrie oder Gaussian-Splat-Training: Mulden, Hohlräume, dünne Antennen, Glas und Spiegelungen erfasst er nicht. Die geschätzte Kamerahöhe kann um ca. 10° danebenliegen, Texturen sind an verdeckten Stellen fleckig. Beste Ergebnisse: einfarbiger Untergrund, gleichmäßiges Licht, Objekt füllt das Bild, Fotos der Reihe nach rund um das Objekt.

## Mit einer KI benutzen

1. Die Datei `dist/formwerk3d.min.html` (oder `.artifact.min.html`) im Chat als Artefakt/HTML öffnen oder den Inhalt einfügen.
2. Die KI steuert den Editor mit **JSON-Befehlen**. Anleitung für die KI: In der Seite „Hilfe“ → „Komplette KI-Anleitung“, oder im Browser:

```js
Formwerk3D.manual()      // komplette Anleitung als Text
Formwerk3D.llmPrompt()   // Kurzfassung mit allen Befehlen
Formwerk3D.run('[{"add":"box","w":2,"h":1,"d":1}]')   // JSON-Befehle (oder Skript) ausführen
Formwerk3D.api.screenshot()                            // Bild der Ansicht als Data-URL
```

Ohne Seitenzugriff der KI: Der Nutzer fügt die Befehle im Modus „Export“ unter „Skript & Befehle“ ein und drückt „Ausführen“. Der Knopf **„Bild“** oben erzeugt ein Bild der aktuellen Ansicht zum Kopieren – so lässt sich das Ergebnis im Chat zeigen.

Beispiel:

```json
[
  {"add":"box","w":2,"h":0.8,"d":1.2,"pos":[0,0.4,0],"name":"Block"},
  {"add":"cylinder","rt":0.3,"rb":0.3,"h":2,"rot":[90,0,0],"pos":[0,0.4,0],"name":"Loch"},
  {"boolean":"subtract","a":"Block","b":"Loch","name":"Lagerblock"},
  {"view":"iso"}
]
```

Vorführ-Szenen: `{"scene":"rtw"}` Rettungswagen · `{"scene":"city"}` Stadt aus Kartendaten · `{"scene":"scan"}` Foto-Scanner-Demo (Original links, aus 20 Fotos berechnetes Modell rechts) · `{"scene":"rig"}` animierte Kette.

Hinweis: In manchen Chat-Fenstern sind Downloads und Skripte gesperrt. Dann funktionieren die Kopieren-Knöpfe und die JSON-Befehle weiterhin.

## Selbst bauen

```bash
npm install          # terser, three, jsdom, playwright
node build.js        # schreibt dist/formwerk3d{,.min}{,.artifact}.html
```

Der Quelltext liegt in `src/` als nummerierte Module (`00-core.js` … `99-boot.js`), `build.js` fügt sie zu einer Datei zusammen. three.js (r147) wird zur Laufzeit per CDN nachgeladen (cdnjs, jsDelivr, unpkg).

Tests (`test/`) laufen mit Playwright/Chromium (`pw_*.js`), jsdom (`t1`–`t4`) oder reinem Node (`t5`, `t6`).

## Lizenz

Noch keine festgelegt – bitte vor dem Veröffentlichen eine Lizenz hinzufügen.
