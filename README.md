# OpenLaw NZ Research
This software faciliates analysis of case law data at scale, by facilitating fast and efficient manual data extraction from case law, and enablinhg the export of case law data (both manually and autonomously extracted) in a machine-readable format.

This software is proof of concept.

## Prerequisites

You must have the following installed:

- Node & NPM

Make a `.env` file in the root directory, with the variables in `.env.sample`. 

- Database must be in schema from /openlawnz-database/.

- PDF_JSON_BASE_PATH is the path where the interface will look for OCR'd PDF files in JSON format. Data must be from  Azure Cognitive Services Vision 3.0 preview. This data provides the text of each case, and the location of each word on each page.

- PDF_BASE_PATH is where the PDFs will be loaded from for display.


## Installation and Use

Install 

    npm install

Run (locally)

    npm run dev

Visit: http://localhost:8082

## Details

The OpenLaw NZ research interface has two primary functions.

### Human Refinement Centre

The human refinement centre is where humans can manually review case law and add data facets to the database.

The interface has three panels.

The left side panel shows a list of ACC cases, grouped into case sets. Case sets are all ACC cases (all cases with category "ACC") sorted randomly into groups of X, when a user clicks "Seetings" and enters a group size. This is a global, and the same sets are available to any logged-in user (if one user re-generates the sets, it will apply to all other users). A user can choose which case set, and which case, to view.

The middle panel displays the case and a minimap. It highlights words and phrases relevant to each data facet, or all discoverable dates (if the data facet is a date). The words and phrases are loaded from the database.

The right panel allows a user to choose which facet to look at and enter data for. Clicking "select" will choose that facet and highlight the relevant words or phrases in the case view.

### Export

The export view allows users to:

- Choose a data source by category, date, or case set
- For cases in the data source, choose which data to export
- Generate custom boolean (true/false) data for the presence of absence of words or phrases in the case text
- Export the data in CSV or JSON format.

