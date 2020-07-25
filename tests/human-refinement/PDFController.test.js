const { PDFViewer: PDFController } = require('../../public/human-refinement/PDFController');
const path = require("path");
const dir = path.resolve(__dirname);

describe("PDFViewer", () => {
  let pdfViewer;

  beforeEach(() => {
    document.body.innerHTML =
    '<div>' +
    '  <div id="pdfViewer"></div>' +
    '  <div id="pdfMinimapInner"></div>' +
    '</div>';

    const pdfViewerElement = document.getElementById("pdfViewer");
    const minimapElement = document.getElementById("pdfMinimapInner");
    pdfViewer = new PDFViewer(pdfViewerElement, minimapElement);
  });

  describe("reset", () => {
    it("Should reset class variables back to defaults", () => {
      pdfViewer.doc = {};
      pdfViewer.loading = false;
      pdfViewer.loadingPercentage = 100;
      pdfViewer.reset();
      expect(pdfViewer.doc).toEqual(null);
      expect(pdfViewer.loading).toEqual(true);
      expect(pdfViewer.loadingPercentage).toEqual(0);
    })
  });

  describe("loadPdf", () => {
    it("Should load a pdf with pages returing the page height", async () => {
      const result = await pdfViewer.loadPdf(`file://${dir}/../test.pdf`, 0.2);
      expect(result).toEqual({ pageHeight: 841.92 });
    });
  });

  describe("_setLoadingPercentage", () => {
    it("Should set loadingPercentage equal to an integer value", () => {
      pdfViewer._setLoadingPercentage({ loaded: 20, total: 40 });
      expect(pdfViewer.loadingPercentage).toEqual(50);
      expect(pdfViewer.loading).toEqual(true);
    });

    it("Should set loadingPercentage equal to 100 when loaded is more than total", () => {
      pdfViewer._setLoadingPercentage({ loaded: 45, total: 40 });
      expect(pdfViewer.loadingPercentage).toEqual(100);
      expect(pdfViewer.loading).toEqual(true);
    });
  })
});
