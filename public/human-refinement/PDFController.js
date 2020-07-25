class PDFController {
  constructor(element, minimapElement) {
    // Loading variables
    this.loading = true;
    this.loadingPercentage = 0;

    // Current PDF Document
    this.doc = null;
    this.pageOffsets = [];
    this.minimapPageOffsets = [];

    // PDF & Minimap Elements
    this.pdfElement = element;
    this.minimapElement = minimapElement;
  }

  async reset() {
    this.doc = null;
    this.loading = true;
    this.loadingPercentage = 0;
  }

  async loadPdf (url, minimapScale) {
    const documentLoadingTask = pdfjsLib.getDocument(url);
    documentLoadingTask.onProgress = this._setLoadingPercentage.bind(this);
    this.doc = await documentLoadingTask.promise;

    for (let pageNumber = 1; pageNumber <= this.doc.numPages; pageNumber++) {
      await this._loadPage(pageNumber, minimapScale);
    }
    this.loading = false;
  }

  _calculatePageOffset(pageOffsets, pageNumber, pageHeight) {
    return pageNumber > 1 ? pageOffsets[pageNumber - 2] + pageHeight : 0;
  }

  async _loadPage(pageNumber, minimapScale) {
    const page = await this.doc.getPage(pageNumber);

    const viewport = page.getViewport({ scale: 1.0 });
    const minimapViewport = page.getViewport({ scale: minimapScale });

    const pageHeight = this._renderPageCanvas(this.pdfElement, viewport, page);
    const minimapPageHeight = this._renderPageCanvas(this.minimapElement, minimapViewport, page);
    const pageOffset = this._calculatePageOffset(this.pageOffsets, pageNumber, pageHeight);
    const minimapPageOffset = this._calculatePageOffset(this.minimapPageOffsets, pageNumber, minimapPageHeight);
    this.pageOffsets.push(pageOffset);
    this.minimapPageOffsets.push(minimapPageOffset);
  }

  _renderPageCanvas(parentElement, viewport, page) {
    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d');
    parentElement.appendChild(canvas);

    canvas.style.display = 'block';
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    page.render({
      canvasContext,
      viewport,
    });
    return canvas.height;
  }

  _setLoadingPercentage(progressEvent) {
    const { loaded, total } = progressEvent;
    const percent = Math.round((loaded / total) * 100);
    this.loadingPercentage = percent < 100 ? percent : 100;
  }
}

// For unit testing
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports.PDFViewer = PDFController;
}
