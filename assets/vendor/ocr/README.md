# OCR local para capturas de Picks

Recursos públicos servidos desde el mismo origen. Solo se cargan cuando se elige
una imagen. El navegador procesa los píxeles; no hay endpoint OCR remoto.

- Tesseract.js 7.0.0: <https://github.com/naptha/tesseract.js>, licencia Apache 2.0.
- tesseract.js-core 7.0.0: <https://github.com/naptha/tesseract.js-core>, Apache 2.0.
- Idiomas eng/spa de @tesseract.js-data 1.0.0, datos 4.0.0_best_int:
  <https://github.com/naptha/tessdata>, procedentes de
  <https://github.com/tesseract-ocr/tessdata_best>, Apache 2.0.

Se conservan las licencias de los paquetes. `versions.json` registra versiones,
tamaños y SHA-256. El archivo `tesseract-core-lstm.wasm.js` contiene el WASM
embebido; el worker no requiere otro binario `.wasm`.
