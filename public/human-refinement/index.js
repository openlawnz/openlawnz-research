import pdfControl from '../global/pdfControl.js';
import { $ } from '../global/utilities.js';

const MINIMAP_SCALE = 0.2;

const facetParserWorkers = {};
let isLoading = false;
let pdfState;
let searchResults;
let booleanBoundingBoxes = {};
let dateBoundingBoxes = {};

let currentCaseSetId;
let currentCaseData;
let currentCase;

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

const search = async (searchQuery, caseData) => {
	return new Promise((resolve) => {

		let facetParserWorker;

		if(facetParserWorkers['search']) {
			facetParserWorker = facetParserWorkers['search'];
		} else {
			facetParserWorker = new Worker('/global/pdfTextWorker.js');
			facetParserWorkers['search'] = facetParserWorker;
		}

		const payload = {
			facetData: {
				id: 'search',
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

		if(facetParserWorkers['date']) {
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

			if(facetParserWorkers[f.id]) {
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

	Array.from($casesTableBody.querySelectorAll('tr')).forEach((tr) => {
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

	[dateFacetResult, booleanFacetResult, pdfState] = await Promise.all([
		runDateFacetWorkers(dateFacets, currentCaseData),
		runBooleanFacetWorkers(booleanFacets, currentCaseData),
		pdfControl(currentCase.caseMeta.pdfURL, $pdfViewer, $pdfMinimapInner, MINIMAP_SCALE),
	]);

	$caseFacetsTableBody.innerHTML = null;

	currentCase.facets.forEach((facet, i) => {
		const tr = document.createElement('tr');
		const facetTd = document.createElement('td');
		const valueTd = document.createElement('td');
		const actionTd = document.createElement('td');
		const completedTd = document.createElement('td');

		const buttonSet = document.createElement('button');
		actionTd.appendChild(buttonSet);
		buttonSet.innerText = 'Select';
		buttonSet.onclick = loadFacet.bind(null, facet.id);

		tr.dataset.facet = facet.id;
		facetTd.innerHTML = facet.name;
		completedTd.innerHTML = facet.completedCount;

		tr.appendChild(facetTd);
		tr.appendChild(valueTd);
		tr.appendChild(actionTd);
		tr.appendChild(completedTd);
		$caseFacetsTableBody.appendChild(tr);
	});

	if (window.location.hash) {
		loadFacet(window.location.hash.split('#')[1]);
	} else {
		const nextFacetId = findNextFacet();

		if (nextFacetId) {
			loadFacet(nextFacetId);
		} else {
			refreshFacetTable();
		}
	}

	$caseFacetsTable.classList.remove('loading');
	$pdf.classList.remove('loading');
	$currentCaseName.innerText = currentCase.caseMeta.caseName;

	isLoading = false;
};

window.onresize = () => {
	if (viewportNavigator) {
		viewportNavigator.style.height = pdfViewer.getClientRects()[0].height * MINIMAP_SCALE + 'px';
	}
};

const findNextFacet = () => {
	const nextFacet = currentCase.facets.find((f) => f.value == null && f.not_applicable == null);
	return nextFacet ? nextFacet.id : null;
};

const refreshFacetTable = (facetId) => {
	Array.from($caseFacetsTableBody.querySelectorAll('tr')).forEach((tr) => {
		const rowFacet = currentCase.facets.find((f) => f.id == tr.dataset.facet);
		const valueTd = $('td:nth-child(2)', tr);
		const completedTd = $('td:nth-child(4)', tr);

		valueTd.innerHTML = null;
		completedTd.innerHTML = rowFacet.completedCount;

		if (tr.dataset.facet == facetId) {
			tr.classList.add('active');
		} else {
			tr.classList.remove('active');
		}
		if (rowFacet && rowFacet.value != null) {
			if (rowFacet.type == 'date') {
				let dateStr = `${rowFacet.value[0] ? rowFacet.value[0] + '-' : ''}${months[rowFacet.value[1] - 1]}-${
					rowFacet.value[2]
				}`;

				valueTd.innerText = dateStr;
			} else {
				valueTd.innerText = rowFacet.value === true ? '✔' : '✘';
			}
		} else if (rowFacet.not_applicable) {
			valueTd.innerText = 'N/A';
		}
	});
};

const processPages = (el, pages, scale, cssClass) => {
	const els = [];

	pages.forEach((page, pageI) => {
		const offset = Math.floor(pdfState.pageHeight) * scale * pageI;

		page.forEach((p) => {
			const pdfDivPoint = document.createElement('div');
			pdfDivPoint.classList.add(cssClass);
			pdfDivPoint.style.position = 'absolute';
			pdfDivPoint.style.left = p.boxes[0] * scale + 'px';
			pdfDivPoint.style.top = offset + p.boxes[1] * scale + 'px';
			pdfDivPoint.style.width = (p.boxes[2] - p.boxes[0]) * scale + 'px';
			pdfDivPoint.style.height = (p.boxes[5] - p.boxes[1]) * scale + 'px';

			if (p.optionValue) {
				pdfDivPoint.dataset.option = p.optionValue;
			}

			els.push(pdfDivPoint);
			el.appendChild(pdfDivPoint);
		});
	});

	return els;
};

const loadFacet = (facetId) => {

	Array.from($('.pdfDivPoint') || []).forEach((p) => p.remove());

	dateSubmit.value = '';
	dateDay.value = '';
	dateMonth.value = '';
	dateYear.value = '';

	const facet = currentCase.facets.find((f) => f.id == facetId);

	window.location.hash = facetId;

	let currentSelectedPos = -1;
	dateSubmit.innerHTML = '';

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
		saveFacet(facetId, [dateDay.value, dateMonth.value, dateYear.value]);
	};

	dateNAButton.onclick = async () => {
		saveFacet(facetId, null);
	};

	submitBooleanNA.onclick = async () => {
		saveFacet(facetId, null);
	};

	const saveFacet = async (facetId, facetValue) => {
		const json = await fetch(`/api/human-refinement/cases/${currentCase.caseMeta.id}`, {
			method: 'POST',
			body: JSON.stringify({
				facetId,
				facetValue,
				type: facet.type,
				not_applicable: facetValue == null,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		}).then((r) => r.json());
	
		//$(`tr[data-facet='${facetId}'] td:nth-child(2)`).innerHTML = facetValue;
	
		facet.value = facetValue;
		facet.not_applicable = facetValue == null;
		facet.completedCount = parseInt(facet.completedCount) + 1;
		const nextFacetId = findNextFacet();
	
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
			const dateParts = dateSubmit.value.split(/\s+/g);

			if (dateParts.length === 3) {
				day = dateParts[0];
				console.log(parseInt(dateParts[1]));
				// Month
				if (isNaN(parseInt(dateParts[1]))) {
					month = months.findIndex((m) => dateParts[1].trim().toLowerCase().includes(m.toLowerCase())) + 1;
				} else {
					month = dateParts[1];
				}

				year = dateParts[2];
			} else if (dateParts.length === 2) {
				// Potential issue with parentheses e.g. (12th July 2000)
				// Month
				if (isNaN(parseInt(dateParts[0]))) {
					month = months.findIndex((m) => dateParts[0].trim().toLowerCase().includes(m.toLowerCase())) + 1;
				} else {
					month = dateParts[0];
				}

				year = dateParts[1];
			} else {
				// Invalid date
				return;
			}
		}

		dateDay.value = day;
		dateMonth.value = month;
		dateYear.value = year;
	};

	const pages = facet.type == 'boolean' ? booleanBoundingBoxes[facetId] : dateBoundingBoxes.boundingBoxes;

	const pdfViewEls = processPages(pdfViewer, pages, 1.0, 'pdfDivPoint');

	pdfViewEls.forEach((el) => {
		if (el.dataset.option) {
			const button = document.createElement('button');
			button.onclick = function (value) {
				dateSubmit.value = value;
				dateSubmit.onchange();
			}.bind(null, el.dataset.option.trim());
			button.innerHTML = `Select <strong>${el.dataset.option}</strong>`;
			const span = document.createElement('span');
			span.appendChild(button);
			el.appendChild(span);
			el.classList.add('hoverable');
		}
		el.style.boxSizing = `content-box`;
		el.style.paddingBottom = '2px';
		el.style.borderBottom = `2px solid red`;
	});

	const pdfMinimapEls = processPages($pdfMinimapInner, pages, MINIMAP_SCALE, 'pdfDivPoint');

	pdfMinimapEls.forEach((el) => {
		el.style.backgroundColor = `red`;
	});

	if (facet.type === 'boolean') {
		submitBoolean.style.display = 'block';
		submitDate.style.display = 'none';
	} else {
		submitBoolean.style.display = 'none';
		submitDate.style.display = 'block';
		const dateOptions = [...new Set(pdfViewEls.map((el) => el.dataset.option))];
		let option = document.createElement('option');
		option.value = '';
		option.text = '- Select -';
		dateSubmit.appendChild(option);
		dateOptions.forEach((d) => {
			let option = document.createElement('option');
			option.value = d.trim();
			option.text = d.trim();
			dateSubmit.appendChild(option);
		});
	}

	refreshFacetTable(facetId);

	const goToPoint = (index) => {
		const newPos = pdfViewEls[index].offsetTop;
		pdfViewer.scrollTop = newPos - 10;
		currentSelectedPos = index;
	};

	pdfPrev.onclick = () => {
		if (currentSelectedPos === 0) {
			return;
		}
		goToPoint(currentSelectedPos - 1);
	};

	pdfNext.onclick = () => {
		if (currentSelectedPos === pdfViewEls.length - 1) {
			return;
		}
		goToPoint(currentSelectedPos + 1);
	};

	//goToPoint(currentSelectedPos);
	pdfViewer.scrollTop = 0;
};

window.onload = async () => {
	// Case facets elements
	$nextCase = $('#nextCase');
	$currentCaseName = $('#currentCaseName');
	$caseFacetsTable = $('#caseFacets');
	$caseFacetsTableBody = $('#caseFacets tbody');

	// Case search elements
	$pdfSearchBar = $('#pdfSearchBar');
	$pdfSearchPrev = $('#pdfSearchPrev');
	$pdfSearchNext = $('#pdfSearchNext');
	$pdfSearchButton = $('#pdfSearchBarToggle');
	$pdfSearchInput = $('#pdfSearchBar input');

	// Generate case sets elements
	$generateDataSetForm = $('#generateRandomDataSetForm');
	$closeCaseSetSettings = $('#closeCaseSetSettings');
	$selectCaseFormList = $('#selectCaseFormList');
	$selectCaseSetForm = $('#selectCaseSetForm');
	$randomDataSetSize = $('#randomDataSetSize');
	$generatingRandomDataSet = $('#generatingRandomDataSet');

	// Case sidebar elements
	$casesTableBody = $('#casesList tbody');
	$caseSetSettingsDialog = $('#caseSetSettingsDialog');
	$caseSetSettingsButton = $('#caseSetSettingsButton');

	// PDF Viewer
	$pdf = $('#pdf');
	$pdfViewer = $('#pdfViewer');
	$pdfViewerOuter = $('#pdfViewerOuter');
	$pdfMinimapOuter = $('#pdfMinimapOuter');
	$pdfMinimapInner = $('#pdfMinimapInner');

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
		const newPos = searchResults[index].offsetTop;
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
		if (currentSearchPos === searchResults.length - 1) {
			return;
		}
		goToSearchPoint(currentSearchPos + 1);
	};

	let searchDebounce;

	$pdfSearchInput.onkeyup = async (e) => {
		clearTimeout(searchDebounce);

		// if(e.keyCode == 27) {
		//   $pdfSearchInput.classList.toggle('active');
		//   $pdfSearchInput.blur();
		// }

		searchDebounce = setTimeout(async () => {
			Array.from($('.searchDivPoint') || []).forEach((p) => p.remove());

			if (!$pdfSearchInput.value) {
				return;
			}

			const searchResultsWithBoundingBoxes = await search($pdfSearchInput.value, currentCaseData);
			searchResults = processPages(pdfViewer, searchResultsWithBoundingBoxes.boundingBoxes, 1.0, 'searchDivPoint');

			searchResults.forEach((el) => {
				el.style.boxSizing = `content-box`;
				el.style.paddingBottom = '2px';
				el.style.paddingTop = '2px';
				el.style.paddingLeft = '2px';
				el.style.paddingRight = '2px';
				el.style.transform = `translate(-2px, -2px)`;
				el.style.backgroundColor = `#0000ff7a`;
			});

			const pdfMinimapEls = processPages(
				$pdfMinimapInner,
				searchResultsWithBoundingBoxes.boundingBoxes,
				MINIMAP_SCALE,
				'searchDivPoint'
			);

			pdfMinimapEls.forEach((el) => {
				el.style.backgroundColor = `blue`;
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

	const caseSets = await fetch('/api/human-refinement/cases-sets').then((c) => c.json());
	let cases = [];

	const searchParams = new URLSearchParams(window.location.search);
	let caseSetId = searchParams.get('caseSetId');
	let caseId = searchParams.get('caseId');

	if (caseSets.length === 0) {
		$caseSetSettingsDialog.showModal();
		return;
	}

	caseSets.forEach((c) => {
		const option = document.createElement('option');
		option.value = c.id;
		option.text = c.id;
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

	const caseSetResult = await fetch('/api/human-refinement/cases-sets/' + caseSetId).then((c) => c.json());
	cases = caseSetResult[0].case_set;

	//---------------------------------------
	// Cases sidebar
	//---------------------------------------

	$caseSetSettingsButton.onclick = () => $caseSetSettingsDialog.showModal();

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
		$pdfViewer.classList.add('dragging');

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
		if(nextCase) {
			nextCase.click();
		} else {
			alert('End of cases for this case set');
		}
	}

	$('#wrap.loading').classList.remove('loading');
};
