const renderPDFCanvas = (attachToEl, viewport, page) => {
	let pdfCanvas = document.createElement('canvas');
	attachToEl.appendChild(pdfCanvas);
	let pdfContext = pdfCanvas.getContext('2d');
	pdfCanvas.style.display = 'block';
	pdfCanvas.height = viewport.height;
	pdfCanvas.width = viewport.width;

	page.render({
		canvasContext: pdfContext,
		viewport: viewport,
	});
};

const loadPage = async (pageNumber, state) => {
	const page = await state.doc.getPage(pageNumber);

	var pdfViewport = page.getViewport({ scale: 1.0 });
	var pdfMinimapViewport = page.getViewport({ scale: state.scale });

	renderPDFCanvas(state.pdfEl, pdfViewport, page);
	renderPDFCanvas(state.pdfMinimapEl, pdfMinimapViewport, page);

	if (state.pageWidth == -1) {
		state.pageWidth = pdfViewport.width;
		state.pageHeight = pdfViewport.height;
		state.docHeight = state.pageHeight * state.numPages;
	}

	return state;
};

export default async (pdfURL, pdfEl, pdfMinimapEl, scale) => {
	const loadingTask = pdfjsLib.getDocument(pdfURL);
	const doc = await loadingTask.promise;
	const numPages = doc.numPages;

	const state = {
		doc,
		pdfEl,
		pdfMinimapEl,
		pageWidth: -1,
		pageHeight: -1,
		docHeight: -1,
		numPages: doc.numPages,
		scale,
	};

	for (let i = 0; i < numPages; i++) {
		await loadPage(i + 1, state);
	}

	return state;
};
