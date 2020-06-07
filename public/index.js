const MINIMAP_SCALE = 0.2;

const facetParserWorkers = [];
let facets = null;
let facetBoundingBoxes = {};

let currentFacetId;
let currentCase;
let isLastFacet;

let viewportNavigator;
let $caseFacetsTableBody;

const $ = (selector, context) => {
  const found = (context || document).querySelectorAll(selector);
  return found.length > 1 ? found : found[0];
};

const renderPDFCanvas = (attachToEl, viewport, page) => {
  

  let pdfCanvas = document.createElement('canvas');
  attachToEl.appendChild(pdfCanvas);
  let pdfContext = pdfCanvas.getContext('2d');
  pdfCanvas.style.display = "block";
  pdfCanvas.height = viewport.height;
  pdfCanvas.width = viewport.width;

  page.render({
    canvasContext: pdfContext,
    viewport: viewport
});

}

const loadPage = async (pageNumber, state) => {
  const page = await state.doc.getPage(pageNumber);

  var pdfViewport = page.getViewport({ scale: 1.0 });
  var pdfMinimapViewport = page.getViewport({ scale: MINIMAP_SCALE });

  renderPDFCanvas(state.pdfEl, pdfViewport, page);
  renderPDFCanvas(state.pdfMinimapEl, pdfMinimapViewport, page);

  if(state.pageWidth == -1) {
      state.pageWidth = pdfViewport.width;
      state.pageHeight = pdfViewport.height;
      state.docHeight = state.pageHeight * state.numPages;
  }

  return state;
};

const processPDF = async (pdfURL, pdfEl, pdfMinimapEl) => {
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
      numPages: doc.numPages
    };

  for (let i = 0; i < numPages; i++) {
    await loadPage(i + 1, state);
  }

  return state;
};

const addBoundingBoxes = (facetData) => {

  facetBoundingBoxes[facetData.id] = facetData.boundingBoxes;

}


const sendToWorkers = async (facetCase, caseData) => {

  return new Promise((resolve, reject) => {

    facetCase.facets.forEach(f => {

      const facetParserWorker = new Worker('facetTextParser.js');

      facetParserWorkers.push(facetParserWorker);

      const payload = {
        facetData: f,
        caseData
      }

      facetParserWorker.onmessage = function(e) {
        addBoundingBoxes(e.data);
        if(Object.keys(facetBoundingBoxes).length === facetCase.facets.length) {
          resolve()
        }
      }

      facetParserWorker.postMessage(JSON.stringify(payload));

    });

  });

}

const loadCaseData = async caseMetaData => {

  const json = await fetch(caseMetaData.pdfJSON).then(r => r.json());

  return json;

}

const loadCase = async caseId => {

  currentCase = await fetch(`/cases/${caseId}`).then(t => t.json());
  
  currentCaseData = await loadCaseData(currentCase.caseMeta);

  let isDraggingViewport = false;
  
  [workerResult, pdfState] = await Promise.all([
    sendToWorkers(currentCase, currentCaseData),
    processPDF(currentCase.caseMeta.pdfURL, pdfViewer, pdfMinimapInner)
  ]);

  pdfViewer.onscroll = function(e) {
    pdfMinimapInner.style.transform = `translateY(-${pdfViewer.scrollTop * MINIMAP_SCALE}px)`;
  }

  pdfMinimapOuter.onclick = function(e) {

    if(isDraggingViewport) {
      return;
    }
      
    const startY = e.clientY - pdfMinimapOuter.getClientRects()[0].top;
    const clickY = parseFloat(pdfMinimapInner.style.transform ? pdfMinimapInner.style.transform.match(/translateY\((.*)px/)[1] : 0);
    const calculatedY = -(startY) + clickY + 10;

    pdfViewer.scrollTop = Math.abs(calculatedY)/MINIMAP_SCALE;

  }

  viewportNavigator = document.createElement('div');
  pdfMinimapOuter.appendChild(viewportNavigator)
  viewportNavigator.classList.add("viewportNavigator")
  viewportNavigator.style.backgroundColor = "rgba(0,0,0,0.2)";
  viewportNavigator.style.width = "100%";
  viewportNavigator.style.height = (pdfViewer.getClientRects()[0].height * MINIMAP_SCALE) + "px";
  viewportNavigator.style.position = "absolute";
  viewportNavigator.style.top = 0;
  viewportNavigator.style.left = 0;
  viewportNavigator.style.zIndex = 4;
  
    let lastPos = 0;
    // Add drag behaviour
    viewportNavigator.onmousedown = () => {
      isDraggingViewport = true;
      pdfViewer.classList.add("dragging");
      
      document.body.onmousemove = (e) => {
        

          const delta = e.clientY - lastPos;
          
          pdfViewer.scrollTop = pdfViewer.scrollTop + (delta/MINIMAP_SCALE);

          
        lastPos = e.clientY
        
        
      }

      document.body.onmouseup = () => {
        
        pdfViewer.classList.remove("dragging");
        document.body.onmousemove = () => {}
        document.body.onmouseup = () => {}
        setTimeout(() => {
          isDraggingViewport = false;
        }, 10)
        
      }

    }

    
    

    $caseFacetsTableBody.innerHTML = null;

    currentCase.facets.forEach((facet, i) => {
      const tr = document.createElement("tr");
      const facetTd = document.createElement("td");
      const valueTd = document.createElement("td");

      tr.dataset.facet = facet.id;
      facetTd.innerHTML = facet.name;

      tr.appendChild(facetTd);
      tr.appendChild(valueTd);
      $caseFacetsTableBody.appendChild(tr);
    });

    loadFacet(findNextFacet());

    document.querySelector(".loading").classList.remove("loading");

};

window.onresize = () => {
  if(viewportNavigator) {
    viewportNavigator.style.height = (pdfViewer.getClientRects()[0].height * MINIMAP_SCALE) + "px";
  }
}

const findNextFacet = () => {
  return currentCase.facets.find(f => f.value == null).id;
}

const loadFacet = facetId => {
  
  const facet = currentCase.facets.find(f => f.id == facetId);

  let currentSelectedPos = -1;
  dateSubmit.innerHTML = "";

  if(facet.type == "boolean") {
    facetBooleanHeadingDetails.style.display = "block";
    facetDateHeading.style.display = "none";
    facetBooleanHeading.innerText = facet.name;
    facetBooleanDescription.innerText = facet.description;
  } else {
    facetBooleanHeadingDetails.style.display = "none";
    facetDateHeading.style.display = "block";
    facetDateHeading.innerText = facet.name;
  }

  submitBooleanNo.onclick = async () => {
    saveFacet(facetId, false);
  };

  submitBooleanYes.onclick = async () => {
    saveFacet(facetId, true);
  };

  dateSubmitButton.onclick = async () => {
    saveFacet(facetId, dateSubmit.value);
  }

  saveFacet = async (facetId, facetValue) => {
    const json = await fetch(`/cases/${currentCase.caseMeta.id}`, {
      method: 'POST',
      body: JSON.stringify({
        facetId,
        facetValue,
        type: facet.type
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(r => r.json());

    //$(`tr[data-facet='${facetId}'] td:nth-child(2)`).innerHTML = facetValue;

    facet.value = facet.type == "date" ? new Date(facetValue).toISOString() : facetValue;

    loadFacet(findNextFacet());

  }

  Array.from($(".pdfDivPoint") || []).forEach(p => p.remove())

  const pages = facetBoundingBoxes[facetId];

  const processPages = (el, pages, scale) => {

    const els = [];

    pages.forEach((page, pageI) => {

      const offset = (Math.floor(pdfState.pageHeight) * scale) * pageI;
      
      page.forEach(p => {
  
        const pdfDivPoint = document.createElement("div");
        pdfDivPoint.classList.add('pdfDivPoint');
        pdfDivPoint.style.position = "absolute";
        pdfDivPoint.style.left = (p.boxes[0] * scale) + "px";
        pdfDivPoint.style.top = (offset + (p.boxes[1] * scale)) + "px";
        pdfDivPoint.style.width = ((p.boxes[2] - p.boxes[0]) * scale) + "px";
        pdfDivPoint.style.height = ((p.boxes[5] - p.boxes[1]) * scale) + "px";
        
        if(p.optionValue) {
          pdfDivPoint.dataset.option = p.optionValue;
        }
        
        els.push(pdfDivPoint)
        el.appendChild(pdfDivPoint)
  
      });
  
    });

    return els;

  }

  const pdfViewEls = processPages(pdfViewer, pages, 1.0);

  pdfViewEls.forEach(el => {
    
    if(el.dataset.option) {

      const button = document.createElement('button');
      button.onclick = saveFacet.bind(null, facetId, el.dataset.option);
      button.innerHTML = `Set facet as <strong>${el.dataset.option}</strong>`;
      const span = document.createElement('span');
      span.appendChild(button);
      el.appendChild(span);
      el.classList.add("hoverable");
    }
    el.style.boxSizing = `content-box`;
    el.style.paddingBottom = "2px";
    el.style.borderBottom = `2px solid red`;
  });
  
  const pdfMinimapEls = processPages(pdfMinimapInner, pages, MINIMAP_SCALE);

  pdfMinimapEls.forEach(el => {
    el.style.backgroundColor = `red`;
  })

  if(facet.type === "boolean") {
    submitBoolean.style.display = "block";
    submitDate.style.display = "none";
  } else {
    submitBoolean.style.display = "none";
    submitDate.style.display = "block";
    const dateOptions = [...new Set(pdfViewEls.map(el => el.dataset.option))];
    dateOptions.forEach(d => {
      let option = document.createElement('option');
        option.value = d;
        option.text = d;
        dateSubmit.appendChild(option)
    })
  }

  Array.from($caseFacetsTableBody.querySelectorAll("tr")).forEach(tr => {
    const valueTd = $("td:last-child", tr);
    const buttonSet = document.createElement("button");

    valueTd.innerHTML = null;

    if (tr.dataset.facet == facetId) {
      tr.classList.add("active");
      valueTd.appendChild(buttonSet);
      buttonSet.disabled = true;
      buttonSet.innerText = "In progress";
    } else {
      tr.classList.remove("active");

      const rowFacet = currentCase.facets.find(f => f.id == tr.dataset.facet);
      
      if (rowFacet && rowFacet.value != null) {
        if(rowFacet.type == "date") {
          const rowDate = new Date(rowFacet.value);
          valueTd.innerText = rowDate.getDate() + "-" + (rowDate.getMonth() + 1) + "-" + rowDate.getFullYear();

        } else {
          valueTd.innerText = rowFacet.value === true ? "✔" : "✘";
        }
      } else {
        valueTd.appendChild(buttonSet);
        buttonSet.innerText = "Select";
        buttonSet.onclick = loadFacet.bind(null, tr.dataset.facet);
      }
    }
  });

  const goToPoint = (index) => {
      
    const newPos = pdfViewEls[index].offsetTop;
    pdfViewer.scrollTop = newPos - 10;
    currentSelectedPos = index;

  }
  
  pdfPrev.onclick = () => {
    if(currentSelectedPos === 0) {
      return;
    }
    goToPoint(currentSelectedPos - 1);
  }

  pdfNext.onclick = () => {
    if(currentSelectedPos === pdfViewEls.length - 1) {
      return;
    }
    goToPoint(currentSelectedPos + 1);
  }

  //goToPoint(currentSelectedPos);
  pdfViewer.scrollTop = 0;


};


window.onload = async () => {
  
  $caseFacetsTableBody = $("#case-facets tbody");
  $facetSelection = $("main");
  
  const cases = await fetch("/cases").then(c => c.json());

  const searchParams = new URLSearchParams(window.location.search);
  let caseId = searchParams.get("caseId");

  if (!caseId) {
    caseId = cases[0].id;
    history.pushState(null, null,`?caseId=${caseId}`)
  }

  await loadCase(caseId);

  $casesTableBody = $("#casesList tbody");

  cases.forEach(c => {

    const tr = document.createElement("tr");
    if(caseId == c.id) {
      tr.classList.add("active")
    }
    $casesTableBody.appendChild(tr);
    const caseNameTd = document.createElement("td");
    caseNameTd.innerHTML = `<a href="?caseId=${c.id}">${c.case_name}</a>`;
    tr.appendChild(caseNameTd);
    const processedCountTd = document.createElement("td");
    processedCountTd.innerText = 0;
    tr.appendChild(processedCountTd);

  })

  
};
