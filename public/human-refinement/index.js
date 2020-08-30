/*
This project is deliberately vanilla javascript.
*/

const $ = (selector, context) => {
	const found = (context || document).querySelectorAll(selector);
	return found.length > 0 ? Array.from(found) : [];
};

const $1 = (selector, context) => {
	const found = (context || document).querySelector(selector);
	return found;
};

const MINIMAP_SCALE = 0.2;

const facetParserWorkers = {};
let currentSelectedPos = 0;
let isLoading = false;
let pdfState;
let searchResultsWraps;
let booleanBoundingBoxes = {};
let dateBoundingBoxes = {};

let currentCaseSetId;
let currentCaseData;
let currentCase;

let $pdfLoadingPercent;

// Case facets elements;
let $currentCaseName;
let $nextCase;
let $caseFacetsTable;
let $caseFacetsTableBody;

// Case search elements
let $pdfSearchInput;
let $pdfSearchBar;
let $pdfSearchPrev;
let $pdfSearchNext;
let $pdfSearchButton;

// Generate case sets elements
let $generateDataSetForm;
let $closeCaseSetSettings;
let $selectCaseFormList;
let $selectCaseSetForm;
let $randomDataSetSize;
let $generatingRandomDataSet;

// Case sidebar elements
let $casesTableBody;
let $caseSetSettingsDialog;
let $caseSetSettingsButton;

// PDF Viewer
let $pdf;
let $pdfViewer;
let $pdfViewerOuter;
let $pdfMinimapOuter;
let $pdfMinimapInner;
let viewportNavigator;

const months = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];

const loadLocalFacetOrdering = () => {
	let localFacetOrdering = localStorage.getItem('localFacetOrdering');
	if (localFacetOrdering) {
		return JSON.parse(localFacetOrdering);
	}
	return null;
};

const saveLocalFacetOrdering = (localFacetOrdering) => {
	localStorage.setItem('localFacetOrdering', JSON.stringify(localFacetOrdering));
};

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

	return pdfCanvas;
};

const resetCase = () => {
	resetFacet();
	resetSearch();
}

const resetSearch = () => {
	$pdfSearchInput.value = '';
	$pdfSearchBar.classList.remove('active');
	$pdfSearchInput.blur();
}

const resetFacet = () => {
	currentSelectedPos = 0;
	dateSubmit.value = '';
	dateDay.value = '';
	dateMonth.value = '';
	dateYear.value = '';
	dateSubmit.innerHTML = '';
}

const loadPage = async (pageNumber, state) => {
	const page = await state.doc.getPage(pageNumber);

	var pdfViewport = page.getViewport({ scale: 1.0 });
	var pdfMinimapViewport = page.getViewport({ scale: state.scale });

	const pdfPage = renderPDFCanvas(state.pdfEl, pdfViewport, page);
	renderPDFCanvas(state.pdfMinimapEl, pdfMinimapViewport, page);

	state.pageHeights.push(pdfViewport.height);
	state.minimapPageHeights.push(pdfMinimapViewport.height);

	state.pdfPages.push(pdfPage);

	if (state.pageWidth == -1) {
		state.pageWidth = pdfViewport.width;
	}

	return state;
};

const pdfControl = async (pdfURL, pdfEl, pdfMinimapEl, scale) => {
	$pdfLoadingPercent.value = 0;
	$pdfLoadingPercent.classList.add('visible');
	const loadingTask = pdfjsLib.getDocument(pdfURL);

	loadingTask.onProgress = function (data) {
		const percent = Math.round((data.loaded / data.total) * 100);
		$pdfLoadingPercent.value = percent;
		if (percent === 100) {
			setTimeout(() => {
				$pdfLoadingPercent.classList.remove('visible');
			}, 500);
		}
	};

	const doc = await loadingTask.promise;

	const numPages = doc.numPages;

	const state = {
		doc,
		pdfEl,
		pdfMinimapEl,
		pdfPages: [],
		pageHeights: [],
		minimapPageHeights: [],
		pageWidth: -1,
		numPages: doc.numPages,
		scale,
	};

	for (let i = 0; i < numPages; i++) {
		await loadPage(i + 1, state);
	}

	return state;
};

const search = async (searchQuery, caseData) => {
	return new Promise((resolve) => {
		let facetParserWorker;

		if (facetParserWorkers['search']) {
			facetParserWorker = facetParserWorkers['search'];
		} else {
			facetParserWorker = new Worker('/global/pdfTextWorker.js');
			facetParserWorkers['search'] = facetParserWorker;
		}

		const payload = {
			facetData: {
				id: 'search',
				type: 'search',
				searchQuery,
			},
			caseData,
		};

		facetParserWorker.onmessage = function (e) {
			resolve(e.data);
		};

		facetParserWorker.postMessage(JSON.stringify(payload));
	});
};

const runDateFacetWorkers = async (facetCase, caseData) => {
	return new Promise((resolve) => {
		let facetParserWorker;

		if (facetParserWorkers['date']) {
			facetParserWorker = facetParserWorkers['date'];
		} else {
			facetParserWorker = new Worker('/global/pdfTextWorker.js');
			facetParserWorkers['date'] = facetParserWorker;
		}

		const payload = {
			facetData: facetCase,
			caseData,
		};

		facetParserWorker.onmessage = function (e) {
			dateBoundingBoxes = e.data;
			resolve();
		};

		facetParserWorker.postMessage(JSON.stringify(payload));
	});
};

const runBooleanFacetWorkers = async (facets, caseData) => {
	return new Promise((resolve) => {
		facets.forEach((f) => {
			let facetParserWorker;

			if (facetParserWorkers[f.id]) {
				facetParserWorker = facetParserWorkers[f.id];
			} else {
				facetParserWorker = new Worker('/global/pdfTextWorker.js');
				facetParserWorkers[f.id] = facetParserWorker;
			}

			const payload = {
				facetData: f,
				caseData,
			};

			facetParserWorker.onmessage = function (e) {
				const facetData = e.data;
				booleanBoundingBoxes[facetData.id] = facetData.boundingBoxes;

				if (Object.keys(booleanBoundingBoxes).length === facets.length) {
					resolve();
				}
			};

			facetParserWorker.postMessage(JSON.stringify(payload));
		});
	});
};

const loadCaseData = async (caseMetaData) => {
	const json = await fetch(caseMetaData.pdfJSON).then((r) => r.json());
	return json;
};

const loadCase = async (caseId) => {
	if (isLoading) {
		return;
	} else if (!isLoading) {
		isLoading = true;
	}

	history.pushState(null, document.title, `?caseSetId=${currentCaseSetId}&caseId=${caseId}` + window.location.hash);

	$caseFacetsTable.classList.add('loading');
	$pdf.classList.add('loading');
	$pdfMinimapInner.innerHTML = '';
	$pdfViewer.innerHTML = '';

	$("tr", $casesTableBody).forEach((tr) => {
		if (tr.dataset.caseid == caseId) {
			tr.classList.add('active');
		} else {
			tr.classList.remove('active');
		}
	});

	currentCase = await fetch(`/api/human-refinement/cases/${caseId}`).then((t) => t.json());

	currentCaseData = await loadCaseData(currentCase.caseMeta);

	const dateFacets = currentCase.facets.find((f) => f.type == 'date');
	const booleanFacets = currentCase.facets.filter((f) => f.type == 'boolean');

	let dateFacetResult;
	let booleanFacetResult;

	booleanBoundingBoxes = {};
	dateBoundingBoxes = {};

	[dateFacetResult, booleanFacetResult, pdfState] = await Promise.all([
		runDateFacetWorkers(dateFacets, currentCaseData),
		runBooleanFacetWorkers(booleanFacets, currentCaseData),
		pdfControl(currentCase.caseMeta.pdfURL, $pdfViewer, $pdfMinimapInner, MINIMAP_SCALE),
	]);

	$caseFacetsTableBody.innerHTML = null;

	let currentCaseFacets = currentCase.facets;

	const localFacetOrdering = loadLocalFacetOrdering();

	if (localFacetOrdering) {
		// TODO: Handle new facets
		currentCaseFacets.sort((a, b) => {
			return localFacetOrdering[a.id] - localFacetOrdering[b.id];
		});
	}

	currentCaseFacets.forEach((facet, i) => {
		const tr = document.createElement('tr');
		const facetTd = document.createElement('td');
		const sortableTd = document.createElement('td');
		sortableTd.classList.add('sortable');
		sortableTd.innerText = '↕';
		const valueTd = document.createElement('td');
		const actionTd = document.createElement('td');
		const completedTd = document.createElement('td');

		const buttonSet = document.createElement('button');
		actionTd.appendChild(buttonSet);
		buttonSet.innerText = 'Select';
		buttonSet.onclick = loadFacet.bind(null, facet.id);

		tr.dataset.facet = facet.id;

		facetTd.innerHTML = facet.name;

		if (facet.type === 'boolean') {
			const facetListIcon = document.createElement('span');
			const facetListDialog = document.createElement('dialog');
			facetListDialog.classList.add('facetDialog');

			facetListDialog.innerHTML = `<h1>Keywords for ${facet.name}</h1>`;

			const closeButton = document.createElement('button');
			closeButton.onclick = () => facetListDialog.close();
			closeButton.innerText = 'Close';
			facetListDialog.appendChild(closeButton);

			const table = document.createElement('table');
			facetListDialog.appendChild(table);

			const thead = document.createElement('thead');
			table.appendChild(thead);

			const theadRow = document.createElement('tr');
			thead.appendChild(theadRow);

			const tHeadValue = document.createElement('th');
			tHeadValue.innerText = 'Value';
			theadRow.appendChild(tHeadValue);

			const tHeadWholeWord = document.createElement('th');
			tHeadWholeWord.innerText = 'Whole word';
			theadRow.appendChild(tHeadWholeWord);

			const tbody = document.createElement('tbody');
			table.appendChild(tbody);

			facet.options.forEach((o) => {
				const bodyRow = document.createElement('tr');
				tbody.appendChild(bodyRow);

				const bodyValue = document.createElement('td');
				bodyValue.innerText = o.value;
				bodyRow.appendChild(bodyValue);

				const bodyWholeWord = document.createElement('td');
				bodyWholeWord.innerText = o.wholeWord;
				bodyRow.appendChild(bodyWholeWord);
			});

			document.body.appendChild(facetListDialog);

			facetListIcon.classList.add('facetIcon');
			facetListIcon.innerText = 'ⓘ';
			facetListIcon.onclick = () => facetListDialog.showModal();
			facetTd.appendChild(facetListIcon);
		}

		completedTd.innerHTML = facet.completedCount;

		tr.appendChild(sortableTd);
		tr.appendChild(facetTd);
		tr.appendChild(valueTd);
		tr.appendChild(actionTd);
		tr.appendChild(completedTd);
		$caseFacetsTableBody.appendChild(tr);
	});

	if (window.location.hash) {
		loadFacet(window.location.hash.split('#')[1]);
	} else {
		loadFacet(currentCase.facets[0].id);
	}

	$caseFacetsTable.classList.remove('loading');
	$pdf.classList.remove('loading');
	const caseName = currentCase.caseMeta.caseName;
	const calculatedName = caseName.length > 53 ? caseName.slice(0,50) + "..." : caseName;;
	$currentCaseName.innerText = calculatedName
	$currentCaseName.title = caseName;
	//$currentCaseName.onmouseover = () => { $currentCaseName.innerText = caseName; }
	//$currentCaseName.onmouseout = () => { $currentCaseName.innerText = calculatedName; }

	new RowSorter($1('table', $caseFacetsTable), {
		handler: 'td.sortable',
		onDrop: function () {
			let newOrder = {};
			$("tr", $caseFacetsTableBody).forEach((tr, i) => {
				newOrder[tr.dataset.facet] = i;
			});
			saveLocalFacetOrdering(newOrder);
		},
	});

	isLoading = false;
};

window.onresize = () => {
	if (viewportNavigator) {
		viewportNavigator.style.height = pdfViewer.getClientRects()[0].height * MINIMAP_SCALE + 'px';
	}
};

const refreshFacetTable = (facetId) => {
	$("tr", $caseFacetsTableBody).forEach((tr) => {
		const rowFacet = currentCase.facets.find((f) => f.id == tr.dataset.facet);
		const valueTd = $1('td:nth-child(3)', tr);
		const completedTd = $1('td:nth-child(5)', tr);

		valueTd.innerHTML = null;
		completedTd.innerHTML = rowFacet.completedCount;

		if (tr.dataset.facet == facetId) {
			tr.classList.add('active');
		} else {
			tr.classList.remove('active');
		}
		if (rowFacet.not_applicable) {
			valueTd.innerText = 'N/A';
		} else if (rowFacet.unsure) {
			valueTd.innerText = 'Unsure';
		} else if (rowFacet && rowFacet.value != null) {
			if (rowFacet.type == 'date') {
				let dateStr = `${rowFacet.value[0] ? rowFacet.value[0] + '-' : ''}${months[rowFacet.value[1] - 1]}-${
					rowFacet.value[2]
				}`;

				valueTd.innerText = dateStr;
			} else {
				valueTd.innerText = rowFacet.value === true ? '✔' : '✘';
			}
		}
	});
};

const processPages = (el, pages, scale, cssClass) => {
	const wraps = [];

	pages.forEach((page, pageI) => {
		const offset = pdfState.pageHeights.slice(0, pageI).reduce((a, b) => a + Math.floor(b), 0) * scale;

		page.forEach((p) => {
			const pdfDivPointWrap = document.createElement('div');
			pdfDivPointWrap.classList.add(cssClass + 'Wrap');

			const pointEls = [];

			p.boxes.forEach((boxes) => {
				const pdfDivPoint = document.createElement('div');
				pdfDivPoint.classList.add(cssClass);
				pdfDivPoint.style.position = 'absolute';
				pdfDivPoint.style.left = boxes[0] * scale + 'px';
				pdfDivPoint.style.top = offset + boxes[1] * scale + 'px';
				pdfDivPoint.style.width = (boxes[2] - boxes[0]) * scale + 'px';
				pdfDivPoint.style.height = (boxes[5] - boxes[1]) * scale + 'px';
				pdfDivPointWrap.appendChild(pdfDivPoint);
				pointEls.push(pdfDivPoint);
			});

			if (p.optionValue) {
				pdfDivPointWrap.dataset.option = p.optionValue.trim();
			}

			wraps.push({
				wrap: pdfDivPointWrap,
				points: pointEls,
			});
			el.appendChild(pdfDivPointWrap);
		});
	});

	return wraps;
};

const extractDate = (dateString) => {
	const dateTrimmed = dateString.replace(/(?<!u)(st|nd|rd|th)|day|of|\./gi, '');
	const dateParts = dateTrimmed.split(/\s+/g);
	let dateObj = {
		day: null,
		month: null,
		year: null,
	};

	if (dateParts.length === 3) {
		dateObj['day'] = parseInt(dateParts[0]);
		// Month
		if (isNaN(parseInt(dateParts[1]))) {
			dateObj['month'] = months.findIndex((m) => dateParts[1].trim().toLowerCase().includes(m.toLowerCase())) + 1;
		} else {
			dateObj['month'] = dateParts[1];
		}
		dateObj['year'] = dateParts[2];
	} else if (dateParts.length === 2) {
		// Potential issue with parentheses e.g. (12th July 2000)
		// Month
		if (isNaN(parseInt(dateParts[0]))) {
			dateObj['month'] = months.findIndex((m) => dateParts[0].trim().toLowerCase().includes(m.toLowerCase())) + 1;
		} else {
			dateObj['month'] = dateParts[0];
		}
		dateObj['year'] = dateParts[1];
	}
	return dateObj;
};

const loadFacet = (facetId) => {

	resetFacet();

	$('.pdfDivPoint').forEach((p) => p.remove());

	const facet = currentCase.facets.find((f) => f.id == facetId);

	window.location.hash = facetId;

	if (facet.type == 'boolean') {
		facetBooleanHeadingDetails.style.display = 'block';
		facetDateHeading.style.display = 'none';
		facetBooleanHeading.innerText = facet.name;
		facetBooleanDescription.innerText = facet.description;
	} else {
		facetBooleanHeadingDetails.style.display = 'none';
		facetDateHeading.style.display = 'block';
		facetDateHeading.innerText = facet.name;
	}

	submitBooleanNo.onclick = async () => {
		saveFacet(facetId, false);
	};

	submitBooleanYes.onclick = async () => {
		saveFacet(facetId, true);
	};

	dateSubmitButton.onclick = async () => {
		if (dateYear.value) {
			saveFacet(facetId, [dateDay.value, dateMonth.value, dateYear.value]);
		}
	};

	dateNAButton.onclick = async () => {
		saveFacet(facetId, 'na');
	};

	dateUnsureButton.onclick = async () => {
		saveFacet(facetId, 'unsure');
	};

	submitBooleanNA.onclick = async () => {
		saveFacet(facetId, 'na');
	};

	submitBooleanUnsure.onclick = async () => {
		saveFacet(facetId, 'unsure');
	};

	const saveFacet = async (facetId, facetValue) => {
		const json = await fetch(`/api/human-refinement/cases/${currentCase.caseMeta.id}`, {
			method: 'POST',
			body: JSON.stringify({
				facetId,
				facetValue: facetValue !== 'unsure' && facetValue !== 'na' ? facetValue : null,
				type: facet.type,
				not_applicable: facetValue == 'na',
				unsure: facetValue == 'unsure',
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		}).then((r) => r.json());

		//$(`tr[data-facet='${facetId}'] td:nth-child(2)`).innerHTML = facetValue;

		facet.value = facetValue;
		facet.not_applicable = facetValue == 'na';
		facet.unsure = facetValue == 'unsure';
		facet.completedCount = parseInt(facet.completedCount) + 1;
		let nextFacetId;
		const nextFacet = $1('tr.active + tr', $caseFacetsTableBody);

		if (nextFacet) {
			nextFacetId = nextFacet.dataset.facet;
		}

		dateSubmit.value = '';
		dateDay.value = '';
		dateMonth.value = '';
		dateYear.value = '';

		if (nextFacetId) {
			loadFacet(nextFacetId);
		} else {
			refreshFacetTable(facetId);
		}
	};

	dateSubmit.onchange = () => {
		let day = '';
		let month = '';
		let year = '';

		if (dateSubmit.value) {
			const dateResult = extractDate(dateSubmit.value);
			day = dateResult.day;
			month = dateResult.month;
			year = dateResult.year;
		}

		dateDay.value = day;
		dateMonth.value = month;
		dateYear.value = year;
	};

	const pages = facet.type == 'boolean' ? booleanBoundingBoxes[facetId] : dateBoundingBoxes.boundingBoxes;

	const pdfViewWraps = processPages(pdfViewer, pages, 1.0, 'pdfDivPoint');

	const dates = [];

	pdfViewWraps.forEach((pointWrap) => {
		pointWrap.points.forEach((el) => {
			// Should be added to the wrap element at the first element's x,y
			if (pointWrap.wrap.dataset.option) {
				const button = document.createElement('button');
				button.onclick = function (value) {
					dateSubmit.value = value;
					dateSubmit.onchange();
				}.bind(null, pointWrap.wrap.dataset.option);
				button.innerHTML = `Select <strong>${pointWrap.wrap.dataset.option}</strong>`;
				const span = document.createElement('span');
				span.appendChild(button);
				el.appendChild(span);
				el.classList.add('hoverable');
				if (dates.indexOf(pointWrap.wrap.dataset.option) == -1) {
					dates.push(pointWrap.wrap.dataset.option);
				}
			}

			el.style.boxSizing = `content-box`;
			el.style.paddingBottom = '2px';
			el.style.borderBottom = `2px solid red`;
		});
	});

	const pdfMinimapElsWraps = processPages($pdfMinimapInner, pages, MINIMAP_SCALE, 'pdfDivPoint');

	pdfMinimapElsWraps.forEach((pointWrap) => {
		pointWrap.points.forEach((el) => {
			el.style.backgroundColor = `red`;
		});
	});

	if (facet.type === 'boolean') {
		submitBoolean.style.display = 'block';
		submitDate.style.display = 'none';
	} else {
		submitBoolean.style.display = 'none';
		submitDate.style.display = 'block';
		let option = document.createElement('option');
		option.value = '';
		option.text = '- Select -';
		dateSubmit.appendChild(option);

		// sort dates
		const datesArray = [];
		dates.forEach((textDate) => {
			let dateResult = extractDate(textDate);
			if (dateResult.day && dateResult.month && dateResult.year) {
				datesArray.push({
					formatted: new Date(dateResult.year, dateResult.month - 1, dateResult.day).toISOString(),
					text: textDate,
				});
			}
			if (!dateResult.day && dateResult.month && dateResult.year) {
				datesArray.push({ formatted: new Date(dateResult.year, dateResult.month - 1).toISOString(), text: textDate });
			}
			if (!dateResult.day && !dateResult.month && dateResult.year) {
				datesArray.push({ formatted: new Date(dateResult.year).toISOString(), text: textDate });
			}
		});

		datesArray.sort(function (a, b) {
			return new Date(a.formatted) - new Date(b.formatted);
		});

		datesArray.forEach((d) => {
			let option = document.createElement('option');
			option.value = d.text.trim();
			option.text = d.text.trim();
			dateSubmit.appendChild(option);
		});
	}

	refreshFacetTable(facetId);

	const goToPoint = (index) => {

		const newPos = pdfViewer.offsetHeight * index;

		const totalHeight = pdfState.pdfPages.reduce((a, b) => {
			return a + b.offsetHeight
		}, 0);
		
		if(newPos < totalHeight && newPos > 0) {
			pdfViewer.scrollTop = newPos;
			currentSelectedPos = index;
		} else if(newPos <= 0) {
			currentSelectedPos = 0;
			pdfViewer.scrollTop = 0;
		}
		
		
	};

	pdfPrev.onclick = () => {
		goToPoint(currentSelectedPos - 1);
	};

	pdfNext.onclick = () => {
		goToPoint(currentSelectedPos + 1);
	};

	//goToPoint(currentSelectedPos);
	pdfViewer.scrollTop = 0;
};

window.onload = async () => {
	$pdfLoadingPercent = $1('#pdfLoadingPercent');

	// Case facets elements
	$nextCase = $1('#nextCase');
	$currentCaseName = $1('#currentCaseName');
	$caseFacetsTable = $1('#caseFacets');
	$caseFacetsTableBody = $1('#caseFacets tbody');

	// Case search elements
	$pdfSearchBar = $1('#pdfSearchBar');
	$pdfSearchPrev = $1('#pdfSearchPrev');
	$pdfSearchNext = $1('#pdfSearchNext');
	$pdfSearchButton = $1('#pdfSearchBarToggle');
	$pdfSearchInput = $1('#pdfSearchBar input');

	// Generate case sets elements
	$generateDataSetForm = $1('#generateRandomDataSetForm');
	$closeCaseSetSettings = $1('#closeCaseSetSettings');
	$selectCaseFormList = $1('#selectCaseFormList');
	$selectCaseSetForm = $1('#selectCaseSetForm');
	$randomDataSetSize = $1('#randomDataSetSize');
	$generatingRandomDataSet = $1('#generatingRandomDataSet');

	// Case sidebar elements
	$casesTableBody = $1('#casesList tbody');
	$caseSetSettingsDialog = $1('#caseSetSettingsDialog');
	$caseSetSettingsButton = $1('#caseSetSettingsButton');

	// PDF Viewer
	$pdf = $1('#pdf');
	$pdfViewer = $1('#pdfViewer');
	$pdfViewerOuter = $1('#pdfViewerOuter');
	$pdfMinimapOuter = $1('#pdfMinimapOuter');
	$pdfMinimapInner = $1('#pdfMinimapInner');

	//---------------------------------------
	// Generate case sets
	//---------------------------------------

	$generateDataSetForm.onsubmit = async (e) => {
		e.preventDefault();
		if (!confirm('This will destroy previously generated case sets. No cases or facet answers will be lost.')) {
			return;
		}
		$generatingRandomDataSet.classList.add('active');
		await fetch('/api/human-refinement/case-sets', {
			method: 'POST',
			body: JSON.stringify({
				setSize: $randomDataSetSize.value,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		}).then((c) => c.json());
		window.location.assign('/human-refinement/');
	};

	//---------------------------------------
	// PDF search
	//---------------------------------------

	let currentSearchPos = -1;

	$pdfSearchButton.onclick = () => {
		$pdfSearchBar.classList.toggle('active');
		$pdfSearchInput.focus();
	};

	window.onkeydown = (event) => {
		if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 'f') {
			$pdfSearchBar.classList.toggle('active');
			$pdfSearchInput.focus();
		}
	};

	const goToSearchPoint = (index) => {
		searchResultsWraps.forEach((w) => w.wrap.classList.remove('active'));
		const newWrap = searchResultsWraps[index];
		newWrap.wrap.classList.add('active');
		const newPos = newWrap.points[0].offsetTop;
		$pdfViewer.scrollTop = newPos - 10 - $pdfSearchBar.offsetHeight;
		currentSearchPos = index;
	};

	$pdfSearchPrev.onclick = () => {
		if (currentSearchPos === 0) {
			return;
		}
		goToSearchPoint(currentSearchPos - 1);
	};

	$pdfSearchNext.onclick = () => {
		if (currentSearchPos === searchResultsWraps.length - 1) {
			return;
		}
		goToSearchPoint(currentSearchPos + 1);
	};

	let searchDebounce;

	$pdfSearchInput.onkeyup = async (e) => {
		clearTimeout(searchDebounce);

		if(e.keyCode == 27) {
			resetSearch();
		}

		searchDebounce = setTimeout(async () => {
			$('.searchDivPointWrap').forEach((p) => p.remove());

			if (!$pdfSearchInput.value) {
				return;
			}

			const searchResultsWithBoundingBoxes = await search($pdfSearchInput.value, currentCaseData);
			searchResultsWraps = processPages(pdfViewer, searchResultsWithBoundingBoxes.boundingBoxes, 1.0, 'searchDivPoint');

			searchResultsWraps.forEach((pointWrap) => {
				pointWrap.points.forEach((el) => {
					el.style.boxSizing = `content-box`;
					el.style.paddingBottom = '2px';
					el.style.paddingTop = '2px';
					el.style.paddingLeft = '2px';
					el.style.paddingRight = '2px';
					el.style.transform = `translate(-2px, -2px)`;
					el.style.backgroundColor = `#0000ff7a`;
				});
			});

			const pdfMinimapElsWraps = processPages(
				$pdfMinimapInner,
				searchResultsWithBoundingBoxes.boundingBoxes,
				MINIMAP_SCALE,
				'searchDivPoint'
			);
			pdfMinimapElsWraps.forEach((pointWrap) => {
				pointWrap.points.forEach((el) => {
					el.style.backgroundColor = `blue`;
				});
			});
		}, 500);

		if (e.keyCode === 13) {
			pdfSearchNext.click();
		}
	};

	//=======================================
	// Init sequence
	//=======================================

	//---------------------------------------
	// Load case sets
	//---------------------------------------

	const caseSets = await fetch('/api/human-refinement/case-sets').then((c) => c.json());
	let cases = [];

	const searchParams = new URLSearchParams(window.location.search);
	let caseSetId = searchParams.get('caseSetId');
	let caseId = searchParams.get('caseId');

	if (caseSets.length === 0) {
		$caseSetSettingsDialog.showModal();
		return;
	}

	caseSets.forEach((c, i) => {
		const option = document.createElement('option');
		option.value = c.id;
		option.text = `[${i + 1}] ${c.id}`;
		if (c.id == caseSetId) {
			option.selected = true;
		}
		$selectCaseFormList.appendChild(option);
	});

	$selectCaseSetForm.onsubmit = (e) => {
		e.preventDefault();
		window.location.assign(`?caseSetId=${$selectCaseFormList.value}`);
	};

	if (!caseSetId) {
		caseSetId = caseSets[0].id;
	}

	currentCaseSetId = caseSetId;

	const caseSetResult = await fetch('/api/human-refinement/case-sets/' + caseSetId).then((c) => c.json());
	cases = caseSetResult[0].case_set;

	//---------------------------------------
	// Cases sidebar
	//---------------------------------------
	if ($caseSetSettingsButton) {
		$caseSetSettingsButton.onclick = () => $caseSetSettingsDialog.showModal();
	}
	$closeCaseSetSettings.onclick = () => $caseSetSettingsDialog.close();

	cases.forEach((c) => {
		const tr = document.createElement('tr');
		$casesTableBody.appendChild(tr);
		tr.dataset.caseid = c.id;
		const caseNameTd = document.createElement('td');

		const link = document.createElement('a');
		link.href = `?caseSetId=${caseSetId}&caseId=${c.id}`;
		link.innerText = c.case_name;
		link.onclick = function (caseId, e) {
			e.preventDefault();
			loadCase(caseId);
		}.bind(null, c.id);
		caseNameTd.appendChild(link);
		tr.appendChild(caseNameTd);
	});

	if (!caseId) {
		caseId = cases[0].id;
	}

	//---------------------------------------
	// Load case
	//---------------------------------------

	// Constrain height first
	$pdfViewer.style.height = $pdfViewerOuter.offsetHeight + 'px';

	await loadCase(caseId);

	//---------------------------------------
	// PDF Viewer
	//---------------------------------------

	let isDraggingViewport = false;

	$pdfViewer.onscroll = function (e) {
		$pdfMinimapInner.style.transform = `translateY(-${pdfViewer.scrollTop * MINIMAP_SCALE}px)`;
	};

	$pdfMinimapOuter.style.width = $pdfViewer.getClientRects()[0].width * MINIMAP_SCALE + 'px';

	$pdfMinimapOuter.onclick = function (e) {
		if (isDraggingViewport) {
			return;
		}
		const startY = e.clientY - $pdfMinimapOuter.getClientRects()[0].top;
		const clickY = parseFloat(
			$pdfMinimapInner.style.transform ? $pdfMinimapInner.style.transform.match(/translateY\((.*)px/)[1] : 0
		);
		const calculatedY = -startY + clickY + 10;

		$pdfViewer.scrollTop = Math.abs(calculatedY) / MINIMAP_SCALE;
	};

	viewportNavigator = document.createElement('div');
	$pdfMinimapOuter.appendChild(viewportNavigator);
	viewportNavigator.classList.add('viewportNavigator');
	viewportNavigator.style.backgroundColor = 'rgba(0,0,0,0.2)';
	viewportNavigator.style.width = '100%';
	viewportNavigator.style.height = $pdfViewer.getClientRects()[0].height * MINIMAP_SCALE + 'px';
	viewportNavigator.style.position = 'absolute';
	viewportNavigator.style.top = 0;
	viewportNavigator.style.left = 0;
	viewportNavigator.style.zIndex = 4;

	let lastPos = null;
	// Add drag behaviour
	viewportNavigator.onmousedown = () => {
		isDraggingViewport = true;
		currentSelectedPos = -1;
		$pdfViewer.classList.add('dragging');
		document.body.style['user-select'] = 'none';

		document.body.onmousemove = (e) => {
			if (lastPos) {
				const delta = e.clientY - lastPos;

				$pdfViewer.scrollTop =
					$pdfViewer.scrollTop +
					(delta * viewportNavigator.offsetHeight) / MINIMAP_SCALE / (viewportNavigator.offsetHeight * MINIMAP_SCALE);
			}

			lastPos = e.clientY;
		};

		document.body.onmouseup = () => {
			$pdfViewer.classList.remove('dragging');
			document.body.style['user-select'] = 'auto';
			document.body.onmousemove = () => {};
			document.body.onmouseup = () => {};
			setTimeout(() => {
				isDraggingViewport = false;
				lastPos = null;
			}, 10);
		};
	};

	//---------------------------------------
	// Next Case handling
	//---------------------------------------
	$nextCase.onclick = () => {
		const nextCase = $casesTableBody.querySelector('tr.active + tr a');
		if (nextCase) {
			nextCase.click();
		} else {
			alert('End of cases for this case set');
		}
	};

	$1('#wrap.loading').classList.remove('loading');
};
