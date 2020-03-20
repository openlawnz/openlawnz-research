const $ = (selector, context) => {
  const found = (context || document).querySelectorAll(selector);
  return found.length > 1 ? found : found[0];
};

const BasicCarousel = function() {};

BasicCarousel.prototype.init = function(slides, $mountNode, { cycle, onSlideChange, getPaginationButtonsValues }) {
  this.$carouselContent = $(".carousel-content p", $mountNode);
  this.$carouselPrevButton = $(".carousel-prev", $mountNode);
  this.$carouselNextButton = $(".carousel-next", $mountNode);
  this.$carouselPagination = $(".carousel-pagination", $mountNode);

  this.slides = slides;
  this.paginationButtons = [];
  this.currentSlideIndex = 0;
  this.cycle = cycle;
  this.onSlideChange = onSlideChange || function() {};
  this.getPaginationButtonsValues = getPaginationButtonsValues;

  // Set pagination
  slides.forEach((slide, i) => {
    const paginationButton = document.createElement("button");
    if (!getPaginationButtonsValues) {
      paginationButton.innerText = i + 1;
    }

    paginationButton.onclick = this.loadSlide.bind(this, i);
    this.paginationButtons.push(paginationButton);
    this.$carouselPagination.appendChild(paginationButton);
  });

  if (this.$carouselPrevButton) {
    this.$carouselPrevButton.onclick = this.previousNext.bind(this, -1);
  }
  if (this.$carouselNextButton) {
    this.$carouselNextButton.onclick = this.previousNext.bind(this, +1);
  }

  this.loadSlide(this.currentSlideIndex);
};

BasicCarousel.prototype.renderCarouselSlide = function(slide) {
  this.$carouselContent.innerHTML = slide.text.replace(slide.highlight, `<span>${slide.highlight}</span>`);
};

BasicCarousel.prototype.loadSlide = function(i) {
  this.renderCarouselSlide(this.slides[i]);
  this.onSlideChange(this.slides[i]);

  if (this.$carouselPrevButton) {
    this.$carouselPrevButton.disabled = false;
  }
  if (this.$carouselPrevButton) {
    this.$carouselPrevButton.disabled = false;
  }
 

  if (i === 0 && !this.cycle && this.$carouselPrevButton) {
    this.$carouselPrevButton.disabled = true;
  } else if (i === this.slides.length - 1 && !this.cycle && this.$carouselPrevButton) {
    this.$carouselNextButton.disabled = true;
  }

  this.paginationButtons.forEach((b, bi) => {
    if (bi === i) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }

    if (this.getPaginationButtonsValues) {
      this.getPaginationButtonsValues(b, bi);
    }
  });
  this.currentSlideIndex = i;
};

BasicCarousel.prototype.previousNext = function(i) {
  let newSlideIndex = this.currentSlideIndex + i;
  if (newSlideIndex === this.slides.length) {
    newSlideIndex = this.cycle ? 0 : this.slides.length - 1;
  } else if (newSlideIndex === -1) {
    newSlideIndex = this.cycle ? this.slides.length - 1 : 0;
  }
  this.loadSlide(newSlideIndex);
};

const DateFacet = function() {};

DateFacet.prototype.init = function(facet, $mountNode, saveFacet, isLastFacet) {
  const facetTemplate = document.getElementById("date-facet-template").content;

  $mountNode.appendChild(facetTemplate.cloneNode(true));

  const $facetAcceptButton = $(".facet-accept-button", $mountNode);
  const $facetTitle = $("h2 span", $mountNode);
  const $currentOptionValue = $(".current-option-value", $mountNode);

  $facetTitle.innerText = facet.name;

  $facetAcceptButton.innerText = "Accept";

  $facetAcceptButton.onclick = saveFacet;

  this.carousel.init(facet.options, $mountNode, {
    cycle: true,
    onSlideChange: currentOption => {
      // Load the answer

      $currentOptionValue.innerText = currentOption.highlight;
    }
  });
};

DateFacet.prototype.carousel = new BasicCarousel();

//----------------------------------------
// Boolean Facet
//----------------------------------------

const BooleanFacet = function() {};

BooleanFacet.prototype.init = function(facet, $mountNode, saveFacet, isLastFacet) {
  const facetTemplate = document.getElementById("boolean-facet-template").content;

  $mountNode.appendChild(facetTemplate.cloneNode(true));

  this.$facetAcceptButtons = $(".facet-accept-buttons button", $mountNode);
  this.facet = facet;
  this.slideAnswers = {};

  const $facetTitle = $("h2 span", $mountNode);
  const $facetSlideValueButtons = $(".facet-value-buttons button", $mountNode);

  $facetSlideValueButtons.forEach(b => {
    b.onclick = function() {
      this.slideAnswers[this.carousel.currentSlideIndex] = b.dataset.value;

      if (!this.slideAnswers[this.carousel.currentSlideIndex + 1]) {
        this.carousel.previousNext(+1);
      } else {
        this.carousel.loadSlide(this.carousel.currentSlideIndex);
      }
    }.bind(this);
  });

  this.$facetAcceptButtons.forEach(b => {
    b.onclick = function() {
      saveFacet({ overall: b.dataset.value === "Yes", answers: this.slideAnswers });
    }.bind(this);
  });

  $facetTitle.innerText = facet.name;

  this.carousel.init(facet.options, $mountNode, {
    cycle: false,
    onSlideChange: currentOption => {
      this.refreshSubmitButtons();
    },
    getPaginationButtonsValues: (button, buttonIndex) => {
      const currentSlideAnswer = this.slideAnswers[buttonIndex];
      let buttonText = "?";
      if (currentSlideAnswer) {
        if (currentSlideAnswer == "Yes") {
          buttonText = "✓";
        } else if (currentSlideAnswer === "N/A") {
          buttonText = "N/A";
        } else {
          buttonText = "x";
        }
      }
      button.innerText = buttonText;
    }
  });
};

BooleanFacet.prototype.refreshSubmitButtons = function() {
  if (Object.keys(this.slideAnswers).length === this.facet.options.length) {
    this.$facetAcceptButtons.forEach(b => {
      b.disabled = false;
    });
  } else {
    this.$facetAcceptButtons.forEach(b => {
      b.disabled = true;
    });
  }
};

BooleanFacet.prototype.carousel = new BasicCarousel();

window.onload = () => {
  const $caseFacetsTableBody = $("#case-facets tbody");
  const $facetSelection = $("main");

  let currentFacetId;
  let currentCase;
  let isLastFacet;

  const renderFacet = isLastFacet => {
    const facet = currentCase.facets.find(f => f.id == currentFacetId);
    $facetSelection.innerHTML = null;

    // Choose the control
    if (facet.type === "date") {
      new DateFacet().init(facet, $facetSelection, saveFacet, isLastFacet);
    } else {
      new BooleanFacet().init(facet, $facetSelection, saveFacet, isLastFacet);
    }

    // Set active row

    Array.from($caseFacetsTableBody.querySelectorAll("tr")).forEach(tr => {
      const valueTd = $("td:last-child", tr);
      const buttonSet = document.createElement("button");

      valueTd.innerHTML = null;

      if (tr.dataset.facet == facet.id) {
        tr.classList.add("active");
        valueTd.appendChild(buttonSet);
        buttonSet.disabled = true;
        buttonSet.innerText = "In progress";
      } else {
        tr.classList.remove("active");

        const rowFacet = currentCase.facets.find(f => f.id == tr.dataset.facet);

        if (rowFacet && rowFacet.value != null) {
          valueTd.innerText = rowFacet.value;
        } else {
          valueTd.appendChild(buttonSet);
          buttonSet.innerText = "Set";
          buttonSet.onclick = function(facetId) {
            currentFacetId = facetId;
            renderFacet(isLastFacet);
          }.bind(null, tr.dataset.facet);
        }
      }
    });
  };

  const saveFacet = (facetId, optionValue) => {
    // Patch
    fetch("/save-facet", {
      method: "PATCH", // or 'PUT'
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(optionValue)
    })
      .then(t => t.json())
      .then(savedCase => {
        currentCase = savedCase;

        // Get the next facet
        const remainingFacets = currentCase.facets.filter(f => !f.value);
        if (remainingFacets.length > 0) {
          currentFacetId = remainingFacets[0].id;
        }
        if (remainingFacets.length === 1) {
          isLastFacet = true;
        }

        renderCase();
      });
  };

  const renderCase = () => {
    $caseFacetsTableBody.innerHTML = null;

    if (!currentFacetId) {
      currentFacetId = currentCase.facets[0].id;
    }

    currentCase.facets.forEach((facet, i) => {
      const tr = document.createElement("tr");
      const facetTd = document.createElement("td");
      const valueTd = document.createElement("td");

      tr.dataset.facet = facet.id;
      facetTd.innerText = facet.name;

      tr.appendChild(facetTd);
      tr.appendChild(valueTd);
      $caseFacetsTableBody.appendChild(tr);
    });

    renderFacet(isLastFacet);
  };

  const loadCase = caseId => {
    fetch("/case")
      .then(t => t.json())
      .then(t => {
        document.querySelector(".loading").classList.remove("loading");
        currentCase = t;
        renderCase();
      });
  };

  const searchParams = new URLSearchParams(window.location.search);
  const caseId = searchParams.get("caseId");

  if (caseId) {
    loadCase(caseId);
  } else {
    alert("No case id");
  }
};
