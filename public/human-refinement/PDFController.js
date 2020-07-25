class PDFController {
  constructor(viewerElement, minimapElement, searchBarElement, searchInputElement, loadingSpinnerElement) {
    // Loading variables
    this.isLoading = false;
    this.loadingSpinnerElement = loadingSpinnerElement;

    // Current PDF Document
    this.document = null;

    // PDF Viewer
    this.viewer = {
      pageOffsets: [],
      element: viewerElement
    }

    // PDF Minimap
    this.minimap = {
      pageOffsets: [],
      element: minimapElement
    }

    // Search
    this.search = {
      elements: {
        bar: searchBarElement,
        input: searchInputElement
      }
    }
  }

  setLoading(loading) {
    this.isLoading = loading;
    loading ? this._showLoadingSpinner() : this._hideLoadingSpinner();
  }

  async loadPdf (url, minimapScale) {
    this.minimap.element.innerHTML = '';
    this.viewer.element.innerHTML = '';
    this.document = await pdfjsLib.getDocument(url).promise;

    for (let pageNumber = 1; pageNumber <= this.document.numPages; pageNumber++) {
      await this._loadPage(pageNumber, minimapScale);
    }

    // Reset previous search element values
    this.resetSearch();
    this.search.elements.input.value = '';
    this.search.elements.input.dataset.value = '';
  }

  async _loadPage(pageNumber, minimapScale) {
    const page = await this.document.getPage(pageNumber);

    const viewport = page.getViewport({ scale: 1.0 });
    const minimapViewport = page.getViewport({ scale: minimapScale });

    const pageHeight = this._renderPageCanvas(this.viewer.element, viewport, page);
    const minimapPageHeight = this._renderPageCanvas(this.minimap.element, minimapViewport, page);
    const pageOffset = this._calculatePageOffset(this.viewer.pageOffsets, pageNumber, pageHeight);
    const minimapPageOffset = this._calculatePageOffset(this.minimap.pageOffsets, pageNumber, minimapPageHeight);
    this.viewer.pageOffsets.push(pageOffset);
    this.minimap.pageOffsets.push(minimapPageOffset);
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

  _calculatePageOffset(pageOffsets, pageNumber, pageHeight) {
    return pageNumber > 1 ? pageOffsets[pageNumber - 2] + pageHeight : 0;
  }

  _showLoadingSpinner() {
    this.loadingSpinnerElement.style.display = 'block';
  }

  _hideLoadingSpinner() {
    this.loadingSpinnerElement.style.display = 'none';
  }

  async activateSearch(refreshSearchResults) {
		this.search.elements.input.value = this.search.elements.input.dataset.value || '';
		this.search.elements.bar.classList.add('active');
		this.search.elements.input.focus();
		await refreshSearchResults();
	}

  resetSearch() {
    this.search.elements.bar.classList.remove('active');
    this.search.elements.input.blur();
    this.clearSearchElementsFromPDF();
  }

  clearSearchElementsFromPDF() {
    Array.from($('.searchDivPointWrap') || []).forEach((p) => p.remove());
  }
}

// For unit testing
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports.PDFViewer = PDFController;
}
